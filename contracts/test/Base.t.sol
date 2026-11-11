// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ShareVault} from "../src/ShareVault.sol";
import {ShareCertificate721} from "../src/ShareCertificate721.sol";
import {GachaMachine} from "../src/GachaMachine.sol";

contract ShareToken is ERC20 {
    constructor(string memory n, uint256 supply, address holder) ERC20(n, "SHR") { _mint(holder, supply); }
    function decimals() public pure override returns (uint8) { return 0; }
}

/// Shared fixture: a vault, certificates, a machine, three classes of inventory
/// stocked with the published ladder, denominated in HYPE.
abstract contract Base is Test {
    uint32 constant PPM = 1_000_000;
    // Everything is native HYPE (18dp). The ladder keeps the original ratios:
    // box 1.0x · common 0.7x · rarity 2.1x · crown 7.0x  =>  EV 74%.
    uint128 constant PRICE       = 0.5 ether;
    uint128 constant COMMON_MARK = 0.35 ether;
    uint128 constant RARITY_MARK = 1.05 ether;
    uint128 constant CROWN_MARK  = 3.5 ether;

    address admin    = address(0xA11CE);
    address settler  = address(0x5E77);
    address treasury = address(0x7BEA);
    address player   = address(0xBEEF);
    address other    = address(0xCAFE);

    ShareVault vault;
    ShareCertificate721 cert;
    GachaMachine machine;

    uint256 commonId;
    uint256 rarityId;
    uint256 crownId;

    // seed chain: seeds[0] is the tip's preimage
    bytes32[] seeds;
    uint64 constant START_INDEX = 100_000;

    function setUp() public virtual {
        vm.startPrank(admin);
        vault = new ShareVault(admin);
        cert = new ShareCertificate721(admin, vault);
        machine = new GachaMachine(admin, vault, cert, treasury);

        vault.grantRole(vault.CURATOR_ROLE(), admin);
        vault.grantRole(vault.NAV_ROLE(), admin);
        vault.grantRole(vault.POOL_ROLE(), address(machine));
        cert.grantRole(cert.MINTER_ROLE(), address(machine));
        machine.grantRole(machine.SETTLER_ROLE(), settler);
        machine.grantRole(machine.OPERATOR_ROLE(), admin);

        commonId = _register("Common Work", 100_000, COMMON_MARK);
        rarityId = _register("Rarity Work", 5_000, RARITY_MARK);
        crownId  = _register("Crown Work", 1_000, CROWN_MARK);

        vault.commitToPrizePool(commonId, 1, 1, 100_000);
        vault.commitToPrizePool(rarityId, 1, 2, 5_000);
        vault.commitToPrizePool(crownId, 1, 3, 1_000);

        _configureLadder();
        _commitSeedChain();
        vm.stopPrank();

        vm.deal(player, 10_000 ether);
        vm.deal(other, 100 ether);
    }

    function _register(string memory name, uint256 cap, uint128 mark) internal returns (uint256 id) {
        ShareToken t = new ShareToken(name, cap, address(vault));
        id = vault.registerArtwork(IERC20(address(t)), 0, false, ShareVault.Prestige.EMERGING,
            cap, "Amphora Editions", name, "ipfs://x");
        vault.updateNav(id, mark, uint40(block.timestamp + 90 days));
    }

    function _configureLadder() internal {
        uint32[5] memory odds = [uint32(0), 978392, 19608, 2000, 0];
        uint128[5] memory floors = [uint128(0), COMMON_MARK, RARITY_MARK, CROWN_MARK, 0];
        uint128[5] memory caps   = [uint128(0), COMMON_MARK, RARITY_MARK, CROWN_MARK, 0];
        machine.configureMachine(1, PRICE, odds, floors, caps);
    }

    /// NOTE: pool depths here are deliberately far larger than a real edition —
    /// the odds test draws 400 boxes and must not exhaust inventory mid-run.
    /// Edition-cap semantics are covered in Certificate.t.sol.

    /// Builds a hash chain: commit = keccak(seeds[0]); revealing seeds[0] sets
    /// the commitment to seeds[0], whose preimage is seeds[1], and so on.
    function _commitSeedChain() internal {
        seeds = new bytes32[](600);
        bytes32 s = keccak256("amphora-root");
        for (uint256 i = 599; ; --i) {
            seeds[i] = s;
            s = keccak256(abi.encodePacked(s));
            if (i == 0) break;
        }
        machine.commitSeedChain(keccak256(abi.encodePacked(seeds[0])), START_INDEX);
    }

    function _open(address who, bytes32 clientSeed) internal returns (uint256 drawId) {
        vm.prank(who);
        drawId = machine.openBox{value: PRICE}(1, clientSeed);
    }

    function _settle(uint256 drawId, uint256 seedIdx) internal {
        vm.prank(settler);
        machine.settleDraw(drawId, seeds[seedIdx]);
    }
}
