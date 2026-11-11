// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./ShareVault.sol";
import "./ShareCertificate721.sol";

/// @title PrimarySale — the mint path. Direct purchase of in-house edition
///        certificates at the mark, paid in native HYPE.
/// @dev   No chance element anywhere in this contract: pay mark, receive one
///        numbered unit wrapped as a certificate. The clean e-commerce front
///        door standing beside the gacha (Rev 02.1). Draw-pool inventory is
///        untouched: sales debit only the allocation committed to THIS
///        contract's pseudo-machine id, so machine restock invariants hold.
contract PrimarySale is AccessControl {
    bytes32 public constant OPS_ROLE = keccak256("OPS_ROLE");

    /// @dev pool id under which mintable allocations are committed in the vault
    ///      (commitToPool(artworkId, MINT_POOL_ID, units) during registration).
    uint32 public constant MINT_POOL_ID = 999;

    ShareVault public immutable vault;
    ShareCertificate721 public immutable certificate;
    address public treasury;

    /// @dev artworkId => open for direct mint
    mapping(uint256 => bool) public mintable;

    error NotMintable();
    error NavStale();
    error WrongPayment();
    error TransferFailed();

    event MintOpened(uint256 indexed artworkId, bool open);
    event Minted(
        uint256 indexed artworkId,
        address indexed buyer,
        uint256 certId,
        uint256 paidWei
    );

    constructor(
        address admin,
        ShareVault vault_,
        ShareCertificate721 cert_,
        address treasury_
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPS_ROLE, admin);
        vault = vault_;
        certificate = cert_;
        treasury = treasury_;
    }

    function setMintable(uint256 artworkId, bool open) external onlyRole(OPS_ROLE) {
        mintable[artworkId] = open;
        emit MintOpened(artworkId, open);
    }

    /// @notice Buy one numbered unit of an edition at its current mark.
    ///         Price = navPerShareWei × 1 unit (0-decimals editions: 1 token
    ///         = 1 copy). Certificate serial = edition number, as everywhere.
    function buyCertificate(uint256 artworkId) external payable returns (uint256 certId) {
        if (!mintable[artworkId]) revert NotMintable();
        uint256 price = vault.valueOfShares(artworkId, 1);
        if (price == 0) revert NavStale();

        if (msg.value != price) revert WrongPayment();

        vault.debitForPrize(artworkId, MINT_POOL_ID, 1);
        certId = certificate.mint(msg.sender, artworkId, 1, MINT_POOL_ID);
        (bool ok, ) = treasury.call{value: price}("");
        if (!ok) revert TransferFailed();

        emit Minted(artworkId, msg.sender, certId, price);
    }
}
