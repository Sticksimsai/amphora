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

  // Hero: a still and a short looping film of the same picture, shown in the arch.
  // Leave blank to use the bundled fresco. Prefer files committed under img/.
  // These two currently point at Higgsfield's file host. That is a stopgap:
  // download both, commit them under img/, and change these to 'img/hero.jpg'
  // and 'img/hero.mp4' so the site does not depend on someone else's storage.
  heroImage: 'https://d8j0ntlcm91z4.cloudfront.net/user_38mxUVWFOcVXT8mCZ9tfkU8JtiI/hf_20261111_180214_5fb88722-c468-4d7c-8a99-4944a89e2368.png',
  heroVideo: 'https://d8j0ntlcm91z4.cloudfront.net/user_38mxUVWFOcVXT8mCZ9tfkU8JtiI/hf_20261111_180348_5bb31511-8218-4143-9223-4814c3d3a174.mp4',

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
