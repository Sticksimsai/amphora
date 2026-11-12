/* Amphora site. No build step, no dependencies. */
(() => {
  const C = window.AMPHORA;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => { const s = n.toFixed(4).replace(/0+$/, ''); const d = (s.split('.')[1] || '').length; return d < 2 ? n.toFixed(2) : s; };
  const STAR = '<svg class="star" viewBox="-50 -50 100 100" aria-hidden="true"><path d="M0-49 7-7 49 0 7 7 0 49-7 7-49 0-7-7Z"/></svg>';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GRADE = { Mortal: 'VII', Hero: 'X', Olympian: 'Ω' };
  const slabOf = (name) => `img/slab-${name.toLowerCase()}.webp`;

  let box = C.boxPriceHype, classes = C.classes.map((k) => ({ ...k }));

  // ── the ladder, with what you have drawn beside what was published ─────
  const counts = {}; let opened = 0;
  function renderLadder() {
    let ev = 0;
    $('rows').innerHTML = classes.map((k, i) => {
      const mark = box * k.markX; ev += mark * k.ppm / 1e6;
      const pub = k.ppm === 0 ? 'Not stocked' : k.ppm > 5e5 ? (k.ppm / 1e4).toFixed(2) + '%' : '1 in ' + Math.round(1e6 / k.ppm).toLocaleString('en');
      const n = counts[k.name] || 0, pct = opened ? n / opened * 100 : 0;
      return `<tr data-name="${k.name}" class="${i === classes.length - 1 ? 'top' : ''}"><td>${k.name}${STAR.repeat(k.stars)}</td>` +
        `<td>${fmt(mark)}</td><td>${fmt(mark * C.deskRate)}</td><td>${pub}</td>` +
        `<td class="obs bar-cell"><b>${n}</b> · ${pct.toFixed(opened >= 100 ? 2 : 0)}%<i style="--w:${Math.min(100, pct).toFixed(1)}%"></i></td></tr>`;
    }).join('');
    $('price').textContent = $('price2').textContent = box.toFixed(2);
    $('ev').textContent = ev.toFixed(2);
    $('evp').textContent = Math.round(ev / box * 100);
    let marks = 0; classes.forEach((k) => { marks += (counts[k.name] || 0) * box * k.markX; });
    $('t-n').textContent = opened.toLocaleString('en');
    $('t-spent').textContent = (opened * box).toFixed(2);
    $('t-marks').textContent = marks.toFixed(2);
    $('t-desk').textContent = (marks * C.deskRate).toFixed(2);
  }
  renderLadder();

  if (C.api) fetch(C.api + '/public/machines').then((r) => r.json()).then((ms) => {
    const m = ms && ms[0]; if (!m) return;
    const by = Object.fromEntries(m.tiers.map((t) => [t.name.toUpperCase(), t]));
    box = m.priceHype;
    classes = classes.map((k) => { const t = by[k.name.toUpperCase()]; return { ...k, ppm: t && t.available > 0 ? Math.round(t.probability * 1e6) : 0 }; });
    renderLadder(); captions();
  }).catch(() => {});

  // ── the demo machine ──────────────────────────────────────────────────
  // A uniform roll in [0, 1,000,000) from the browser's own entropy, walked
  // down the published ladder exactly as the contract walks it.
  function roll() {
    const buf = new Uint32Array(1); let v;
    do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= 4294000000);   // reject the biased tail
    return v % 1000000;
  }
  function classFor(r) { let acc = 0; for (const k of classes) { acc += k.ppm; if (r < acc) return k; } return classes[0]; }

  const demo = $('demo'); let busy = false;
  function record(k) { counts[k.name] = (counts[k.name] || 0) + 1; opened++; }
  function show(k, r) {
    $('demo-slab').src = slabOf(k.name);
    const res = $('result');
    res.textContent = `${k.name} · ${GRADE[k.name]} · ${fmt(box * k.markX)} HYPE`;
    res.classList.toggle('hot', k.stars > 0);
    $('seed').textContent = `roll ${r.toLocaleString('en')} of 1,000,000`;
    renderLadder();
    const row = document.querySelector(`#rows tr[data-name="${k.name}"]`);
    if (row) { row.classList.add('bump'); setTimeout(() => row.classList.remove('bump'), 650); }
  }
  function drawOnce() {
    if (busy) return; busy = true;
    const r = roll(), k = classFor(r); record(k);
    if (still) { demo.classList.remove('sealed'); show(k, r); busy = false; return; }
    demo.classList.add('sealed'); demo.classList.remove('glow');
    setTimeout(() => demo.classList.add('shake'), demo.classList.contains('was') ? 380 : 0);
    setTimeout(() => {
      demo.classList.remove('shake'); show(k, r);
      demo.classList.remove('sealed'); demo.classList.add('was');
      if (k.stars) demo.classList.add('glow');
      $('again').textContent = 'Draw again';
      setTimeout(() => { busy = false; }, 520);
    }, demo.classList.contains('was') ? 960 : 580);
  }
  demo.onclick = drawOnce; $('again').onclick = drawOnce;
  demo.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drawOnce(); } };
  $('hundred').onclick = () => {
    if (busy) return; let best = null, bestR = 0;
    for (let i = 0; i < 100; i++) { const r = roll(), k = classFor(r); record(k); if (!best || k.stars > best.stars) { best = k; bestR = r; } }
    demo.classList.remove('sealed'); demo.classList.add('was'); show(best, bestR);
    $('result').textContent = `Best of 100: ${best.name} · ${GRADE[best.name]}`;
    $('again').textContent = 'Draw again';
  };
  $('reset').onclick = () => {
    for (const k in counts) delete counts[k]; opened = 0; renderLadder();
    demo.classList.add('sealed'); demo.classList.remove('was', 'glow');
    $('result').textContent = 'Sealed. Press the card.'; $('result').classList.remove('hot'); $('seed').innerHTML = '&nbsp;'; $('again').textContent = 'Draw';
  };
  // Hovering a class shows its slab on the bench (when the card is face up).
  $('rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr || busy) return;
    $('demo-slab').src = slabOf(tr.dataset.name); demo.classList.remove('sealed'); demo.classList.add('was');
    document.querySelectorAll('#rows tr').forEach((x) => x.classList.toggle('lit', x === tr));
    const k = classes.find((c) => c.name === tr.dataset.name);
    $('result').textContent = `${k.name} · ${GRADE[k.name]} · edition of ${k.edition}`; $('result').classList.toggle('hot', k.stars > 0);
    $('seed').textContent = `mark ${fmt(box * k.markX)} · the Ferryman pays ${fmt(box * k.markX * C.deskRate)} HYPE`;
  });

  // ── the scene: you carry the light ────────────────────────────────────
  const scene = $('scene'), dark = scene.querySelector('.dark'), wall = scene.querySelector('.wall');
  let lastMove = 0, tx = 70, ty = 40, cx = 70, cy = 40;
  scene.addEventListener('pointermove', (e) => {
    const r = scene.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width * 100; ty = (e.clientY - r.top) / r.height * 100; lastMove = performance.now();
  });
  function light(t) {
    if (performance.now() - lastMove > 2600) {            // nobody holding the torch: let it wander
      tx = 58 + 26 * Math.sin(t / 5200); ty = 36 + 16 * Math.cos(t / 4100);
    }
    cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07;
    const flick = 1 + 0.035 * Math.sin(t / 130) + 0.02 * Math.sin(t / 47);
    dark.style.setProperty('--x', cx.toFixed(2) + '%'); dark.style.setProperty('--y', cy.toFixed(2) + '%');
    dark.style.setProperty('--r', (Math.min(innerWidth, 1400) * 0.2 * flick).toFixed(0) + 'px');
    wall.style.setProperty('--px', ((50 - cx) * 0.05).toFixed(2) + '%'); wall.style.setProperty('--py', ((50 - cy) * 0.05).toFixed(2) + '%');
    requestAnimationFrame(light);
  }
  if (!still) requestAnimationFrame(light);

  const vid = $('hero-video'), stillImg = $('hero-still');
  if (C.heroImage) { stillImg.onerror = () => { stillImg.onerror = null; stillImg.src = 'img/fresco.jpg'; }; stillImg.src = C.heroImage; }
  if (C.heroVideo && !still) {
    vid.loop = true; vid.src = C.heroVideo;
    vid.addEventListener('canplay', () => { vid.play().then(() => vid.classList.add('on')).catch(() => {}); }, { once: true });
    new IntersectionObserver(([e]) => { e.isIntersecting ? vid.play().catch(() => {}) : vid.pause(); }).observe(vid);
  }

  // ── the slabs adrift: named on hover, carried off by the scroll ────────
  const float = $('float');
  function captions() {
    float.querySelectorAll('.card').forEach((el) => {
      const k = classes.find((c) => c.name === el.dataset.class); if (!k) return;
      const mark = box * k.markX;
      el.querySelector('figcaption').innerHTML = `<b>${k.work || k.name}</b><span>${k.name} ${GRADE[k.name]} · 1 of ${k.edition}</span><span><i>${fmt(mark)} HYPE</i> mark · Ferryman pays ${fmt(mark * C.deskRate)}</span>`;
      el.setAttribute('aria-label', `${k.work || k.name}. ${k.name}, one of ${k.edition}. Mark ${fmt(mark)} HYPE.`);
    });
  }
  captions();
  let ticking = false;
  const drift = () => { ticking = false; float.style.setProperty('--s', Math.max(0, Math.min(1.4, scrollY / (scene.offsetHeight * 0.8))).toFixed(3)); };
  if (!still) { addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(drift); } }, { passive: true }); drift(); }

  // ── how a draw works, stepped through ─────────────────────────────────
  const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const short = (h) => '0x' + h.slice(0, 10) + '…' + h.slice(-6);
  const ex = { commit: hex(32), server: hex(32), client: hex(32), r: roll() };
  const STEPS = [
    ['Before any customer exists', 'A secret is hashed a hundred thousand times and only the last link is published on-chain. From then on we cannot change a single future draw without the chain noticing.',
      `committed  <b>${short(ex.commit)}</b>\nlinks      100,000`],
    ['You open a box', 'One transaction, paid in HYPE. Your browser adds a seed of its own that we cannot know in advance.',
      `openBox(machine 1, clientSeed)\nclientSeed <b>${short(ex.client)}</b>   (yours; made in this tab just now)`],
    ['We reveal the next link', 'The contract hashes what we reveal and accepts it only if it matches the commitment. Any other value is rejected.',
      `reveal     <b>${short(ex.server)}</b>\nkeccak(reveal) == committed   ✓`],
    ['The result is arithmetic', 'Both seeds, your address and the draw number are hashed into one number, and that number is walked down the published ladder. Every revealed seed is public, so anyone can redo the sum.',
      `roll       <b>${ex.r.toLocaleString('en')}</b> of 1,000,000\nclass      <b>${classFor(ex.r).name}</b>`],
    ['And if we never settle', 'After ten minutes you call the contract yourself and take the full box price back. It does not need us to be awake, willing or alive.',
      `refundUnsettled(drawId)   → <b>${box.toFixed(2)} HYPE</b> returned to you`],
  ];
  const tabs = [...document.querySelectorAll('.tabs button')];
  function step(i) {
    tabs.forEach((t, j) => t.setAttribute('aria-selected', j === i));
    const [h, p, c] = STEPS[i];
    $('pane').innerHTML = `<h3>${h}</h3><p>${p}</p><code>${c.replace(/\n/g, '<br>')}</code>`;
  }
  tabs.forEach((t, i) => { t.onclick = () => step(i); });
  document.querySelector('.tabs').onkeydown = (e) => {
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : -1;
    if (n >= 0 && n < tabs.length) { e.preventDefault(); step(n); tabs[n].focus(); }
  };
  step(0);

  // ── small motion ──────────────────────────────────────────────────────
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.rise').forEach((el, i) => { el.style.setProperty('--d', (i % 2) * 0.1 + 's'); io.observe(el); });
  const bar = document.querySelector('.bar');
  addEventListener('scroll', () => bar.classList.toggle('solid', scrollY > 40), { passive: true });
  if (!still) document.querySelectorAll('[data-tilt]').forEach((el) => {
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect();
      el.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 14).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * 10).toFixed(2) + 'deg'); });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); });
  });

  // ── wallet: EIP-6963 discovery, hand-defined chain, one payable transaction ──
  const HEX = '0x' + C.chainId.toString(16);
  const SEL_OPEN = '0xfc834bcb';       // openBox(uint32,bytes32)
  const SEL_MACHINES = '0x65a08916';   // machines(uint32) -> (uint128 priceWei, bool active, uint32 version)
  const pad = (h) => h.replace(/^0x/, '').padStart(64, '0');
  const say = (html) => { $('status').innerHTML = html; };
  const live = /^0x[0-9a-fA-F]{40}$/.test(C.GACHA);
  let provider = null, account = null, priceWei = null;

  const found = [];
  addEventListener('eip6963:announceProvider', (e) => { if (!found.some((f) => f.info.uuid === e.detail.info.uuid)) found.push(e.detail); });
  dispatchEvent(new Event('eip6963:requestProvider'));
  const rpc = (method, params) => provider.request({ method, params });

  async function ensureChain() {
    try { await rpc('wallet_switchEthereumChain', [{ chainId: HEX }]); }
    catch (e) {
      if (e.code !== 4902 && !/unrecognized|not been added|unknown chain/i.test(e.message || '')) throw e;
      await rpc('wallet_addEthereumChain', [{ chainId: HEX, chainName: C.chainName,
        nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 }, rpcUrls: [C.rpcUrl], blockExplorerUrls: [C.explorer] }]);
    }
    // Several wallets resolve the switch without switching. Read it back.
    if (parseInt(await rpc('eth_chainId', []), 16) !== C.chainId) throw new Error('Switch your wallet to Elysium to continue.');
  }
  async function refresh() {
    if (!account) return;
    const bal = BigInt(await rpc('eth_getBalance', [account, 'latest']));
    $('wallet').textContent = account.slice(0, 6) + '…' + account.slice(-4);
    if (!live) { say(`${fmt(Number(bal) / 1e18)} HYPE in this wallet. The amphora is not open yet.`); return; }
    const out = await rpc('eth_call', [{ to: C.GACHA, data: SEL_MACHINES + pad(C.machineId.toString(16)) }, 'latest']);
    priceWei = BigInt('0x' + out.slice(2, 66));
    const active = BigInt('0x' + out.slice(66, 130)) === 1n, btn = $('draw');
    if (!active) { btn.disabled = true; btn.textContent = 'Closed'; say(''); return; }
    if (bal < priceWei + 10n ** 15n) {
      btn.disabled = false; btn.textContent = 'Get HYPE on Elysium'; btn.onclick = () => open(C.bridge, '_blank', 'noopener');
      say(`${fmt(Number(bal) / 1e18)} HYPE here. A box needs ${fmt(Number(priceWei) / 1e18)} plus gas.`); return;
    }
    btn.disabled = false; btn.textContent = `Draw · ${fmt(Number(priceWei) / 1e18)} HYPE`; btn.onclick = buy; say('');
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
  async function buy() {
    const btn = $('draw');
    try {
      btn.disabled = true; await ensureChain();
      await refresh(); btn.disabled = true;                 // re-read the price: exact amount or it reverts
      say('Confirm in your wallet. One transaction, nothing to approve first.');
      const hash = await rpc('eth_sendTransaction', [{ from: account, to: C.GACHA, value: '0x' + priceWei.toString(16),
        data: SEL_OPEN + pad(C.machineId.toString(16)) + hex(32) }]);
      say(`Box opened. <a href="${C.explorer}/tx/${hash}" target="_blank" rel="noopener">View the transaction</a>. Not settled in ten minutes? Take your HYPE back from the contract.`);
    } catch (e) {
      say(e.code === 4001 ? 'Cancelled. Nothing was sent.' : /WrongPayment/.test(e.message || '') ? 'The box price changed. Try again.' : (e.message || 'The transaction did not go through.'));
    } finally { refresh().catch(() => {}); }
  }
  $('wallet').onclick = connect;
  if (live) { const b = $('draw'); b.disabled = false; b.textContent = 'Connect to draw'; b.onclick = connect; }
})();
