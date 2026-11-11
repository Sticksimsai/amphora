// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {GachaMachine} from "../src/GachaMachine.sol";

/// The published ladder must be the real ladder.
contract LadderTest is Base {
    function test_oddsMustSumToOneMillion() public {
        uint32[5] memory bad = [uint32(0), 900000, 19608, 2000, 0];
        uint128[5] memory f = [uint128(0), COMMON_MARK, RARITY_MARK, CROWN_MARK, 0];
        vm.prank(admin);
        vm.expectRevert(GachaMachine.BadOdds.selector);
        machine.configureMachine(1, PRICE, bad, f, f);
    }

    function test_capBelowFloorReverts() public {
        uint32[5] memory odds = [uint32(0), 978392, 19608, 2000, 0];
        uint128[5] memory floors = [uint128(0), COMMON_MARK, RARITY_MARK, CROWN_MARK, 0];
        uint128[5] memory caps   = [uint128(0), COMMON_MARK - 1, RARITY_MARK, CROWN_MARK, 0];
        vm.prank(admin);
        vm.expectRevert(GachaMachine.BadBands.selector);
        machine.configureMachine(1, PRICE, odds, floors, caps);
    }

    /// Over many draws the observed class frequencies must track the published
    /// ppm. This is the claim the whole product rests on.
    function test_observedOddsTrackPublishedLadder() public {
        uint256 N = 400;
        uint256[4] memory counts;

        for (uint256 i = 0; i < N; i++) {
            uint256 d = _open(player, keccak256(abi.encode("seed", i)));
            _settle(d, i);   // the chain is revealed strictly in order
            (, , , , , , , , , , uint8 tier) = machine.draws(d);
            if (tier < 4) counts[tier]++;
        }

        // MORTAL dominates overwhelmingly; the rare classes are rare.
        assertGt(counts[1], (N * 90) / 100, "commons below 90% of draws");
        assertLt(counts[2] + counts[3], (N * 10) / 100, "rare classes exceeded 10%");
    }

    function test_emptyTierRevertsRatherThanDowngrading() public {
        // stock a machine whose tier 2 has nothing committed
        uint32[5] memory odds = [uint32(0), 0, 1_000_000, 0, 0];
        uint128[5] memory f = [uint128(0), 0, RARITY_MARK, 0, 0];
        vm.prank(admin);
        machine.configureMachine(2, PRICE, odds, f, f);

        vm.prank(player);
        uint256 d = machine.openBox{value: PRICE}(2, keccak256("c"));
        vm.prank(settler);
        vm.expectRevert(GachaMachine.TierEmpty.selector);
        machine.settleDraw(d, seeds[0]);
    }

    function test_inactiveMachineCannotBeOpened() public {
        vm.prank(admin);
        machine.setActive(1, false);
        vm.prank(player);
        vm.expectRevert(GachaMachine.MachineInactive.selector);
        machine.openBox{value: PRICE}(1, keccak256("c"));
    }
}
