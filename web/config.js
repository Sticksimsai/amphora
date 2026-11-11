// Amphora site configuration. Everything on the page is driven from here.
// The site is a preview until GACHA is set: the buy button stays "Opening soon".
window.AMPHORA = {
  // Elysium (Kinetiq's L2 for Hyperliquid). Mainnet 99901, testnet 99801.
  // Define the chain by hand; wallets' built-in "Elysium" may be a different network.
  chainId: 99901,
  chainName: 'Elysium',
  rpcUrl: 'https://rpc.elysium.kinetiq.xyz',          // confirm at elysium.kinetiq.xyz/docs
  explorer: 'https://elysium.kinetiq.xyz/explorer',
  bridge: 'https://elysium.kinetiq.xyz/bridge',

  // Set after deployment (contracts/script/Deploy.s.sol prints it).
  GACHA: '',
  machineId: 1,

  // Optional: the backend. When set, the ladder is read live from /public/machines.
  api: '',

  // Shown until the chain or the API answers. Marks are ratios of the box price.
  boxPriceHype: 0.5,
  classes: [
    { name: 'Mortal',   edition: 300, ppm: 978392, markX: 0.7, stars: 0 },
    { name: 'Hero',     edition: 25,  ppm: 19608,  markX: 2.1, stars: 1 },
    { name: 'Olympian', edition: 5,   ppm: 2000,   markX: 7.0, stars: 2 },
  ],
  deskRate: 0.8,
};
