import type { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { draws } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { parseAbi } from 'viem';
import { publicClient, activeChain } from '../chain/elysium';

const CERT = process.env.CERT_ADDRESS as `0x${string}`;
const certAbi = parseAbi([
  'function certificateOf(uint256) view returns ((uint256,uint256,uint128,uint40,uint32,uint32))',
]);
const GRADE: Record<string, string> = { MORTAL: 'VII', HERO: 'X', OLYMPIAN: 'Ω' };
const EDITION: Record<string, number> = { MORTAL: 300, HERO: 25, OLYMPIAN: 5 };

/** Certificate id ≠ artwork id. Sherd 68 may be a fragment of artwork 5; ask the chain. */
async function artworkOfCert(certId: number): Promise<{ artworkId: number; serial: number } | null> {
  try {
    const c = await publicClient.readContract({ address: CERT, abi: certAbi, functionName: 'certificateOf', args: [BigInt(certId)] }) as any;
    return Number(c[0]) ? { artworkId: Number(c[0]), serial: Number(c[5]) } : null;
  } catch { return null; }
}

const SLABS = path.join(process.env.HOME ?? '/home/amphora', 'amphora/series1/slabs');


// ── artwork resolver ────────────────────────────────────────────────
// These image routes take an ARTWORK id. Never pass a certificate id here:
// where the numbers collide you would show someone else's work.
// Maps on-chain artworkId → Season I work id (GC-022, S1-F09 …) using the
// induction ledger, so every route serves that work's own assets.
const SERIES_DIR = path.join(process.env.HOME ?? '/home/amphora', 'amphora/series1');
let _reg: Map<number, { workId: string; cls: string; markHype: string }> | null = null;
let _regMtime = 0;
function registry() {
  const f = path.join(SERIES_DIR, 'artwork_registry.csv');
  const m = fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0;
  if (!_reg || m !== _regMtime) {
    _regMtime = m;
    _reg = new Map();
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, 'utf8').trim().split('\n').slice(1)) {
        const c = line.split(',');
        if (c[1]) _reg.set(Number(c[1]), { workId: c[0], cls: c[2] || 'MORTAL', markHype: c[3] || '' });
      }
    }
  }
  return _reg;
}
let _titles: Map<string, string> | null = null;
function titleFor(workId: string) {
  if (!_titles) {
    _titles = new Map();
    const f = path.join(SERIES_DIR, 'induction-list.csv');
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, 'utf8').trim().split('\n').slice(1)) {
        const c = line.split(',');
        _titles.set(c[0], c[1]);
      }
    }
    _titles.set('S1-01', 'The Gift of Fortune');
  }
  return _titles.get(workId) ?? workId;
}
function resolve(artworkId: number) {
  const r = registry().get(artworkId);
  const workId = r?.workId ?? '';
  return { workId, cls: r?.cls ?? 'MORTAL', markHype: r?.markHype ?? '', title: titleFor(workId) };
}

export async function metaRoutes(app: FastifyInstance) {
  // Season I composed slabs, served by work id: /slab/GC-022
  app.get('/slab/:id', async (req, reply) => {
    const id = String((req.params as any).id);
    if (!/^[A-Za-z0-9-]+$/.test(id)) return reply.code(404).send();
    const file = path.join(process.env.HOME ?? '/home/amphora',
      'amphora/series1/slabs', id + '.webp');
    if (!fs.existsSync(file)) return reply.code(404).send();
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.type('image/webp').send(fs.createReadStream(file));
  });

  app.get('/', async () => ({
    name: 'Amphora API',
    chain: `${activeChain.name} (${activeChain.id})`,
    currency: 'HYPE',
    health: '/health',
    machines: '/public/machines',
    fairness: '/public/fairness/:drawId',
  }));

  // NFT metadata, keyed by CERTIFICATE id (this is what tokenURI points at).
  app.get('/meta/:id', async (req, reply) => {
    const certId = Number((req.params as any).id);
    const c = await artworkOfCert(certId);
    if (!c) return reply.code(404).send({ error: 'no_such_certificate' });
    const w = resolve(c.artworkId);
    const [d] = await db.select().from(draws)
      .where(eq(draws.wonTokenId, c.artworkId)).orderBy(desc(draws.drawId)).limit(1);
    return reply.send({
      name: `Amphora Sherd #${certId} — ${w.title}`,
      description:
        'A numbered sherd: a certificate of a fragment of a work held in the Amphora treasury. ' +
        'Drawn under commit-reveal fairness' +
        (d ? `; verify at https://api.amphora.example/public/fairness/${d.drawId}` : '.'),
      // by ARTWORK id — never by certificate id
      image: `https://api.amphora.example/meta/${c.artworkId}/image`,
      external_url: `https://amphora.example/c/${certId}`,
      attributes: [
        { trait_type: 'Class', value: w.cls },
        { trait_type: 'Grade', value: `${w.cls} ${GRADE[w.cls] ?? ''}`.trim() },
        { trait_type: 'Work', value: `${w.workId} - ${w.title}` },
        { trait_type: 'Season', value: 'Season I - The Fractured Fresco' },
        { trait_type: 'Edition', value: `${c.serial} of ${EDITION[w.cls] ?? ''}` },
        { trait_type: 'Chain', value: activeChain.name },
      ],
    });
  });

    app.get('/meta/:id/card-front', async (req, reply) => {
    const { workId } = resolve(Number((req.params as any).id));
    const file = path.join(SERIES_DIR, 'cards', workId + '-front.webp');
    if (!fs.existsSync(file)) return reply.code(404).send();
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.type('image/webp').send(fs.createReadStream(file));
  });

  app.get('/meta/:id/image', async (req, reply) => {
    const { workId } = resolve(Number((req.params as any).id));
    const file = path.join(SERIES_DIR, 'slabs', workId + '.webp');
    if (!fs.existsSync(file)) return reply.code(404).send();
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.type('image/webp').send(fs.createReadStream(file));
  });
}
