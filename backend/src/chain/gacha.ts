import 'dotenv/config';
import { type Address } from 'viem';

export const gachaAbi = [
  // PAYABLE: send exactly machines(machineId).priceWei of native HYPE as value.
  { type: 'function', name: 'openBox', stateMutability: 'payable',
    inputs: [{ name: 'machineId', type: 'uint32' }, { name: 'clientSeed', type: 'bytes32' }],
    outputs: [{ name: 'drawId', type: 'uint256' }] },
  { type: 'function', name: 'refundUnsettled', stateMutability: 'nonpayable',
    inputs: [{ name: 'drawId', type: 'uint256' }], outputs: [] },
  { type: 'error', name: 'WrongPayment', inputs: [] },
  { type: 'function', name: 'committedHash', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bytes32' }] },
  { type: 'function', name: 'settleDraw', stateMutability: 'nonpayable',
    inputs: [{ name: 'drawId', type: 'uint256' }, { name: 'serverSeed', type: 'bytes32' }],
    outputs: [] },
  { type: 'function', name: 'commitSeedChain', stateMutability: 'nonpayable',
    inputs: [{ name: 'commitment', type: 'bytes32' }, { name: 'length', type: 'uint64' }],
    outputs: [] },
  { type: 'event', name: 'BoxOpened', inputs: [
    { name: 'drawId', type: 'uint256', indexed: true },
    { name: 'user', type: 'address', indexed: true },
    { name: 'machineId', type: 'uint32', indexed: true },
    { name: 'clientSeed', type: 'bytes32', indexed: false },
    { name: 'seedIndex', type: 'uint64', indexed: false } ] },
  { type: 'event', name: 'DrawSettled', inputs: [
    { name: 'drawId', type: 'uint256', indexed: true },
    { name: 'user', type: 'address', indexed: true },
    { name: 'tier', type: 'uint8', indexed: false },
    { name: 'artworkId', type: 'uint256', indexed: false },
    { name: 'shares', type: 'uint256', indexed: false },
    { name: 'certificateId', type: 'uint256', indexed: false },
    { name: 'serverSeed', type: 'bytes32', indexed: false } ] },
] as const;

export const GACHA_ABI = gachaAbi;

export const gachaAddress = (process.env.GACHA_ADDRESS ?? '0x0000000000000000000000000000000000000000') as Address;
