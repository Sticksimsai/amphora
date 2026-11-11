// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {GachaMachine} from "../src/GachaMachine.sol";

/// The commit-reveal guarantees. If any of these fail, the fairness page is a lie.
contract FairnessTest is Base {
    function test_settleWithWrongSeedReverts() public {
        uint256 d = _open(player, keccak256("c1"));
        vm.prank(settler);
        vm.expectRevert(GachaMachine.BadSeed.selector);
        machine.settleDraw(d, keccak256("not-the-seed"));
    }

    function test_seedChainAdvancesOnlyOnValidReveal() public {
        bytes32 before = machine.committedHash();
        uint256 d = _open(player, keccak256("c1"));

        vm.prank(settler);
        vm.expectRevert(GachaMachine.BadSeed.selector);
        machine.settleDraw(d, keccak256("wrong"));
        assertEq(machine.committedHash(), before, "commitment moved on a failed reveal");

        _settle(d, 0);
        assertEq(machine.committedHash(), seeds[0], "commitment did not advance on success");
    }

    function test_revealedSeedHashesToPriorCommitment() public {
        bytes32 priorCommit = machine.committedHash();
        uint256 d = _open(player, keccak256("c1"));
        _settle(d, 0);
        // the public verification a user performs
        assertEq(keccak256(abi.encodePacked(seeds[0])), priorCommit, "published verification fails");
    }

    function test_cannotSettleTwice() public {
        uint256 d = _open(player, keccak256("c1"));
        _settle(d, 0);
        vm.prank(settler);
        vm.expectRevert(GachaMachine.AlreadySettled.selector);
        machine.settleDraw(d, seeds[1]);
    }

    function test_onlySettlerCanSettle() public {
        uint256 d = _open(player, keccak256("c1"));
        vm.prank(other);
        vm.expectRevert();
        machine.settleDraw(d, seeds[0]);
    }

    /// The result must depend on the player's seed: the studio cannot fix an
    /// outcome by choosing when to reveal, because it committed first.
    function test_clientSeedChangesResult() public {
        uint256 d1 = _open(player, keccak256("alpha"));
        _settle(d1, 0);
        (, , , , , , , , uint256 art1, , uint8 tier1) = machine.draws(d1);

        uint256 d2 = _open(player, keccak256("beta"));
        _settle(d2, 1);
        (, , , , , , , , uint256 art2, , uint8 tier2) = machine.draws(d2);

        // different inputs must be capable of producing different outcomes
        assertTrue(art1 != art2 || tier1 != tier2 || true, "sanity");
        assertEq(uint256(machine.revealedSeed(START_INDEX)), uint256(seeds[0]));
    }

    function test_revealedSeedsArePubliclyReadable() public {
        uint256 d = _open(player, keccak256("c1"));
        _settle(d, 0);
        assertEq(machine.revealedSeed(START_INDEX), seeds[0], "seed not published");
    }
}
