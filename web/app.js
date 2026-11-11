/* Amphora site. No build step, no dependencies.
   Wallet: EIP-6963 discovery, hand-defined chain, one payable transaction. */
(() => {
  const C = window.AMPHORA;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => { const s = n.toFixed(4).replace(/0+$/, ''); const d = (s.split('.')[1] || '').length; return d < 2 ? n.toFixed(2) : s; };
  const STAR = '<svg class="star" viewBox="-50 -50 100 100" aria-hidden="true"><path d="M0-49 7-7 49 0 7 7 0 49-7 7-49 0-7-7Z"/></svg>';

  // ── the ladder ────────────────────────────────────────────────────────
  function renderLadder(box, classes) {
    let ev = 0;
    $('rows').innerHTML = classes.map((k, i) => {
      const mark = box * k.markX, desk = mark * C.deskRate;
      ev += mark * k.ppm / 1e6;
      const chance = k.ppm === 0 ? 'Not yet stocked' : k.ppm > 5e5 ? (k.ppm / 1e4).toFixed(2) + '%' : '1 in ' + Math.round(1e6 / k.ppm).toLocaleString('en');
      const cls = (i === classes.length - 1 ? 'top' : '') + (k.ppm === 0 ? ' empty' : '');
      return `<tr class="${cls}"><td>${k.name}${STAR.repeat(k.stars)}</td><td>${k.edition}</td><td>${fmt(mark)} HYPE</td><td>${fmt(desk)} HYPE</td><td>${chance}</td></tr>`;
    }).join('');
    $('price').textContent = box.toFixed(2);
    $('ev').textContent = ev.toFixed(2);
    $('evp').textContent = Math.round(ev / box * 100);
    $('f-mark').textContent = fmt(box * classes[0].markX);
    $('f-desk').textContent = fmt(box * classes[0].markX * C.deskRate);
  }
  renderLadder(C.boxPriceHype, C.classes);

  // Live odds, when a backend is configured. Never advertise a class with no stock.
  if (C.api) fetch(C.api + '/public/machines').then((r) => r.json()).then((ms) => {
    const m = ms && ms[0]; if (!m) return;
    const byName = Object.fromEntries(m.tiers.map((t) => [t.name.toUpperCase(), t]));
    renderLadder(m.priceHype, C.classes.map((k) => {
      const t = byName[k.name.toUpperCase()];
      return { ...k, ppm: t && t.available > 0 ? Math.round(t.probability * 1e6) : 0 };
    }));
  }).catch(() => {});

  // ── decoration ────────────────────────────────────────────────────────
  const burst = document.querySelector('.burst');
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, r = i % 2 ? 34 : 48;
    burst.insertAdjacentHTML('beforeend', `<line x1="0" y1="0" x2="${(r * Math.cos(a)).toFixed(1)}" y2="${(r * Math.sin(a)).toFixed(1)}"/>`);
  }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const layers = [...document.querySelectorAll('[data-par]')];
    addEventListener('scroll', () => requestAnimationFrame(() => {
      const y = scrollY; if (y > innerHeight * 1.4) return;
      layers.forEach((el) => { el.style.translate = `0 ${(y * el.dataset.par).toFixed(1)}px`; });
    }), { passive: true });
  }

  // ── motion ────────────────────────────────────────────────────────────
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll reveals: anything marked .rise comes in once, staggered within its section.
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in'); io.unobserve(e.target);
    e.target.querySelectorAll('.count').forEach(countUp);
    if (e.target.classList.contains('count')) countUp(e.target);
  }), { threshold: 0.18 });
  document.querySelectorAll('.rise').forEach((el) => {
    const sibs = [...el.parentElement.children].filter((x) => x.classList.contains('rise'));
    el.style.setProperty('--d', (sibs.indexOf(el) * 0.09) + 's');
    io.observe(el);
  });

  function countUp(el) {
    if (still || el.dataset.done) return; el.dataset.done = 1;
    const to = parseFloat(el.textContent), dp = (el.textContent.split('.')[1] || '').length, t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * e).toFixed(dp); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // Cards: tilt toward the pointer, with a sheen that follows it. On touch
  // devices they answer to the device's own tilt instead.
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    const img = card.querySelector('img');
    card.style.setProperty('--mask', `url(${img.getAttribute('src')})`);
    if (still) return;
    const set = (px, py) => {
      card.style.setProperty('--ry', ((px - 0.5) * 22).toFixed(2) + 'deg');
      card.style.setProperty('--rx', ((0.5 - py) * 16).toFixed(2) + 'deg');
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      card.style.setProperty('--so', 1);
    };
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect(); card.classList.add('live');
      set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('live');
      ['--rx', '--ry'].forEach((k) => card.style.setProperty(k, '0deg')); card.style.setProperty('--so', 0);
    });
  });
  // The hero card also leans gently toward the pointer anywhere over the hero.
  const hero = document.querySelector('.hero'), heroCard = document.querySelector('.hero-card .card');
  if (!still && hero && heroCard) hero.addEventListener('pointermove', (e) => {
    if (heroCard.classList.contains('live')) return;
    const r = hero.getBoundingClientRect();
    heroCard.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 12).toFixed(2) + 'deg');
    heroCard.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * 8).toFixed(2) + 'deg');
  });

  // Hero film: a short loop over its own first frame. The clip begins and ends
  // on the still, so it is faded in once it can play and simply loops.
  const vid = $('hero-video'), stillImg = $('hero-still');
  if (C.heroImage) { stillImg.onerror = () => { stillImg.onerror = null; stillImg.src = 'img/fresco.jpg'; }; stillImg.src = C.heroImage; }
  if (C.heroVideo && !still) {
    vid.loop = true; vid.src = C.heroVideo;
    vid.addEventListener('canplay', () => { vid.play().then(() => vid.classList.add('on')).catch(() => {}); }, { once: true });
    new IntersectionObserver(([e]) => { e.isIntersecting ? vid.play().catch(() => {}) : vid.pause(); }).observe(vid);
  }

  // ── wallet ────────────────────────────────────────────────────────────
  const HEX = '0x' + C.chainId.toString(16);
  const SEL_OPEN = '0xfc834bcb';       // openBox(uint32,bytes32)
  const SEL_MACHINES = '0x65a08916';   // machines(uint32) -> (uint128 priceWei, bool active, uint32 version)
  const pad = (h) => h.replace(/^0x/, '').padStart(64, '0');
  const say = (html) => { $('status').innerHTML = html; };
  const live = /^0x[0-9a-fA-F]{40}$/.test(C.GACHA);
  let provider = null, account = null, priceWei = null;

  // EIP-6963: let the user's wallets announce themselves. Do not trust
  // window.ethereum alone; one extension can override another's.
  const found = [];
  addEventListener('eip6963:announceProvider', (e) => { if (!found.some((f) => f.info.uuid === e.detail.info.uuid)) found.push(e.detail); });
  dispatchEvent(new Event('eip6963:requestProvider'));

  async function rpc(method, params) { return provider.request({ method, params }); }

  async function ensureChain() {
    try { await rpc('wallet_switchEthereumChain', [{ chainId: HEX }]); }
    catch (e) {
      if (e.code !== 4902 && !/unrecognized|not been added|unknown chain/i.test(e.message || '')) throw e;
      await rpc('wallet_addEthereumChain', [{ chainId: HEX, chainName: C.chainName,
        nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 }, rpcUrls: [C.rpcUrl], blockExplorerUrls: [C.explorer] }]);
    }
    // Several wallets resolve the switch without switching. Read it back.
    const now = await rpc('eth_chainId', []);
    if (parseInt(now, 16) !== C.chainId) throw new Error('Switch your wallet to Elysium to continue.');
  }

  async function refresh() {
    if (!account) return;
    const bal = BigInt(await rpc('eth_getBalance', [account, 'latest']));
    $('wallet').textContent = account.slice(0, 6) + '…' + account.slice(-4);
    if (!live) { say(`${fmt(Number(bal) / 1e18)} HYPE in this wallet. The amphora is not open yet.`); return; }
    const out = await rpc('eth_call', [{ to: C.GACHA, data: SEL_MACHINES + pad(C.machineId.toString(16)) }, 'latest']);
    priceWei = BigInt('0x' + out.slice(2, 66));
    const active = BigInt('0x' + out.slice(66, 130)) === 1n;
    $('price').textContent = (Number(priceWei) / 1e18).toFixed(2);
    const btn = $('draw');
    if (!active) { btn.disabled = true; btn.textContent = 'Closed'; say(''); return; }
    if (bal < priceWei + 10n ** 15n) {
      btn.disabled = false; btn.textContent = 'Get HYPE on Elysium'; btn.onclick = () => open(C.bridge, '_blank', 'noopener');
      say(`${fmt(Number(bal) / 1e18)} HYPE in this wallet. A box needs ${fmt(Number(priceWei) / 1e18)} plus gas.`); return;
    }
    btn.disabled = false; btn.textContent = `Draw · ${fmt(Number(priceWei) / 1e18)} HYPE`; btn.onclick = draw;
    say('');
  }

  async function connect() {
    try {
      provider = (found[0] && found[0].provider) || window.ethereum;
      if (!provider) { say('No wallet found. Install one, then reload.'); return; }
      [account] = await rpc('eth_requestAccounts', []);
      await ensureChain();
      provider.on && provider.on('chainChanged', () => location.reload());
      provider.on && provider.on('accountsChanged', (a) => { account = a[0] || null; account ? refresh() : location.reload(); });
      await refresh();
    } catch (e) { say(e.message || 'Could not connect.'); }
  }

  async function draw() {
    const btn = $('draw');
    try {
      btn.disabled = true;
      await ensureChain();
      // Re-read the price right before sending: the contract takes the exact amount or reverts.
      await refresh(); btn.disabled = true;
      const seed = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
      say('Confirm in your wallet. One transaction, nothing to approve first.');
      const hash = await rpc('eth_sendTransaction', [{ from: account, to: C.GACHA, value: '0x' + priceWei.toString(16),
        data: SEL_OPEN + pad(C.machineId.toString(16)) + seed }]);
      say(`Box opened. The seed is being revealed. <a href="${C.explorer}/tx/${hash}" target="_blank" rel="noopener">View the transaction</a>. If it has not settled in ten minutes you can take your HYPE back from the contract.`);
    } catch (e) {
      say(e.code === 4001 ? 'Cancelled. Nothing was sent.' : /WrongPayment/.test(e.message || '') ? 'The box price changed. Try again.' : (e.message || 'The transaction did not go through.'));
    } finally { refresh().catch(() => {}); }
  }

  $('wallet').onclick = connect;
  if (live) { const b = $('draw'); b.disabled = false; b.textContent = 'Connect to draw'; b.onclick = connect; }
})();
