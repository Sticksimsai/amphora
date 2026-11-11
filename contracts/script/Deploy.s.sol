// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Script.sol";
import "../src/ShareVault.sol";
import "../src/ShareCertificate721.sol";
import "../src/GachaMachine.sol";
import "../src/EditionFactory.sol";
import "../src/PrimarySale.sol";

/// Amphora on Elysium (Kinetiq's Arbitrum Orbit L2, settles to HyperEVM).
/// Mainnet chain id 99901, testnet 99801. Gas AND payment are native HYPE,
/// so there is no pay-token to deploy or point at.
///
/// Five identities, never one (docs/KEYS.md). The original deploy script
/// granted OPERATOR_ROLE to the wrong address and DESK/REDEEM not at all,
/// which caused three mainnet reverts. Every role is granted here, to a
/// separately named address, and printed.
contract Deploy is Script {
    function run() external {
        address admin    = vm.envAddress("ADMIN");        // hardware wallet
        address curator  = vm.envAddress("CURATOR");      // induction key: curator / NAV / series / operator
        address settler  = vm.envAddress("SETTLER");      // settler service: gas only
        address desk     = vm.envAddress("DESK");         // buyback desk: bounded HYPE float
        address redeemer = vm.envOr("REDEEMER", desk);    // redemption service
        address treasury = vm.envAddress("TREASURY");     // plain wallet / Safe

        // The broadcaster must be ADMIN for the role grants below to succeed.
        vm.startBroadcast();

        ShareVault vault = new ShareVault(admin);
        ShareCertificate721 cert = new ShareCertificate721(admin, vault);
        GachaMachine gacha = new GachaMachine(admin, vault, cert, treasury);
        EditionFactory factory = new EditionFactory(admin, vault);
        PrimarySale mint = new PrimarySale(admin, vault, cert, treasury);

        // contracts
        vault.grantRole(vault.POOL_ROLE(), address(gacha));
        vault.grantRole(vault.POOL_ROLE(), address(mint));
        vault.grantRole(vault.POOL_ROLE(), address(cert));     // unwrap -> releaseShares
        vault.grantRole(vault.CURATOR_ROLE(), address(factory));
        cert.grantRole(cert.MINTER_ROLE(), address(gacha));
        cert.grantRole(cert.MINTER_ROLE(), address(mint));

        // people
        vault.grantRole(vault.CURATOR_ROLE(), curator);
        vault.grantRole(vault.NAV_ROLE(), curator);
        factory.grantRole(factory.SERIES_ROLE(), curator);
        gacha.grantRole(gacha.OPERATOR_ROLE(), curator);
        gacha.grantRole(gacha.SETTLER_ROLE(), settler);
        cert.grantRole(cert.DESK_ROLE(), desk);
        cert.grantRole(cert.REDEEM_ROLE(), redeemer);

        vm.stopBroadcast();

        console2.log("chainid     ", block.chainid);
        console2.log("VAULT_ADDRESS   ", address(vault));
        console2.log("CERT_ADDRESS    ", address(cert));
        console2.log("GACHA_ADDRESS   ", address(gacha));
        console2.log("FACTORY_ADDRESS ", address(factory));
        console2.log("MINT_ADDRESS    ", address(mint));
        console2.log("TREASURY_ADDRESS", treasury);
    }
}
