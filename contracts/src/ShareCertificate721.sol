// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ShareVault} from "./ShareVault.sol";

/// @title ShareCertificate721
/// @notice A numbered certificate representing N fractional shares of one artwork.
///
/// WHY THIS EXISTS AT ALL
/// ----------------------
/// The shares are fungible; the certificate is not. A gacha that pays out
/// "37.2 tokens" is a slot machine. Gacha works because you pull a THING — an
/// object with a name, an image, an edition number. The certificate is that
/// object. The fungible shares sit behind it, and the holder can unwrap at any
/// time, but most will not, because the certificate is the collectible.
///
/// This also means the underlying ERC-20 never moves on a draw. It stays in the
/// ShareVault until someone actually unwraps. Certificates trade on any NFT
/// marketplace with no compliance surface at all, because they are the wrapper,
/// not the security.
contract ShareCertificate721 is ERC721Enumerable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant DESK_ROLE = keccak256("DESK_ROLE");
    bytes32 public constant REDEEM_ROLE = keccak256("REDEEM_ROLE");

    ShareVault public immutable vault;

    struct Certificate {
        uint256 artworkId;
        uint256 shares;
        uint128 mintValueWei;  // NAV value at mint, in wei of HYPE, for the "you pulled X" moment
        uint40 mintedAt;
        uint32 machineId;
        uint32 serial;          // per-artwork serial, e.g. "№ 0042 of Untitled"
    }

    mapping(uint256 => Certificate) private _certs;
    mapping(uint256 => uint32) public serialCounter; // artworkId => next serial
    uint256 private _nextId = 1;

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 indexed artworkId,
        uint256 shares,
        uint128 valueWei,
        uint32 serial
    );
    event Unwrapped(uint256 indexed tokenId, address indexed holder, uint256 artworkId, uint256 shares);

    error NotHolder();
    error UnwrapBlocked();

    constructor(address admin, ShareVault _vault) ERC721("Amphora Sherd", "SHERD") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        vault = _vault;
    }

    function mint(
        address to,
        uint256 artworkId,
        uint256 shares,
        uint32 machineId
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        tokenId = _nextId++;
        uint32 serial = ++serialCounter[artworkId];

        _certs[tokenId] = Certificate({
            artworkId: artworkId,
            shares: shares,
            mintValueWei: uint128(vault.valueOfShares(artworkId, shares)),
            mintedAt: uint40(block.timestamp),
            machineId: machineId,
            serial: serial
        });
        _safeMint(to, tokenId);

        emit CertificateMinted(tokenId, to, artworkId, shares, _certs[tokenId].mintValueWei, serial);
    }

    /// @notice Burn the certificate and take the underlying shares.
    ///         Reverts for restricted assets — ShareVault.releaseShares enforces
    ///         it, so a certificate over a whitelist-gated security can never be
    ///         unwrapped to a non-whitelisted wallet by accident.
    function unwrap(uint256 tokenId) external {
        if (redeemed[tokenId]) revert Soulbound();
        if (ownerOf(tokenId) != msg.sender) revert NotHolder();
        Certificate memory c = _certs[tokenId];

        _burn(tokenId);
        delete _certs[tokenId];

        vault.releaseShares(c.artworkId, msg.sender, c.shares);
        emit Unwrapped(tokenId, msg.sender, c.artworkId, c.shares);
    }

    // ------------------------------------------------------- redemption lock

    /// @dev tokenId => permanently locked after physical redemption is claimed.
    mapping(uint256 => bool) public redeemed;

    error Soulbound();
    error AlreadyRedeemed();

    event RedemptionClaimed(uint256 indexed tokenId, address indexed owner);

    /// @notice Physical redemption claim (Rev 02.1 §12): the certificate is
    ///         LOCKED soulbound at claim, not burned — it survives as the
    ///         physical's on-chain twin (NFC page stays live) but can never be
    ///         transferred, listed, or desk-acquired again. One-way by design:
    ///         delivery problems are ops matters, never on-chain undo.
    ///         Caller: the redemption service (REDEEM_ROLE) after shipping is
    ///         paid; ties to the POD webhook off-chain.
    function claimRedemption(uint256 tokenId, address owner_) external onlyRole(REDEEM_ROLE) {
        if (ownerOf(tokenId) != owner_) revert NotHolder();
        if (redeemed[tokenId]) revert AlreadyRedeemed();
        redeemed[tokenId] = true;
        emit RedemptionClaimed(tokenId, owner_);
    }

    /// @notice Buyback desk path: take the certificate in exchange for HYPE.
    ///         The desk pays out and the certificate returns to the prize pool.
    function deskAcquire(uint256 tokenId, address from) external onlyRole(DESK_ROLE) {
        if (redeemed[tokenId]) revert Soulbound();
        _update(msg.sender, tokenId, from);
    }

    /// @dev OZ v5 transfer hook: redeemed certificates are soulbound — any
    ///      transfer (sale, gift, marketplace settlement) reverts. Minting is
    ///      unaffected (a token can't be redeemed before it exists).
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        if (redeemed[tokenId]) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    // ------------------------------------------------------------------ views

    function certificateOf(uint256 tokenId) external view returns (Certificate memory) {
        return _certs[tokenId];
    }

    /// @notice Current NAV value of the certificate. This is what the buyback desk
    ///         quotes 80% of, and what the collection page displays.
    function currentValueWei(uint256 tokenId) external view returns (uint256) {
        Certificate memory c = _certs[tokenId];
        return vault.valueOfShares(c.artworkId, c.shares);
    }

    /// @notice Ownership share in basis points, for the wall label's second line.
    function ownershipBps(uint256 tokenId) external view returns (uint256) {
        Certificate memory c = _certs[tokenId];
        return vault.ownershipBps(c.artworkId, c.shares);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        // Metadata is rendered per-certificate by the API: artwork image, artist,
        // title, share count, ownership percentage, and the serial number.
        return string.concat(_baseTokenUri, _toString(tokenId));
    }

    string private _baseTokenUri = "https://api.amphora.example/certificate/";

    function setBaseUri(string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenUri = uri;
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory b = new bytes(d);
        while (v != 0) { b[--d] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
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
