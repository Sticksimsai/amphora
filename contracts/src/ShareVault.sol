// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ShareVault
/// @notice Registry of the fractional positions the treasury holds, and the
///         accounting layer the gacha draws against.
///
/// TWO KINDS OF POSITION, AND THE DIFFERENCE IS LEGAL, NOT TECHNICAL
/// -----------------------------------------------------------------
/// PORTFOLIO positions are blue-chip fractional shares held permanently by the
/// treasury. They are usually REGULATED securities with enforced transfer
/// whitelists (ERC-3643 and similar), so they can never be distributed to a
/// winner's wallet — the transfer would revert, and routing around it would be
/// securities fraud rather than an integration problem. They exist to give the
/// token a real, growing, published NAV.
///
/// PRIZE positions are freely transferable shares that the gacha can actually
/// pay out. `restricted` must be false, and `commitToPrizePool` enforces it.
///
/// Conflating the two is the fastest way to turn this project into an
/// enforcement action. The flag is checked on every path that could move shares
/// toward a user.
contract ShareVault is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");
    bytes32 public constant NAV_ROLE = keccak256("NAV_ROLE");
    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE"); // the GachaMachine

    /// @notice Prestige band. This is the thing that makes a pull exciting —
    ///         not the mark, but whose work it is.
    enum Prestige { EMERGING, ESTABLISHED, BLUECHIP, MAJOR, ICONIC }

    struct Artwork {
        IERC20 shareToken;       // the fractional ERC-20
        uint8 shareDecimals;
        bool restricted;         // true = whitelist-gated, NEVER poolable
        bool active;
        Prestige prestige;
        uint128 navPerShareWei; // wei of HYPE per share (18dp, native gas token)
        uint40 navUpdatedAt;
        uint40 navExpiresAt;     // a stale NAV bars the artwork from draws
        uint256 totalShares;     // total supply of the fraction, for % ownership
        string artist;
        string title;
        string metadataUri;
    }

    /// @notice artworkId => artwork
    mapping(uint256 => Artwork) public artworks;
    uint256 public nextArtworkId = 1;

    /// @notice Shares committed to a machine's prize pool, per artwork.
    ///         Held balance minus committed is what the treasury still owns.
    mapping(uint256 => mapping(uint32 => uint256)) public committed;
    /// @notice Total committed across all machines, per artwork.
    mapping(uint256 => uint256) public totalCommitted;
    /// @notice Shares already paid out into live certificates.
    mapping(uint256 => uint256) public issued;

    /// @notice machineId => tier => artworkIds available at that tier
    mapping(uint32 => mapping(uint8 => uint256[])) private _tierArtworks;
    mapping(uint32 => mapping(uint8 => mapping(uint256 => bool))) private _inTier;

    uint40 public constant MAX_NAV_AGE = 7 days;

    event ArtworkRegistered(uint256 indexed artworkId, address shareToken, Prestige prestige, bool restricted);
    event NavUpdated(uint256 indexed artworkId, uint128 navPerShareWei, uint40 expiresAt);
    event CommittedToPool(uint256 indexed artworkId, uint32 indexed machineId, uint8 tier, uint256 shares);
    event WithdrawnFromPool(uint256 indexed artworkId, uint32 indexed machineId, uint256 shares);
    event RemovedFromTier(uint256 indexed artworkId, uint32 indexed machineId, uint8 tier);
    event SharesIssued(uint256 indexed artworkId, uint32 indexed machineId, uint256 shares, address to);

    error RestrictedAsset();
    error NavStale();
    error InsufficientUncommitted();
    error InsufficientPoolBalance();
    error NotActive();
    error NotInTier();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------- registry

    function registerArtwork(
        IERC20 shareToken,
        uint8 shareDecimals,
        bool restricted,
        Prestige prestige,
        uint256 totalShares,
        string calldata artist,
        string calldata title,
        string calldata metadataUri
    ) external onlyRole(CURATOR_ROLE) returns (uint256 artworkId) {
        artworkId = nextArtworkId++;
        artworks[artworkId] = Artwork({
            shareToken: shareToken,
            shareDecimals: shareDecimals,
            restricted: restricted,
            active: true,
            prestige: prestige,
            navPerShareWei: 0,
            navUpdatedAt: 0,
            navExpiresAt: 0,
            totalShares: totalShares,
            artist: artist,
            title: title,
            metadataUri: metadataUri
        });
        emit ArtworkRegistered(artworkId, address(shareToken), prestige, restricted);
    }

    /// @notice Push a fresh NAV mark. Fractional shares have observable prices,
    ///         which is the main reason this design beats appraising whole works —
    ///         but a mark you stopped updating is worth no more than an appraisal.
    function updateNav(uint256 artworkId, uint128 navPerShareWei, uint40 expiresAt)
        external
        onlyRole(NAV_ROLE)
    {
        if (expiresAt <= block.timestamp) revert NavStale();
        Artwork storage a = artworks[artworkId];
        a.navPerShareWei = navPerShareWei;
        a.navUpdatedAt = uint40(block.timestamp);
        a.navExpiresAt = expiresAt;
        emit NavUpdated(artworkId, navPerShareWei, expiresAt);
    }

    function setActive(uint256 artworkId, bool active) external onlyRole(CURATOR_ROLE) {
        artworks[artworkId].active = active;
    }

    // ------------------------------------------------------------ prize pools

    /// @notice Commit shares to a machine tier so the gacha can award them.
    ///         Reverts for restricted assets — this is the guardrail that keeps
    ///         whitelist-gated securities out of the prize pool entirely.
    function commitToPrizePool(uint256 artworkId, uint32 machineId, uint8 tier, uint256 shares)
        external
        onlyRole(CURATOR_ROLE)
    {
        Artwork memory a = artworks[artworkId];
        if (a.restricted) revert RestrictedAsset();
        if (!a.active) revert NotActive();
        if (a.navExpiresAt <= block.timestamp) revert NavStale();

        uint256 held = a.shareToken.balanceOf(address(this));
        if (held < totalCommitted[artworkId] + shares) revert InsufficientUncommitted();

        committed[artworkId][machineId] += shares;
        totalCommitted[artworkId] += shares;

        if (!_inTier[machineId][tier][artworkId]) {
            _inTier[machineId][tier][artworkId] = true;
            _tierArtworks[machineId][tier].push(artworkId);
        }
        emit CommittedToPool(artworkId, machineId, tier, shares);
    }

    function withdrawFromPool(uint256 artworkId, uint32 machineId, uint256 shares)
        external
        onlyRole(CURATOR_ROLE)
    {
        if (committed[artworkId][machineId] < shares) revert InsufficientPoolBalance();
        committed[artworkId][machineId] -= shares;
        totalCommitted[artworkId] -= shares;
        emit WithdrawnFromPool(artworkId, machineId, shares);
    }

    /// @notice Take an artwork out of a machine tier entirely: zero its
    ///         commitment AND remove its id from the tier array, so no future
    ///         draw can select it. `withdrawFromPool` alone leaves the id in
    ///         the array, where a draw that picks it reverts.
    function removeFromTier(uint256 artworkId, uint32 machineId, uint8 tier)
        external
        onlyRole(CURATOR_ROLE)
    {
        if (!_inTier[machineId][tier][artworkId]) revert NotInTier();
        uint256 c = committed[artworkId][machineId];
        if (c != 0) {
            committed[artworkId][machineId] = 0;
            totalCommitted[artworkId] -= c;
            emit WithdrawnFromPool(artworkId, machineId, c);
        }
        uint256[] storage ids = _tierArtworks[machineId][tier];
        uint256 n = ids.length;
        for (uint256 i; i < n; ++i) {
            if (ids[i] == artworkId) {
                ids[i] = ids[n - 1];
                ids.pop();
                break;
            }
        }
        _inTier[machineId][tier][artworkId] = false;
        emit RemovedFromTier(artworkId, machineId, tier);
    }

    /// @notice Called by the GachaMachine when a certificate is minted. Debits the
    ///         pool but does NOT move tokens — shares stay here until the holder
    ///         unwraps their certificate, so a certificate that is traded or held
    ///         forever never touches the ERC-20.
    function debitForPrize(uint256 artworkId, uint32 machineId, uint256 shares)
        external
        onlyRole(POOL_ROLE)
    {
        if (committed[artworkId][machineId] < shares) revert InsufficientPoolBalance();
        committed[artworkId][machineId] -= shares;
        totalCommitted[artworkId] -= shares;
        issued[artworkId] += shares;
    }

    /// @notice Release underlying shares on certificate unwrap.
    function releaseShares(uint256 artworkId, address to, uint256 shares)
        external
        onlyRole(POOL_ROLE)
    {
        Artwork memory a = artworks[artworkId];
        if (a.restricted) revert RestrictedAsset();
        issued[artworkId] -= shares;
        a.shareToken.safeTransfer(to, shares);
        emit SharesIssued(artworkId, 0, shares, to);
    }

    // ------------------------------------------------------------------ views

    /// @notice Share count that corresponds to a target HYPE value at current NAV.
    ///         This is how a value-banded tier becomes a concrete prize: the tier
    ///         fixes the value, the NAV fixes the shares.
    function sharesForValue(uint256 artworkId, uint128 targetWei)
        public
        view
        returns (uint256)
    {
        Artwork memory a = artworks[artworkId];
        if (a.navExpiresAt <= block.timestamp || a.navPerShareWei == 0) revert NavStale();
        return (uint256(targetWei) * (10 ** a.shareDecimals)) / a.navPerShareWei;
    }

    function valueOfShares(uint256 artworkId, uint256 shares) public view returns (uint256 weiValue) {
        Artwork memory a = artworks[artworkId];
        return (shares * a.navPerShareWei) / (10 ** a.shareDecimals);
    }

    /// @notice Ownership percentage in basis points, for the wall label.
    function ownershipBps(uint256 artworkId, uint256 shares) external view returns (uint256) {
        Artwork memory a = artworks[artworkId];
        if (a.totalShares == 0) return 0;
        return (shares * 10_000) / a.totalShares;
    }

    function tierArtworks(uint32 machineId, uint8 tier) external view returns (uint256[] memory) {
        return _tierArtworks[machineId][tier];
    }

    /// @notice Prize inventory measured in HYPE VALUE, not item count. With fractional
    ///         positions a tier cannot run out mid-draw the way a fixed array of
    ///         unique tokenIds could — it just gets thinner. This is the number
    ///         operations should alert on.
    function tierDepthWei(uint32 machineId, uint8 tier) external view returns (uint256 depth) {
        uint256[] memory ids = _tierArtworks[machineId][tier];
        for (uint256 i; i < ids.length; ++i) {
            Artwork memory a = artworks[ids[i]];
            if (!a.active || a.navExpiresAt <= block.timestamp) continue;
            depth += valueOfShares(ids[i], committed[ids[i]][machineId]);
        }
    }

    function isPoolable(uint256 artworkId) external view returns (bool) {
        Artwork memory a = artworks[artworkId];
        return a.active && !a.restricted && a.navExpiresAt > block.timestamp;
    }

    /// @notice Total portfolio NAV — the headline number for the treasury page.
    function totalNavWei() external view returns (uint256 nav) {
        for (uint256 id = 1; id < nextArtworkId; ++id) {
            Artwork memory a = artworks[id];
            if (!a.active) continue;
            uint256 held = a.shareToken.balanceOf(address(this));
            nav += valueOfShares(id, held);
        }
    }
}
