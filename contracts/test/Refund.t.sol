// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {GachaMachine} from "../src/GachaMachine.sol";

/// A player's money must never be trapped by a settler that never comes.
contract RefundTest is Base {
    function test_refundAfterTimeoutReturnsFullPrice() public {
        uint256 balBefore = player.balance;
        uint256 d = _open(player, keccak256("c1"));
        assertEq(player.balance, balBefore - PRICE, "price not taken");

        vm.warp(block.timestamp + 8 days);
        vm.prank(player);
        machine.refundUnsettled(d);
        assertEq(player.balance, balBefore, "refund did not restore the full price");
    }

    function test_refundTooEarlyReverts() public {
        uint256 d = _open(player, keccak256("c1"));
        vm.prank(player);
        vm.expectRevert(GachaMachine.TooEarly.selector);
        machine.refundUnsettled(d);
    }

    function test_cannotRefundSomeoneElsesDraw() public {
        uint256 d = _open(player, keccak256("c1"));
        vm.warp(block.timestamp + 8 days);
        vm.prank(other);
        vm.expectRevert(GachaMachine.NotYourDraw.selector);
        machine.refundUnsettled(d);
    }

    function test_cannotRefundASettledDraw() public {
        uint256 d = _open(player, keccak256("c1"));
        _settle(d, 0);
        vm.warp(block.timestamp + 8 days);
        vm.prank(player);
        vm.expectRevert(GachaMachine.AlreadySettled.selector);
        machine.refundUnsettled(d);
    }

    function test_cannotSettleAfterRefund() public {
        uint256 d = _open(player, keccak256("c1"));
        vm.warp(block.timestamp + 8 days);
        vm.prank(player);
        machine.refundUnsettled(d);
        vm.prank(settler);
        vm.expectRevert(GachaMachine.AlreadySettled.selector);
        machine.settleDraw(d, seeds[0]);
    }
}
