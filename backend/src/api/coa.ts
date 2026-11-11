import type { FastifyInstance } from 'fastify';
import { publicClient, activeChain } from '../chain/elysium';
import { parseAbi } from 'viem';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CERT = process.env.CERT_ADDRESS as `0x${string}`;
const certAbi = parseAbi([
  'function certificateOf(uint256) view returns ((uint256,uint256,uint128,uint40,uint32,uint32))',
]);
const SERIES_DIR = path.join(process.env.HOME ?? '/home/amphora', 'amphora/series1');
const EDITION: Record<string, number> = { MORTAL: 300, HERO: 25, OLYMPIAN: 5 };

/** artworkId -> { workId, cls, title } from the induction ledger. */
function workOf(artworkId: number) {
  const reg = path.join(SERIES_DIR, 'artwork_registry.csv');
  const list = path.join(SERIES_DIR, 'induction-list.csv');
  let workId = '', cls = 'MORTAL', title = '';
  if (fs.existsSync(reg)) for (const l of fs.readFileSync(reg, 'utf8').trim().split('\n').slice(1)) {
    const c = l.split(','); if (Number(c[1]) === artworkId) { workId = c[0]; cls = c[2] || cls; break; }
  }
  if (workId && fs.existsSync(list)) for (const l of fs.readFileSync(list, 'utf8').trim().split('\n').slice(1)) {
    const c = l.split(','); if (c[0] === workId) { title = c[1]; break; }
  }
  return { workId, cls, title: title || workId };
}

const COA_DIR = path.join(process.env.HOME ?? '/home/amphora', 'amphora/backend/coa');

export async function coaRoutes(app: FastifyInstance) {
  app.get('/coa/:certId', async (req, reply) => {
    const certId = String(Number((req.params as any).certId));
    const out = path.join(COA_DIR, `coa-${certId}`);
    if (!fs.existsSync(out + '.pdf')) {
      const c = await publicClient.readContract({ address: CERT, abi: certAbi, functionName: 'certificateOf', args: [BigInt(certId)] }) as any;
      const serial = String(c[5]).padStart(3, '0');
      const w = workOf(Number(c[0]));
      if (!w.workId) return reply.code(404).send({ error: 'work_not_in_registry' });
      const minted = new Date(Number(c[3]) * 1000);
      const date = minted.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      await new Promise<void>((res, rej) => execFile('python3', [
        path.join(COA_DIR, 'render_coa.py'),
        '--work', w.title,
        '--series', 'Season I - The Fractured Fresco',
        '--edition', `${serial} / ${EDITION[w.cls] ?? 300}`,
        '--chain-id', `${w.workId} - SHERD ${certId} - ELYSIUM ${activeChain.id}`,
        '--serial', `AMPH-${certId.padStart(4, '0')}`,
        '--date', date,
        '--signature', 'AM',
        // the certified work's own slab, floated over the mural
        '--slab', path.join(SERIES_DIR, 'slabs', `${w.workId}.webp`),
        '--out', out,
      ], (e) => e ? rej(e) : res()));
    }
    reply.header('Content-Disposition', `attachment; filename="amphora-sherd-${certId}.pdf"`);
    return reply.type('application/pdf').send(fs.createReadStream(out + '.pdf'));
  });
}
