// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {GachaMachine} from "../src/GachaMachine.sol";
import {ShareVault} from "../src/ShareVault.sol";

contract RejectingTreasury {
    bool public accept;
    function setAccept(bool a) external { accept = a; }
    receive() external payable { require(accept, "no"); }
}

/// What changed in the port: boxes are paid in native HYPE, and the two gaps
/// the original knowingly left open (no removeFromTier, no sweep) are closed.
contract NativeTest is Base {
    function test_boxMustBePaidExactly() public {
        vm.startPrank(player);
        vm.expectRevert(GachaMachine.WrongPayment.selector);
        machine.openBox{value: PRICE - 1}(1, keccak256("c"));
        vm.expectRevert(GachaMachine.WrongPayment.selector);
        machine.openBox{value: PRICE + 1}(1, keccak256("c"));
        vm.expectRevert(GachaMachine.WrongPayment.selector);
        machine.openBox(1, keccak256("c"));
        vm.stopPrank();
    }

    function test_machineHoldsPriceUntilSettleThenTreasuryGetsIt() public {
        uint256 d = _open(player, keccak256("c1"));
        assertEq(address(machine).balance, PRICE, "machine is not holding the box price");
        uint256 t0 = treasury.balance;
        _settle(d, 0);
        assertEq(address(machine).balance, 0, "HYPE left behind after settle");
        assertEq(treasury.balance, t0 + PRICE, "treasury did not rise by the box price");
    }

    function test_revertingTreasuryCannotBlockSettlement() public {
        RejectingTreasury rt = new RejectingTreasury();
        vm.prank(admin);
        machine.setTreasury(address(rt));

        uint256 d = _open(player, keccak256("c1"));
        _settle(d, 0); // must not revert
        (, , , , , , bool settled, uint256 certId, , , ) = machine.draws(d);
        assertTrue(settled);
        assertEq(cert.ownerOf(certId), player);
        assertEq(machine.treasuryOwed(), PRICE, "owed amount not booked");

        rt.setAccept(true);
        machine.flushTreasury();
        assertEq(address(rt).balance, PRICE);
        assertEq(machine.treasuryOwed(), 0);
    }

    function test_removeFromTierMakesWorkUnreachable() public {
        // a second common work, so the tier is not empty after removal
        vm.startPrank(admin);
        uint256 second = _register("Second Common", 100_000, COMMON_MARK);
        vault.commitToPrizePool(second, 1, 1, 100_000);
        vault.removeFromTier(commonId, 1, 1);
        vm.stopPrank();

        uint256[] memory ids = vault.tierArtworks(1, 1);
        assertEq(ids.length, 1);
        assertEq(ids[0], second);
        assertEq(vault.committed(commonId, 1), 0);
        assertEq(vault.totalCommitted(commonId), 0);

        for (uint256 i = 0; i < 40; i++) {
            uint256 d = _open(player, keccak256(abi.encode("r", i)));
            _settle(d, i);
            (, , , , , , , , uint256 art, , ) = machine.draws(d);
            assertTrue(art != commonId, "a removed work was drawn");
        }
    }

    function test_removeFromTierRejectsUnknownWork() public {
        vm.prank(admin);
        vm.expectRevert(ShareVault.NotInTier.selector);
        vault.removeFromTier(commonId, 1, 2);
    }

    function test_sweepOnlyAfterThirtyDaysAndOnlyByAdmin() public {
        uint256 d = _open(player, keccak256("c1"));

        vm.warp(block.timestamp + 29 days);
        vm.prank(admin);
        vm.expectRevert(GachaMachine.TooEarly.selector);
        machine.sweepAbandoned(d);

        vm.warp(block.timestamp + 2 days);
        vm.prank(other);
        vm.expectRevert();
        machine.sweepAbandoned(d);

        uint256 t0 = treasury.balance;
        vm.prank(admin);
        machine.sweepAbandoned(d);
        assertEq(treasury.balance, t0 + PRICE);

        // and the player can no longer refund what was swept
        vm.prank(player);
        vm.expectRevert(GachaMachine.AlreadySettled.selector);
        machine.refundUnsettled(d);
    }

    function test_playerCanStillRefundRightUpToTheSweep() public {
        uint256 d = _open(player, keccak256("c1"));
        vm.warp(block.timestamp + 29 days);
        uint256 b0 = player.balance;
        vm.prank(player);
        machine.refundUnsettled(d);
        assertEq(player.balance, b0 + PRICE);

        vm.warp(block.timestamp + 5 days);
        vm.prank(admin);
        vm.expectRevert(GachaMachine.AlreadySettled.selector);
        machine.sweepAbandoned(d);
    }

    function test_cannotSettleADrawThatDoesNotExist() public {
        vm.prank(settler);
        vm.expectRevert(GachaMachine.NoSuchDraw.selector);
        machine.settleDraw(999, seeds[0]);
    }

    function test_expectedValueIsSeventyFourPercent() public view {
        uint256 ev = machine.expectedValueWei(1);
        // 0.978392*0.35 + 0.019608*1.05 + 0.002*3.5 = 0.3700256 HYPE on a 0.5 box
        assertApproxEqAbs(ev, 0.3700256 ether, 1e12);
        assertEq((ev * 100) / PRICE, 74);
    }
}
