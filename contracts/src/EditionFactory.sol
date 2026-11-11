// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./ShareVault.sol";

/// @title EditionToken — one in-house edition as a fungible token.
/// @notice 0 decimals: 1 token = 1 numbered copy. Indivisible by design —
///         a print copy is a whole thing. Entire supply mints to the vault.
contract EditionToken is ERC20 {
    uint8 private constant DECIMALS = 0;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 editionCap,
        address vault
    ) ERC20(name_, symbol_) {
        _mint(vault, editionCap);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
}

/// @title EditionFactory — deploys and registers in-house editions in one call.
/// @dev Needs CURATOR_ROLE on the ShareVault. Series curation lives off-chain
///      in the manifest; this contract only makes the manifest true on-chain.
contract EditionFactory is AccessControl {
    bytes32 public constant SERIES_ROLE = keccak256("SERIES_ROLE");

    ShareVault public immutable vault;
    event EditionCreated(
        uint256 indexed artworkId,
        address token,
        string ticker,
        uint256 editionCap,
        uint256 markWei
    );

    constructor(address admin, ShareVault vault_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SERIES_ROLE, admin);
        vault = vault_;
    }

    /// @param markWei mark in wei of HYPE (0.35 HYPE => 0.35e18)
    function createEdition(
        string calldata title,
        string calldata ticker,       // e.g. "S1-01"
        uint256 editionCap,           // e.g. 300
        uint256 markWei,
        string calldata seriesName,   // recorded as "artist" (issuer imprint)
        string calldata metadataUri
    ) external onlyRole(SERIES_ROLE) returns (uint256 artworkId, address token) {
        EditionToken t = new EditionToken(title, ticker, editionCap, address(vault));
        artworkId = vault.registerArtwork(
            IERC20(address(t)),
            0,                        // decimals
            false,                    // unrestricted — freely transferable
            ShareVault.Prestige.EMERGING,
            editionCap,
            seriesName,               // issuer line, e.g. "Amphora Editions, Season I"
            title,
            metadataUri
        );
        // NAV = the flat mark; vault NAV setter is a separate role/call —
        // emitted here so the deploy script pairs createEdition + setNAV.
        emit EditionCreated(artworkId, address(t), ticker, editionCap, markWei);
    }
}
