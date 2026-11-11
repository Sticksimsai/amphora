// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ArtVault721
/// @notice One token per custodied artwork. The NFT is a receipt against an asset
///         held in a named custody account, usually on another chain (LiveArt assets
///         live on Ethereum; Robinhood Chain has no trustless NFT bridge).
///
/// @dev    This is an explicitly TRUSTED wrapper. Backing is evidenced by the
///         ProofOfReserve contract, not by escrow on this chain. Do not describe
///         it to users as trustless.
contract ArtVault721 is ERC721Enumerable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /// @notice Value tiers. Mirrors the gacha machine tiering.
    enum Tier { STUDY, PRINT, EDITION, ORIGINAL, GRAIL }

    struct Provenance {
        uint256 sourceChainId;   // 1 = Ethereum mainnet
        address sourceContract;  // e.g. the LiveArt ERC-721
        uint256 sourceTokenId;
        address custodian;       // Safe address holding the source asset
    }

    struct Appraisal {
        uint128 valueUsd6;       // USD with 6 decimals, matching USDG
        uint40  assessedAt;      // unix seconds
        uint40  expiresAt;       // stale appraisals are barred from gacha pools
        bytes32 sourceRef;       // hash of the appraisal document / comp set
    }

    struct Item {
        Provenance provenance;
        Appraisal appraisal;
        Tier tier;
        bool redeemed;
        string metadataUri;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Item) private _items;

    /// @notice Appraisals older than this are rejected by the gacha machine.
    uint40 public constant MAX_APPRAISAL_AGE = 90 days;

    event ItemVaulted(
        uint256 indexed tokenId,
        uint256 indexed sourceChainId,
        address indexed sourceContract,
        uint256 sourceTokenId,
        Tier tier,
        uint128 valueUsd6
    );
    event AppraisalUpdated(uint256 indexed tokenId, uint128 valueUsd6, uint40 expiresAt);
    event TierReassigned(uint256 indexed tokenId, Tier from, Tier to);
    event ItemRedeemed(uint256 indexed tokenId, address indexed redeemer);

    error AppraisalExpired();
    error AlreadyRedeemed();
    error UnknownToken();

    constructor(address admin) ERC721("Artefracts Vault", "VVAULT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------- minting

    /// @notice Mint a receipt for an asset that has already landed in custody.
    ///         Caller is responsible for having verified custody first; the
    ///         ProofOfReserve job will flag any token whose backing is missing.
    function vault(
        address to,
        Provenance calldata p,
        Appraisal calldata a,
        Tier tier,
        string calldata metadataUri
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        if (a.expiresAt <= block.timestamp) revert AppraisalExpired();

        tokenId = _nextId++;
        _items[tokenId] = Item({
            provenance: p,
            appraisal: a,
            tier: tier,
            redeemed: false,
            metadataUri: metadataUri
        });
        _safeMint(to, tokenId);

        emit ItemVaulted(tokenId, p.sourceChainId, p.sourceContract, p.sourceTokenId, tier, a.valueUsd6);
    }

    // ------------------------------------------------------------- appraisals

    /// @notice Refresh an appraisal. Values move; a 90-day-old number is fiction.
    ///         Called by the appraisal oracle service after verifying an EIP-712
    ///         signature from a whitelisted appraiser.
    function reappraise(uint256 tokenId, Appraisal calldata a)
        external
        onlyRole(CURATOR_ROLE)
    {
        _requireOwned(tokenId);
        if (a.expiresAt <= block.timestamp) revert AppraisalExpired();
        _items[tokenId].appraisal = a;
        emit AppraisalUpdated(tokenId, a.valueUsd6, a.expiresAt);
    }

    /// @notice Move an item between tiers after a material revaluation.
    function reassignTier(uint256 tokenId, Tier newTier) external onlyRole(CURATOR_ROLE) {
        _requireOwned(tokenId);
        Tier old = _items[tokenId].tier;
        _items[tokenId].tier = newTier;
        emit TierReassigned(tokenId, old, newTier);
    }

    // ------------------------------------------------------------- redemption

    /// @notice Burn on redemption. Only the RedemptionEscrow holds BURNER_ROLE.
    function burnForRedemption(uint256 tokenId, address redeemer)
        external
        onlyRole(BURNER_ROLE)
    {
        if (_items[tokenId].redeemed) revert AlreadyRedeemed();
        _items[tokenId].redeemed = true;
        _burn(tokenId);
        emit ItemRedeemed(tokenId, redeemer);
    }

    // ------------------------------------------------------------------ views

    function itemOf(uint256 tokenId) external view returns (Item memory) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken();
        return _items[tokenId];
    }

    /// @notice Current appraised value, or 0 if the appraisal has gone stale.
    ///         The gacha machine treats 0 as "ineligible for the pool".
    function liveValueUsd6(uint256 tokenId) external view returns (uint128) {
        Appraisal memory a = _items[tokenId].appraisal;
        if (a.expiresAt <= block.timestamp) return 0;
        return a.valueUsd6;
    }

    function tierOf(uint256 tokenId) external view returns (Tier) {
        return _items[tokenId].tier;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _items[tokenId].metadataUri;
    }

    function supportsInterface(bytes4 id)
        public
        view
        override(ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(id);
    }
}
