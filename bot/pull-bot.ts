/**
 * Amphora pull bot — the Herald.
 *
 * Watches for newly settled draws and posts each one to X with a generated
 * card image and a link to the work.
 *
 *   npx tsx pull-bot.ts --dry          print what it would post, send nothing
 *   npx tsx pull-bot.ts --once         post any backlog, then exit
 *   npx tsx pull-bot.ts                run continuously (poll every 30s)
 *
 * Safety: BOT_ENABLED must be 'true' before anything is sent. A daily cap
 * (BOT_DAILY_CAP, default 40) stops a loop or a viral day from running up a
 * bill — X charges $0.20 per post containing a link.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
// db/client loads dotenv and re-exports sql. Run from backend/:  npx tsx ../bot/pull-bot.ts
import { db, sql } from '../backend/src/db/client';

const API = process.env.BOT_API ?? 'https://api.amphora.example';
const SITE = 'https://amphora.example';
const ENABLED = process.env.BOT_ENABLED === 'true';
const DAILY_CAP = Number(process.env.BOT_DAILY_CAP ?? 40);
const POLL_MS = Number(process.env.BOT_POLL_MS ?? 30_000);
const CARD_SCRIPT = path.join(process.env.HOME!, 'amphora/bot/social_card.py');
const SLAB_DIR = path.join(process.env.HOME!, 'amphora/series1/slabs');

const DRY = process.argv.includes('--dry');
const ONCE = process.argv.includes('--once');

const CLASS_LABEL: Record<number, string> = { 1: 'MORTAL', 2: 'HERO', 3: 'OLYMPIAN' };

// X rotates the refresh token on EVERY use. The rotated pair is persisted here
// and read back at boot; without that the first refresh works and every one
// after it fails (2h18m of CPU the first time this happened).
const TOKEN_FILE = process.env.X_TOKEN_FILE ?? path.join(process.env.HOME!, 'amphora/bot/.x-tokens.json');
let accessToken = process.env.X_ACCESS_TOKEN!;
let refreshToken = process.env.X_REFRESH_TOKEN!;
try {
  const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  if (saved.access_token && saved.refresh_token) { accessToken = saved.access_token; refreshToken = saved.refresh_token; }
} catch { /* first run: fall back to the env pair */ }
const CLIENT_ID = process.env.X_CLIENT_ID!;
const CLIENT_SECRET = process.env.X_CLIENT_SECRET!;

async function refreshAccessToken(): Promise<void> {
  const res = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID,
    }),
  });
  const j: any = await res.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  accessToken = j.access_token;
  if (j.refresh_token) refreshToken = j.refresh_token;
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }), { mode: 0o600 });
  console.log('[bot] access token refreshed');
}

async function xFetch(url: string, init: any, retry = true): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401 && retry) {
    await refreshAccessToken();
    return xFetch(url, init, false);
  }
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status} ${url}: ${text.slice(0, 300)}`);
  return json;
}

/**
 * Single multipart upload. The chunked INIT/APPEND/FINALIZE flow is rejected
 * for images; one request works. Requires the `media.write` scope, which must
 * have been present when the account was authorised.
 */
async function uploadMedia(filePath: string): Promise<string> {
  const bytes = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('media', new Blob([bytes], { type: 'image/png' }), 'card.png');
  form.append('media_category', 'tweet_image');
  const j = await xFetch('https://api.x.com/2/media/upload', { method: 'POST', body: form });
  const mediaId = j?.data?.id ?? j?.media_id_string ?? j?.id;
  if (!mediaId) throw new Error('no media id from upload: ' + JSON.stringify(j));
  return String(mediaId);
}

async function postTweet(text: string, mediaId?: string): Promise<string> {
  const body: any = { text };
  if (mediaId) body.media = { media_ids: [mediaId] };
  const j = await xFetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return j?.data?.id ?? '';
}

function compose(work: any, cls: string, serial: string | number | null) {
  const url = `${SITE}/w/${work.workId}`;
  const nth = serial ? `Nº ${serial}` : '';
  if (cls === 'OLYMPIAN') {
    return [
      'An Olympian.',
      `${work.workId} · ${work.title}`,
      `One of five that will ever exist. 1 in 500.`,
      url,
    ].join('\n');
  }
  if (cls === 'HERO') {
    return [
      'A Hero has surfaced.',
      `${work.workId} · ${work.title}`,
      `Edition of 25 · 1 in 51${nth ? ' · ' + nth : ''}`,
      url,
    ].join('\n');
  }
  return [
    `${work.workId} · ${work.title}`,
    `Mortal${nth ? ' · ' + nth + ' of 300' : ' · edition of 300'}`,
    url,
  ].join('\n');
}

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS bot_posts (
      draw_id integer PRIMARY KEY,
      tweet_id text,
      posted_at timestamptz NOT NULL DEFAULT now()
    )`);
}

