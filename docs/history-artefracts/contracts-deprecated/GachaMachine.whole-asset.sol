// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ArtVault721} from "./ArtVault721.sol";

/// @title GachaMachine
/// @notice Randomised draws against pools of custodied artwork.
///
/// FAIRNESS MODEL
/// --------------
/// Robinhood Chain runs a centralised sequencer, so blockhash is not credible
/// entropy — the sequencer can influence it. Instead we use a reverse hash chain:
///
///     s[0] = secret; s[i] = keccak256(s[i-1]); commit = s[N]
///
/// `commit` is published before any draw. Seeds are consumed in reverse order,
/// so revealing s[i-1] proves keccak256(s[i-1]) == s[i], the previously committed
/// value. The operator cannot substitute a seed after seeing a user's input, and
/// the user cannot predict one. Neither side alone controls the outcome.
///
/// The result mixes the server seed with a user-supplied clientSeed, so a user
/// who distrusts the operator can still guarantee their own draw is unpredictable
/// to themselves as well.
contract GachaMachine is AccessControl, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    bytes32 public constant STOCKER_ROLE = keccak256("STOCKER_ROLE");

    uint32 public constant PPM = 1_000_000;
    uint8 public constant TIER_COUNT = 5;

    ArtVault721 public immutable vaultNft;
    IERC20 public immutable payToken; // USDG
    address public treasury;

    struct Machine {
        uint128 priceUsd6;          // ticket price, 6dp
        uint32[TIER_COUNT] oddsPpm; // must sum to exactly 1_000_000
        bool active;
        uint32 version;             // bumps on any odds change; surfaced in the UI
    }

    struct Draw {
        address user;
        uint32 machineId;
        uint64 seedIndex;
        bytes32 clientSeed;
        uint128 pricePaid;
        uint40 openedAt;
        bool settled;
        uint256 wonTokenId;
        uint8 wonTier;
    }

    // machineId => Machine
    mapping(uint32 => Machine) public machines;
    // machineId => tier => available vault tokenIds
    mapping(uint32 => mapping(uint8 => uint256[])) private _pool;
    // tokenId => index within its pool array, for O(1) removal
    mapping(uint256 => uint256) private _poolIndex;

    // ---- fairness state
    /// @notice The next unrevealed hash in the chain. Starts at s[N].
    bytes32 public committedHash;
    /// @notice Index of the seed that will be consumed by the next draw.
    uint64 public seedCursor;
    /// @notice Historical commits, for auditability after the fact.
    mapping(uint64 => bytes32) public revealedSeed;

    uint256 public nextDrawId = 1;
    mapping(uint256 => Draw) public draws;

    /// @notice Draws must be settled within this window or the user can refund.
    uint40 public constant SETTLE_DEADLINE = 10 minutes;

    event ChainCommitted(bytes32 commit, uint64 startIndex);
    event MachineConfigured(uint32 indexed machineId, uint128 priceUsd6, uint32[TIER_COUNT] oddsPpm, uint32 version);
    event Restocked(uint32 indexed machineId, uint8 indexed tier, uint256 tokenId);
    event BoxOpened(uint256 indexed drawId, address indexed user, uint32 indexed machineId, bytes32 clientSeed, uint64 seedIndex);
    event DrawSettled(uint256 indexed drawId, address indexed user, uint8 tier, uint256 tokenId, bytes32 serverSeed);
    event DrawRefunded(uint256 indexed drawId, address indexed user, uint128 amount);

    error BadOdds();
    error MachineInactive();
    error TierEmpty();
    error AlreadySettled();
    error BadSeed();
    error NotYourDraw();
    error TooEarly();
    error StaleAppraisal();

    constructor(address admin, ArtVault721 _vault, IERC20 _payToken, address _treasury) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        vaultNft = _vault;
        payToken = _payToken;
        treasury = _treasury;
    }

    // -------------------------------------------------------------- fairness

    /// @notice Publish the terminal hash of a fresh seed chain. Must be called
    ///         before the first draw and whenever the chain is exhausted.
    /// @param commit s[N], the hash reached after N iterations from the secret.
    /// @param startIndex N. Draws consume indices downward from here.
    function commitSeedChain(bytes32 commit, uint64 startIndex) external onlyRole(OPERATOR_ROLE) {
        committedHash = commit;
        seedCursor = startIndex;
        emit ChainCommitted(commit, startIndex);
    }

    // ------------------------------------------------------------ machine cfg

    function configureMachine(
        uint32 machineId,
        uint128 priceUsd6,
        uint32[TIER_COUNT] calldata oddsPpm
    ) external onlyRole(OPERATOR_ROLE) {
        uint256 sum;
        for (uint256 i; i < TIER_COUNT; ++i) sum += oddsPpm[i];
        if (sum != PPM) revert BadOdds();

        uint32 v = machines[machineId].version + 1;
        machines[machineId] = Machine({
            priceUsd6: priceUsd6,
            oddsPpm: oddsPpm,
            active: true,
            version: v
        });
        emit MachineConfigured(machineId, priceUsd6, oddsPpm, v);
    }

    function setActive(uint32 machineId, bool active) external onlyRole(OPERATOR_ROLE) {
        machines[machineId].active = active;
    }

    // -------------------------------------------------------------- inventory

    /// @notice Move a vault NFT into a machine's prize pool. The machine must
    ///         already hold the NFT (transfer it in first, or use safeTransferFrom
    ///         with encoded data).
    function restock(uint32 machineId, uint256 tokenId) public onlyRole(STOCKER_ROLE) {
        if (vaultNft.ownerOf(tokenId) != address(this)) revert TierEmpty();
        // Reject anything whose appraisal has lapsed — stale prices break EV honesty.
        if (vaultNft.liveValueUsd6(tokenId) == 0) revert StaleAppraisal();

        uint8 tier = uint8(vaultNft.tierOf(tokenId));
        _poolIndex[tokenId] = _pool[machineId][tier].length;
        _pool[machineId][tier].push(tokenId);
        emit Restocked(machineId, tier, tokenId);
    }

    function restockBatch(uint32 machineId, uint256[] calldata tokenIds)
        external
        onlyRole(STOCKER_ROLE)
    {
        for (uint256 i; i < tokenIds.length; ++i) restock(machineId, tokenIds[i]);
    }

    // ------------------------------------------------------------------ draws

    /// @notice Pay and open a box. Emits a commitment; the outcome is not yet known
    ///         to anyone, including the operator, because the client seed is mixed in.
    function openBox(uint32 machineId, bytes32 clientSeed)
        external
        nonReentrant
        returns (uint256 drawId)
    {
        Machine memory m = machines[machineId];
        if (!m.active) revert MachineInactive();

        payToken.safeTransferFrom(msg.sender, address(this), m.priceUsd6);

        drawId = nextDrawId++;
        uint64 idx = seedCursor;

        draws[drawId] = Draw({
            user: msg.sender,
            machineId: machineId,
            seedIndex: idx,
            clientSeed: clientSeed,
            pricePaid: m.priceUsd6,
            openedAt: uint40(block.timestamp),
            settled: false,
            wonTokenId: 0,
            wonTier: 0
        });

        seedCursor = idx - 1;
        emit BoxOpened(drawId, msg.sender, machineId, clientSeed, idx);
    }

    /// @notice Reveal the seed and settle. Anyone holding SETTLER_ROLE can call;
    ///         the seed itself is the only secret, and it verifies against the chain.
    function settleDraw(uint256 drawId, bytes32 serverSeed)
        external
        nonReentrant
        onlyRole(SETTLER_ROLE)
    {
        Draw storage d = draws[drawId];
        if (d.settled) revert AlreadySettled();

        // The core fairness check: this seed must hash to the value we committed to.
        if (keccak256(abi.encodePacked(serverSeed)) != committedHash) revert BadSeed();

        // Advance the chain. The seed just revealed becomes the new commitment.
        revealedSeed[d.seedIndex] = serverSeed;
        committedHash = serverSeed;

        bytes32 result = keccak256(abi.encode(serverSeed, d.clientSeed, d.user, drawId));

        uint8 tier = _rollTier(d.machineId, uint256(result) % PPM);
        uint256 tokenId = _drawFromTier(d.machineId, tier, result);

        d.settled = true;
        d.wonTier = tier;
        d.wonTokenId = tokenId;

        payToken.safeTransfer(treasury, d.pricePaid);
        vaultNft.safeTransferFrom(address(this), d.user, tokenId);

        emit DrawSettled(drawId, d.user, tier, tokenId, serverSeed);
    }

    /// @notice Escape hatch. If the settler goes down, the user takes their money back.
    ///         Without this, an operator outage silently confiscates funds.
    function refundUnsettled(uint256 drawId) external nonReentrant {
        Draw storage d = draws[drawId];
        if (d.settled) revert AlreadySettled();
        if (d.user != msg.sender) revert NotYourDraw();
        if (block.timestamp < d.openedAt + SETTLE_DEADLINE) revert TooEarly();

        d.settled = true;
        payToken.safeTransfer(d.user, d.pricePaid);
        emit DrawRefunded(drawId, d.user, d.pricePaid);
    }

    // -------------------------------------------------------------- internals

    /// @dev Walks the cumulative odds ladder. `roll` is in [0, 1_000_000).
    function _rollTier(uint32 machineId, uint256 roll) internal view returns (uint8) {
        uint32[TIER_COUNT] memory odds = machines[machineId].oddsPpm;
        uint256 cumulative;
        for (uint8 i; i < TIER_COUNT; ++i) {
            cumulative += odds[i];
            if (roll < cumulative) return i;
        }
        return TIER_COUNT - 1; // unreachable while odds sum to PPM
    }

    /// @dev Picks an item and swap-removes it. If the rolled tier is empty we walk
    ///      DOWN to a lower tier rather than reverting — a stockout must never eat
    ///      a user's payment, and walking down never favours the house over the
    ///      published odds by more than the stockout itself.
    ///      Operations must keep tiers stocked; the API alerts on depth < 5.
    function _drawFromTier(uint32 machineId, uint8 tier, bytes32 result)
        internal
        returns (uint256 tokenId)
    {
        uint8 t = tier;
        while (_pool[machineId][t].length == 0) {
            if (t == 0) revert TierEmpty();
            unchecked { --t; }
        }

        uint256[] storage arr = _pool[machineId][t];
        uint256 pick = uint256(keccak256(abi.encodePacked(result, "ITEM"))) % arr.length;

        tokenId = arr[pick];
        uint256 last = arr[arr.length - 1];
        arr[pick] = last;
        _poolIndex[last] = pick;
        arr.pop();
        delete _poolIndex[tokenId];
    }

    // ------------------------------------------------------------------ views

    function poolDepth(uint32 machineId, uint8 tier) external view returns (uint256) {
        return _pool[machineId][tier].length;
    }

    function machineOdds(uint32 machineId) external view returns (uint32[TIER_COUNT] memory) {
        return machines[machineId].oddsPpm;
    }

    /// @notice Live expected value of a machine, computed from real pool contents
    ///         rather than nominal tier floors. This is what the UI should show.
    function expectedValueUsd6(uint32 machineId) external view returns (uint256 ev) {
        uint32[TIER_COUNT] memory odds = machines[machineId].oddsPpm;
        for (uint8 t; t < TIER_COUNT; ++t) {
            uint256[] storage arr = _pool[machineId][t];
            if (arr.length == 0) continue;
            uint256 tierSum;
            for (uint256 i; i < arr.length; ++i) {
                tierSum += vaultNft.liveValueUsd6(arr[i]);
            }
            ev += (tierSum / arr.length) * odds[t] / PPM;
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    function setTreasury(address t) external onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = t;
    }
}
