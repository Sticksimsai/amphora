// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TreasuryVault
/// @notice Single sink for every inflow — pons creator fees, gacha revenue, and
///         secondary royalties — split by an immutable-by-intent waterfall.
///
/// The credibility of this project rests on the claim "trading the token buys art".
/// That claim is only worth anything if the split is on-chain, enforced, and
/// observable. Keep the policy mutable during soft launch, then renounce
/// POLICY_ROLE and let the split calcify. Publish the renunciation tx.
contract TreasuryVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant POLICY_ROLE = keccak256("POLICY_ROLE");
    bytes32 public constant ACQUIRER_ROLE = keccak256("ACQUIRER_ROLE");
    bytes32 public constant DESK_ROLE = keccak256("DESK_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant OPS_ROLE = keccak256("OPS_ROLE");

    uint16 public constant BPS = 10_000;

    enum Sleeve { ACQUISITION, BUYBACK, TOKEN_BURN, OPERATIONS, INSURANCE }
    uint8 public constant SLEEVE_COUNT = 5;

    /// @notice Where an inflow came from. This is NOT cosmetic — the two sources
    ///         have completely different economics and one waterfall cannot serve
    ///         both.
    ///
    ///         FEES are free money. Trading revenue costs the treasury nothing, so
    ///         most of it should buy art.
    ///
    ///         GACHA revenue is NOT free. Every $100 box ships ~$88 of inventory
    ///         out of the prize pool. Apply the fee waterfall to it and you restock
    ///         $55 against $88 leaving — the pool shrinks $33 per box until it is
    ///         empty. The invariant below is what stops that.
    enum Source { FEES, GACHA, ROYALTY }
    uint8 public constant SOURCE_COUNT = 3;

    /// @notice source => sleeve => basis points.
    mapping(uint8 => uint16[SLEEVE_COUNT]) public policyBps;

    /// @notice THE INVARIANT FOR GACHA REVENUE.
    ///         ACQUISITION + BUYBACK must cover the expected value shipped per box.
    ///         At an 88% EV machine that is 8800bps, leaving 1200bps of real margin
    ///         for burn, ops and insurance. An 88% EV machine has 12% gross margin
    ///         and you cannot spend it three times.
    ///
    ///         The split BETWEEN those two sleeves should track the observed
    ///         buyback rate: buybacks acquire inventory at 85% of NAV, so every
    ///         certificate sold back earns the 15% spread and is the cheapest
    ///         restocking channel available. Low buyback rate, weight ACQUISITION.
    ///         High buyback rate, weight BUYBACK. Their sum is what must not move.
    uint16 public restockFloorBps = 8800;

    /// @notice token => sleeve => balance
    mapping(address => uint256[SLEEVE_COUNT]) public sleeveBalance;

    /// @notice Per-epoch spend caps stop a compromised operator key draining a sleeve
    ///         in one transaction. Epochs are 1 day.
    uint256 public constant EPOCH = 1 days;
    mapping(address => mapping(uint8 => uint256)) public epochCap;   // token => sleeve => cap
    mapping(address => mapping(uint8 => uint256)) private _spentIn;  // token => sleeve => amount
    mapping(address => mapping(uint8 => uint256)) private _epochOf;

    event Deposited(address indexed token, Source indexed source, uint256 amount, uint256[SLEEVE_COUNT] allocated);
    event Spent(address indexed token, Sleeve indexed sleeve, address indexed to, uint256 amount, string memo);
    event PolicyUpdated(Source indexed source, uint16[SLEEVE_COUNT] bps);
    event RestockFloorUpdated(uint16 bps);
    event EpochCapSet(address indexed token, Sleeve indexed sleeve, uint256 cap);

    error BadPolicy();
    error RestockFloorBreached();
    error InsufficientSleeve();
    error EpochCapExceeded();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        // Fees are free money: buy art with most of it.
        policyBps[uint8(Source.FEES)]   = [uint16(5500), 1500, 1500, 1000, 500];
        // Gacha revenue must restock what it ships. 6000 + 2800 = 8800 = the EV
        // shipped per box. The remaining 1200bps is the entire real margin.
        policyBps[uint8(Source.GACHA)]  = [uint16(6000), 2800,  400,  600, 200];
        // Secondary royalties behave like fees.
        policyBps[uint8(Source.ROYALTY)] = [uint16(5500), 1500, 1500, 1000, 500];
    }

    // ------------------------------------------------------------- deposits

    /// @notice Split an incoming amount across sleeves. Caller must have already
    ///         transferred `amount` of `token` to this contract, or approved it.
    /// @dev    Pull pattern: we transferFrom so the accounting can never drift
    ///         from the actual balance the way a bare `receive()` allows.
    function deposit(address token, uint256 amount, Source source) external nonReentrant {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _allocate(token, amount, source);
    }

    /// @notice Allocate tokens that arrived without going through `deposit` —
    ///         e.g. the pons locker paying creator fees directly to this address.
    ///         Sweeps any unallocated surplus into the sleeves.
    /// @dev Untracked arrivals are almost always pons creator fees paid directly
    ///      to this address by the locker, so FEES is the right default. Pass the
    ///      source explicitly if you are sweeping anything else.
    function sweep(address token, Source source) external nonReentrant returns (uint256 surplus) {
        uint256 accounted;
        for (uint8 i; i < SLEEVE_COUNT; ++i) accounted += sleeveBalance[token][i];
        uint256 held = IERC20(token).balanceOf(address(this));
        if (held <= accounted) return 0;
        surplus = held - accounted;
        _allocate(token, surplus, source);
    }

    function _allocate(address token, uint256 amount, Source source) internal {
        uint16[SLEEVE_COUNT] memory policy = policyBps[uint8(source)];
        uint256[SLEEVE_COUNT] memory allocated;
        uint256 assigned;
        // Give the remainder to ACQUISITION so rounding dust always buys art.
        for (uint8 i = 1; i < SLEEVE_COUNT; ++i) {
            uint256 part = (amount * policy[i]) / BPS;
            allocated[i] = part;
            sleeveBalance[token][i] += part;
            assigned += part;
        }
        allocated[0] = amount - assigned;
        sleeveBalance[token][0] += allocated[0];

        emit Deposited(token, source, amount, allocated);
    }

    // ---------------------------------------------------------------- spend

    function spend(address token, Sleeve sleeve, address to, uint256 amount, string calldata memo)
        external
        nonReentrant
    {
        _requireSleeveRole(sleeve);

        uint8 s = uint8(sleeve);
        if (sleeveBalance[token][s] < amount) revert InsufficientSleeve();

        uint256 nowEpoch = block.timestamp / EPOCH;
        if (_epochOf[token][s] != nowEpoch) {
            _epochOf[token][s] = nowEpoch;
            _spentIn[token][s] = 0;
        }
        uint256 cap = epochCap[token][s];
        if (cap != 0 && _spentIn[token][s] + amount > cap) revert EpochCapExceeded();
        _spentIn[token][s] += amount;

        sleeveBalance[token][s] -= amount;
        IERC20(token).safeTransfer(to, amount);

        emit Spent(token, sleeve, to, amount, memo);
    }

    function _requireSleeveRole(Sleeve sleeve) internal view {
        bytes32 needed;
        if (sleeve == Sleeve.ACQUISITION) needed = ACQUIRER_ROLE;
        else if (sleeve == Sleeve.BUYBACK) needed = DESK_ROLE;
        else if (sleeve == Sleeve.TOKEN_BURN) needed = BURNER_ROLE;
        else needed = OPS_ROLE; // OPERATIONS and INSURANCE
        _checkRole(needed);
    }

    // --------------------------------------------------------------- policy

    function setPolicy(Source source, uint16[SLEEVE_COUNT] calldata bps)
        external
        onlyRole(POLICY_ROLE)
    {
        uint256 sum;
        for (uint8 i; i < SLEEVE_COUNT; ++i) sum += bps[i];
        if (sum != BPS) revert BadPolicy();

        // Enforce the restock invariant for gacha revenue. Without this check a
        // well-meaning policy tweak drains the prize pool one box at a time, and
        // the failure is invisible until inventory runs out.
        if (source == Source.GACHA) {
            uint256 restock = uint256(bps[uint8(Sleeve.ACQUISITION)]) + bps[uint8(Sleeve.BUYBACK)];
            if (restock < restockFloorBps) revert RestockFloorBreached();
        }

        policyBps[uint8(source)] = bps;
        emit PolicyUpdated(source, bps);
    }

    /// @notice Track this to your machines' actual EV. If you lower EV to 85%,
    ///         the floor drops to 8500 and you free up 300bps of real margin.
    function setRestockFloor(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        restockFloorBps = bps;
        emit RestockFloorUpdated(bps);
    }

    function policyFor(Source source) external view returns (uint16[SLEEVE_COUNT] memory) {
        return policyBps[uint8(source)];
    }

    function setEpochCap(address token, Sleeve sleeve, uint256 cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        epochCap[token][uint8(sleeve)] = cap;
        emit EpochCapSet(token, sleeve, cap);
    }

    // ---------------------------------------------------------------- views

    function sleeves(address token) external view returns (uint256[SLEEVE_COUNT] memory) {
        return sleeveBalance[token];
    }

    function totalHeld(address token) external view returns (uint256 t) {
        for (uint8 i; i < SLEEVE_COUNT; ++i) t += sleeveBalance[token][i];
    }
}