async function postedToday(): Promise<number> {
  const r: any = await db.execute(sql`
    SELECT count(*) AS n FROM bot_posts WHERE tweet_id IS NOT NULL AND posted_at > now() - interval '1 day'`);
  return Number((r?.rows?.[0] ?? r?.[0])?.n ?? 0);
}

async function pending(): Promise<any[]> {
  const r: any = await db.execute(sql`
    SELECT d.draw_id, d.won_tier, d.won_token_id
    FROM draws d
    LEFT JOIN bot_posts b ON b.draw_id = d.draw_id
    WHERE d.status = 'settled' AND d.won_token_id IS NOT NULL AND b.draw_id IS NULL
    ORDER BY d.draw_id ASC LIMIT 20`);
  return r?.rows ?? r ?? [];
}

async function workFor(artworkId: number) {
  const res = await fetch(`${API}/work/${artworkId}`, {
    headers: { 'User-Agent': 'Amphora-Bot/1.0' },
  });
  if (!res.ok) throw new Error(`work lookup failed for ${artworkId}`);
  return res.json();
}

async function handle(row: any) {
  const cls = CLASS_LABEL[Number(row.won_tier)] ?? 'MORTAL';
  const work: any = await workFor(Number(row.won_token_id));
  const text = compose(work, cls, null);

  const cardPath = path.join(os.tmpdir(), `pull-${row.draw_id}.png`);
  const slab = path.join(SLAB_DIR, `${work.workId}.webp`);
  execFileSync('python3', [
    CARD_SCRIPT,
    '--work', work.workId,
    '--title', work.title ?? work.workId,
    '--class', cls,
    '--slab', fs.existsSync(slab) ? slab : '',
    '--out', cardPath,
  ]);

  if (DRY || !ENABLED) {
    console.log(`\n--- draw ${row.draw_id} (${cls}) ---\n${text}\n[card: ${cardPath}]`);
    return;
  }

  // Claim the row BEFORE posting. If another tick (or another process) already
  // holds it, the insert returns nothing and we stop — no double posts.
  const claim: any = await db.execute(sql`
    INSERT INTO bot_posts (draw_id, tweet_id) VALUES (${row.draw_id}, NULL)
    ON CONFLICT (draw_id) DO NOTHING RETURNING draw_id`);
  if (!(claim?.rows ?? claim ?? []).length) return;

  let tweetId = '';
  try {
    const mediaId = await uploadMedia(cardPath);
    tweetId = await postTweet(text, mediaId);
  } catch (e) {
    // release the claim so a later tick can retry
    await db.execute(sql`DELETE FROM bot_posts WHERE draw_id = ${row.draw_id} AND tweet_id IS NULL`);
    throw e;
  }
  await db.execute(sql`UPDATE bot_posts SET tweet_id = ${tweetId} WHERE draw_id = ${row.draw_id}`);
  console.log(`[bot] draw ${row.draw_id} → tweet ${tweetId}`);
  try { fs.unlinkSync(cardPath); } catch {}
}

let running = false;
async function tick() {
  // A batch can outlast the poll interval; a second tick reading the same
  // unposted rows is how everything got posted twice.
  if (running) return;
  running = true;
  try { await tickInner(); } finally { running = false; }
}

async function tickInner() {
  const rows = await pending();
  if (!rows.length) return;

  const already = await postedToday();
  if (!DRY && ENABLED && already >= DAILY_CAP) {
    console.warn(`[bot] daily cap reached (${already}/${DAILY_CAP}) — holding ${rows.length} post(s)`);
    return;
  }

  for (const row of rows) {
    try {
      await handle(row);
    } catch (e: any) {
      console.error(`[bot] draw ${row.draw_id} failed: ${e.message}`);
    }
  }
}

await ensureTable();
if (!ENABLED) console.log('[bot] BOT_ENABLED is not true — running in preview mode, nothing will be sent');

if (DRY || ONCE) {
  await tick();
  process.exit(0);
}

console.log(`[bot] watching · poll ${POLL_MS}ms · cap ${DAILY_CAP}/day`);
setInterval(() => { tick().catch((e) => console.error('[bot] tick failed', e.message)); }, POLL_MS);
