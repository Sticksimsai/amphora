// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ShareVault} from "./ShareVault.sol";
import {ShareCertificate721} from "./ShareCertificate721.sol";

/// @title GachaMachine (fractional) — Amphora, on Elysium
/// @notice PAYMENT IS NATIVE HYPE. Elysium's gas token is HYPE (18 decimals,
///         bridged 1:1 from HyperEVM), so a box is bought with msg.value and
///         every price, band and mark in this system is denominated in wei of
///         HYPE. There is no ERC-20 approval step and no stablecoin anywhere.
///
/// @notice Randomised draws that mint share certificates against fractional
///         inventory. Supersedes the whole-asset version in `deprecated/`.
///
/// WHAT CHANGED FROM THE UNIQUE-ITEM DESIGN
/// ----------------------------------------
/// The old machine held fixed arrays of unique tokenIds and swap-removed one per
/// draw, so a tier could empty mid-session and silently downgrade a winner. With
/// fractional positions there is nothing to run out of: a tier holds HYPE-VALUE of
/// share inventory, and a draw mints a certificate for however many shares hit
/// the tier's value band. Depth degrades smoothly rather than falling off a
/// cliff, and the stockout-downgrade path is gone entirely.
///
/// A draw is three derivations from one result hash:
///     1. tier     — from the published ppm ladder
///     2. artwork  — uniformly from the works committed to that tier
///     3. value    — sampled within the tier's band, converted to shares at NAV
///
/// Step 3 is what makes this feel like a pull rather than a payout. Two draws at
/// the same tier give different artworks and different share counts, so the
/// artwork's identity carries the excitement and the share count is arithmetic.
contract GachaMachine is AccessControl, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    uint32 public constant PPM = 1_000_000;
    uint8 public constant TIER_COUNT = 5;

    ShareVault public immutable vault;
    ShareCertificate721 public immutable certificate;
    address public treasury;
    /// @notice HYPE owed to the treasury that could not be pushed at settle
    ///         time (a treasury contract that reverts must never be able to
    ///         block a player's settlement). Anyone may flush it.
    uint256 public treasuryOwed;

    struct Machine {
        uint128 priceWei;
        uint32[TIER_COUNT] oddsPpm;         // must sum to exactly 1_000_000
        uint128[TIER_COUNT] tierFloorWei;  // bottom of each tier's value band
        uint128[TIER_COUNT] tierCapWei;    // top of each band
        bool active;
        uint32 version;
    }

    struct Draw {
        address user;
        uint32 machineId;
        uint64 seedIndex;
        bytes32 clientSeed;
        uint128 pricePaid;
        uint40 openedAt;
        bool settled;
        uint256 certificateId;
        uint256 artworkId;
        uint256 shares;
        uint8 tier;
    }

    mapping(uint32 => Machine) public machines;

    bytes32 public committedHash;
    uint64 public seedCursor;
    mapping(uint64 => bytes32) public revealedSeed;

    uint256 public nextDrawId = 1;
    mapping(uint256 => Draw) public draws;

    uint40 public constant SETTLE_DEADLINE = 10 minutes;
    /// @notice After this long an unsettled, unrefunded draw is abandoned and
    ///         the admin may sweep it. 30 days is ~4,000x the refund window, so
    ///         no player's right to a refund is shortened in any practical sense.
    uint40 public constant SWEEP_DELAY = 30 days;

    event ChainCommitted(bytes32 commit, uint64 startIndex);
    event MachineConfigured(uint32 indexed machineId, uint128 priceWei, uint32[TIER_COUNT] oddsPpm, uint32 version);
    event BoxOpened(uint256 indexed drawId, address indexed user, uint32 indexed machineId, bytes32 clientSeed, uint64 seedIndex);
    event DrawSettled(
        uint256 indexed drawId,
        address indexed user,
        uint8 tier,
        uint256 artworkId,
        uint256 shares,
        uint256 certificateId,
        bytes32 serverSeed
    );
    event DrawRefunded(uint256 indexed drawId, address indexed user, uint128 amount);
    event DrawSwept(uint256 indexed drawId, address indexed user, uint128 amount);
    event TreasuryPaid(uint256 amount, bool pushed);

    error BadOdds();
    error BadBands();
    error MachineInactive();
    error TierEmpty();
    error AlreadySettled();
    error BadSeed();
    error NotYourDraw();
    error TooEarly();
    error WrongPayment();
    error TransferFailed();
    error NoSuchDraw();

    constructor(
        address admin,
        ShareVault _vault,
        ShareCertificate721 _certificate,
        address _treasury
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        vault = _vault;
        certificate = _certificate;
        treasury = _treasury;
    }

    // --------------------------------------------------------------- fairness

    function commitSeedChain(bytes32 commit, uint64 startIndex) external onlyRole(OPERATOR_ROLE) {
        committedHash = commit;
        seedCursor = startIndex;
        emit ChainCommitted(commit, startIndex);
    }

    // ------------------------------------------------------------ machine cfg

    function configureMachine(
        uint32 machineId,
        uint128 priceWei,
        uint32[TIER_COUNT] calldata oddsPpm,
        uint128[TIER_COUNT] calldata floors,
        uint128[TIER_COUNT] calldata caps
    ) external onlyRole(OPERATOR_ROLE) {
        uint256 sum;
        for (uint256 i; i < TIER_COUNT; ++i) {
            sum += oddsPpm[i];
            if (caps[i] < floors[i]) revert BadBands();
        }
        if (sum != PPM) revert BadOdds();

        uint32 v = machines[machineId].version + 1;
        machines[machineId] = Machine({
            priceWei: priceWei,
            oddsPpm: oddsPpm,
            tierFloorWei: floors,
            tierCapWei: caps,
            active: true,
            version: v
        });
        emit MachineConfigured(machineId, priceWei, oddsPpm, v);
    }

    function setActive(uint32 machineId, bool active) external onlyRole(OPERATOR_ROLE) {
        machines[machineId].active = active;
    }

    // ------------------------------------------------------------------ draws

    function openBox(uint32 machineId, bytes32 clientSeed)
        external
        payable
        nonReentrant
        returns (uint256 drawId)
    {
        Machine memory m = machines[machineId];
        if (!m.active) revert MachineInactive();
        // Exact payment only: an over-payment is almost always a UI bug, and
        // silently keeping the difference would be taking money by accident.
        if (msg.value != m.priceWei) revert WrongPayment();

        drawId = nextDrawId++;
        uint64 idx = seedCursor;

        Draw storage d = draws[drawId];
        d.user = msg.sender;
        d.machineId = machineId;
        d.seedIndex = idx;
        d.clientSeed = clientSeed;
        d.pricePaid = m.priceWei;
        d.openedAt = uint40(block.timestamp);

        seedCursor = idx - 1;
        emit BoxOpened(drawId, msg.sender, machineId, clientSeed, idx);
    }

    function settleDraw(uint256 drawId, bytes32 serverSeed)
        external
        nonReentrant
        onlyRole(SETTLER_ROLE)
    {
        Draw storage d = draws[drawId];
        if (d.user == address(0)) revert NoSuchDraw();
        if (d.settled) revert AlreadySettled();
        if (keccak256(abi.encodePacked(serverSeed)) != committedHash) revert BadSeed();

        revealedSeed[d.seedIndex] = serverSeed;
        committedHash = serverSeed;

        bytes32 result = keccak256(abi.encode(serverSeed, d.clientSeed, d.user, drawId));

        Machine memory m = machines[d.machineId];

        // 1. Tier, from the published ladder.
        uint8 tier = _rollTier(m.oddsPpm, uint256(result) % PPM);

        // 2. Artwork. Uniform across everything committed to this tier, so the
        //    tier itself is the guarantee — no hidden weighting between works.
        uint256[] memory ids = vault.tierArtworks(d.machineId, tier);
        if (ids.length == 0) revert TierEmpty();
        uint256 artworkId = _pickWeighted(ids, uint256(keccak256(abi.encodePacked(result, "ART"))));

        // 3. Value within the band, converted to shares at current NAV.
        uint128 value = _sampleValue(result, m.tierFloorWei[tier], m.tierCapWei[tier]);
        uint256 shares = vault.sharesForValue(artworkId, value);

        vault.debitForPrize(artworkId, d.machineId, shares);
        uint256 certId = certificate.mint(d.user, artworkId, shares, d.machineId);

        d.settled = true;
        d.tier = tier;
        d.artworkId = artworkId;
        d.shares = shares;
        d.certificateId = certId;

        _payTreasury(d.pricePaid);
        emit DrawSettled(drawId, d.user, tier, artworkId, shares, certId, serverSeed);
    }

    /// @notice Escape hatch. Without it, a settler outage silently confiscates funds.
    function refundUnsettled(uint256 drawId) external nonReentrant {
        Draw storage d = draws[drawId];
        if (d.settled) revert AlreadySettled();
        if (d.user != msg.sender) revert NotYourDraw();
        if (block.timestamp < d.openedAt + SETTLE_DEADLINE) revert TooEarly();

        d.settled = true;
        (bool ok, ) = d.user.call{value: d.pricePaid}("");
        if (!ok) revert TransferFailed();
        emit DrawRefunded(drawId, d.user, d.pricePaid);
    }

    /// @notice Sweep a draw that was never settled and never refunded. Closes
    ///         the "HYPE stranded forever" gap from the original design.
    function sweepAbandoned(uint256 drawId) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        Draw storage d = draws[drawId];
        if (d.user == address(0)) revert NoSuchDraw();
        if (d.settled) revert AlreadySettled();
        if (block.timestamp < d.openedAt + SWEEP_DELAY) revert TooEarly();

        d.settled = true; // certificateId stays 0: nothing was ever issued
        _payTreasury(d.pricePaid);
        emit DrawSwept(drawId, d.user, d.pricePaid);
    }

    /// @dev Push to the treasury; on failure, book it instead of reverting.
    function _payTreasury(uint256 amount) internal {
        (bool ok, ) = treasury.call{value: amount, gas: 50_000}("");
        if (!ok) treasuryOwed += amount;
        emit TreasuryPaid(amount, ok);
    }

    function flushTreasury() external nonReentrant {
        uint256 amt = treasuryOwed;
        treasuryOwed = 0;
        (bool ok, ) = treasury.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit TreasuryPaid(amt, true);
    }

    // -------------------------------------------------------------- internals

    function _rollTier(uint32[TIER_COUNT] memory odds, uint256 roll) internal pure returns (uint8) {
        uint256 cumulative;
        for (uint8 i; i < TIER_COUNT; ++i) {
            cumulative += odds[i];
            if (roll < cumulative) return i;
        }
        return TIER_COUNT - 1;
    }

    /// @dev Uniform sample in [floor, cap], so a tier's expected value is its band
    ///      MIDPOINT, not its floor.
    ///
    ///      This matters and it is easy to get wrong: the odds ladder was solved
    ///      against a target value per tier, so bands must be CENTRED on that
    ///      target. Setting floor to the solved value and adding headroom above it
    ///      silently raises machine EV above 100% and the house loses money on
    ///      every draw. `scripts/solveOdds.ts` generates centred bands — use it
    ///      rather than hand-writing these arrays.
    function _sampleValue(bytes32 result, uint128 floor, uint128 cap)
        internal
        pure
        returns (uint128)
    {
        if (cap <= floor) return floor;
        uint256 span = uint256(cap - floor) + 1;
        uint256 r = uint256(keccak256(abi.encodePacked(result, "VAL"))) % span;
        return floor + uint128(r);
    }

    // ------------------------------------------------------------------ views

    function machineOdds(uint32 machineId) external view returns (uint32[TIER_COUNT] memory) {
        return machines[machineId].oddsPpm;
    }

    function machineBands(uint32 machineId)
        external
        view
        returns (uint128[TIER_COUNT] memory floors, uint128[TIER_COUNT] memory caps)
    {
        return (machines[machineId].tierFloorWei, machines[machineId].tierCapWei);
    }

    /// @notice Expected value from the published bands. Because value is sampled
    ///         uniformly inside each band, the true expectation is the band
    ///         midpoint — strictly better for the user than the floor-based table.
    function expectedValueWei(uint32 machineId) external view returns (uint256 ev) {
        Machine memory m = machines[machineId];
        for (uint8 t; t < TIER_COUNT; ++t) {
            uint256 mid = (uint256(m.tierFloorWei[t]) + m.tierCapWei[t]) / 2;
            ev += (mid * m.oddsPpm[t]) / PPM;
        }
    }

    /// @notice HYPE-value depth of a tier's inventory. Alert below roughly 20x the tier
    ///         cap — thin tiers force the same artwork to repeat across draws.
    function tierDepthWei(uint32 machineId, uint8 tier) external view returns (uint256) {
        return vault.tierDepthWei(machineId, tier);
    }

    function setTreasury(address t) external onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = t;
    }

    // ---------------------------------------------------- weighted selection

    /// @dev artworkId => draw weight. 0 (unset) means DEFAULT_WEIGHT.
    ///      Rarities are registered with low weight (e.g. 4 vs 100) so they
    ///      surface rarely within their tier; editions deplete and retire.
    uint32 public constant DEFAULT_WEIGHT = 100;
    mapping(uint256 => uint32) public workWeight;

    event WorkWeightSet(uint256 indexed artworkId, uint32 weight);

    function setWorkWeight(uint256 artworkId, uint32 weight) external onlyRole(OPERATOR_ROLE) {
        workWeight[artworkId] = weight;
        emit WorkWeightSet(artworkId, weight);
    }

    function _weightOf(uint256 artworkId) internal view returns (uint256 w) {
        w = workWeight[artworkId];
        if (w == 0) w = DEFAULT_WEIGHT;
    }

    function _pickWeighted(uint256[] memory ids, uint256 entropy)
        internal
        view
        returns (uint256)
    {
        uint256 total;
        for (uint256 i; i < ids.length; ++i) total += _weightOf(ids[i]);
        uint256 roll = entropy % total;
        uint256 acc;
        for (uint256 i; i < ids.length; ++i) {
            acc += _weightOf(ids[i]);
            if (roll < acc) return ids[i];
        }
        return ids[ids.length - 1]; // unreachable
    }
}
