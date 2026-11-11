// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {ShareCertificate721} from "../src/ShareCertificate721.sol";

/// Certificates are the ownership record. They must be honest and hard to forge.
contract CertificateTest is Base {
    function test_certificateRecordsTheDraw() public {
        uint256 d = _open(player, keccak256("c1"));
        _settle(d, 0);
        (, , , , , , , uint256 certId, uint256 art, uint256 shares, ) = machine.draws(d);

        assertEq(cert.ownerOf(certId), player, "certificate not owned by the player");
        ShareCertificate721.Certificate memory c = cert.certificateOf(certId);
        assertEq(c.artworkId, art, "wrong artwork recorded");
        assertEq(c.shares, shares, "wrong share count recorded");
        assertEq(c.machineId, 1, "wrong machine recorded");
        assertGt(uint256(c.mintValueWei), 0, "no mint value recorded");
        assertGt(uint256(c.serial), 0, "serial not assigned");
    }

    function test_serialsIncrementPerArtwork() public {
        uint256 d1 = _open(player, keccak256("a"));
        _settle(d1, 0);
        uint256 d2 = _open(player, keccak256("b"));
        _settle(d2, 1);

        (, , , , , , , uint256 c1, uint256 a1, , ) = machine.draws(d1);
        (, , , , , , , uint256 c2, uint256 a2, , ) = machine.draws(d2);
        if (a1 == a2) {
            ShareCertificate721.Certificate memory k1 = cert.certificateOf(c1);
            ShareCertificate721.Certificate memory k2 = cert.certificateOf(c2);
            assertEq(k2.serial, k1.serial + 1, "serials did not increment within an artwork");
        }
    }

    function test_onlyMinterCanMint() public {
        vm.prank(other);
        vm.expectRevert();
        cert.mint(other, commonId, 1, 1);
    }

    function test_currentValueTracksNav() public {
        uint256 d = _open(player, keccak256("c1"));
        _settle(d, 0);
        (, , , , , , , uint256 certId, uint256 art, uint256 shares, ) = machine.draws(d);

        uint256 v0 = cert.currentValueWei(certId);
        vm.prank(admin);
        vault.updateNav(art, COMMON_MARK * 2, uint40(block.timestamp + 90 days));
        uint256 v1 = cert.currentValueWei(certId);
        assertGt(v1, v0, "certificate value did not follow the mark");
        assertEq(v1, shares * COMMON_MARK * 2, "value is not shares x mark");
    }
}
