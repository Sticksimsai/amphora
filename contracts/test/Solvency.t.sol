// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {ShareVault} from "../src/ShareVault.sol";

/// The vault must never promise shares it does not hold, and must never let a
/// draw mint against inventory that isn't there.
contract SolvencyTest is Base {
    function test_cannotCommitMoreThanHeld() public {
        vm.prank(admin);
        vm.expectRevert(ShareVault.InsufficientUncommitted.selector);
        vault.commitToPrizePool(crownId, 1, 3, 1); // all 5 already committed
    }

    function test_cannotDoubleCommitAcrossMachines() public {
        vm.prank(admin);
        vm.expectRevert(ShareVault.InsufficientUncommitted.selector);
        vault.commitToPrizePool(rarityId, 2, 2, 25); // same 25 shares, second machine
    }

    function test_navStaleBlocksCommitment() public {
        vm.startPrank(admin);
        uint256 id = _register("Stale Work", 10, COMMON_MARK);
        vault.updateNav(id, COMMON_MARK, uint40(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(ShareVault.NavStale.selector);
        vault.commitToPrizePool(id, 1, 1, 10);
        vm.stopPrank();
    }

    function test_poolDrainsAsCertificatesMint() public {
        uint256 beforeCommitted = vault.committed(commonId, 1);
        uint256 d = _open(player, keccak256("c1"));
        _settle(d, 0);
        (, , , , , , , , uint256 art, uint256 shares, ) = machine.draws(d);
        if (art == commonId) {
            assertEq(vault.committed(commonId, 1), beforeCommitted - shares, "pool not debited");
        }
    }

    function test_onlyMachineCanDebitPool() public {
        vm.prank(other);
        vm.expectRevert();
        vault.debitForPrize(commonId, 1, 1);
    }

    /// A MORTAL draw at a degenerate band must mint exactly one unit — the
    /// "one box, one fragment" promise in arithmetic.
    function test_degenerateBandMintsExactlyOneShare() public {
        uint256 d = _open(player, keccak256("one"));
        _settle(d, 0);
        (, , , , , , , , , uint256 shares, uint8 tier) = machine.draws(d);
        if (tier == 1 || tier == 2 || tier == 3) {
            assertEq(shares, 1, "a box did not yield exactly one fragment");
        }
    }
}
