/**
 * Copies et déplacements suivis (k13) : progression en octets, pause,
 * reprise et annulation. Un déplacement sur le même disque est un simple
 * renommage (instantané) ; sinon c'est une copie puis une suppression.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FileJob } from '../../../common/files';
import { freeName } from '../desktop/files';

interface Item {
  src: string;
  dest: string;
  size: number;
  dir: boolean;
}

const sameDir = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

async function walk(src: string, dest: string, out: Item[]): Promise<void> {
  const st = await fs.promises.lstat(src);
  // Une jonction ou un lien symbolique peut traverser les volumes. Sans ce
  // contrôle, walk ignorait le lien puis le déplacement supprimait la source.
  if (st.isSymbolicLink()) {
    throw new Error('Déplacement inter-disques de liens symboliques/jonctions non pris en charge');
  }
  if (st.isDirectory()) {
    out.push({ src, dest, size: 0, dir: true });
    for (const name of await fs.promises.readdir(src)) await walk(path.join(src, name), path.join(dest, name), out);
  } else if (st.isFile()) {
    out.push({ src, dest, size: st.size, dir: false });
  }
}

export class JobQueue {
  private jobs: FileJob[] = [];
  private control = new Map<string, { paused: boolean; cancelled: boolean; wake: (() => void) | null }>();
  private lastEmit = 0;

  constructor(private readonly emit: (jobs: FileJob[]) => void) {}

  list(): FileJob[] {
    return this.jobs;
  }

  private push(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastEmit < 150) return;
    this.lastEmit = now;
    this.emit(this.jobs.map((j) => ({ ...j })));
  }

  action(id: string, what: 'pause' | 'resume' | 'cancel' | 'clear'): void {
    if (what === 'clear') {
      this.jobs = this.jobs.filter((j) => j.state === 'running' || j.state === 'paused');
      this.push(true);
      return;
    }
    const c = this.control.get(id);
    const job = this.jobs.find((j) => j.id === id);
    if (!c || !job) return;
    if (what === 'pause') c.paused = true;
    if (what === 'resume') c.paused = false;
    if (what === 'cancel') c.cancelled = true;
    job.state = c.cancelled ? 'cancelled' : c.paused ? 'paused' : 'running';
    if (!c.paused || c.cancelled) c.wake?.();
    this.push(true);
  }

  /** Lance un transfert ; renvoie son id tout de suite. */
  start(sources: string[], destDir: string, copy: boolean, onDone?: (job: FileJob) => void): string {
    const job: FileJob = {
      id: randomUUID(),
      kind: copy ? 'copy' : 'move',
      sources,
      dest: destDir,
      total: 0,
      done: 0,
      files: 0,
      filesDone: 0,
      current: '',
      state: 'running',
      error: null,
      startedAt: Date.now()
    };
    this.jobs = [...this.jobs.slice(-20), job];
    const c = { paused: false, cancelled: false, wake: null as (() => void) | null };
    this.control.set(job.id, c);
    void this.run(job, c, copy).finally(() => {
      this.control.delete(job.id);
      this.push(true);
      onDone?.(job);
    });
    this.push(true);
    return job.id;
  }

  private async gate(c: { paused: boolean; cancelled: boolean; wake: (() => void) | null }): Promise<void> {
    while (c.paused && !c.cancelled) await new Promise<void>((r) => (c.wake = r));
    c.wake = null;
    if (c.cancelled) throw new Error('cancelled');
  }

  private async run(job: FileJob, c: { paused: boolean; cancelled: boolean; wake: (() => void) | null }, copy: boolean): Promise<void> {
    try {
      const plan: Array<{ top: string; target: string }> = [];
      for (const src of job.sources) {
        if (!fs.existsSync(src)) continue;
        if (sameDir(path.dirname(src), job.dest) && !copy) continue;
        // jamais un dossier dans lui-même
        const rel = path.relative(src, job.dest);
        if (!rel.startsWith('..') && !path.isAbsolute(rel)) continue;
        plan.push({ top: src, target: path.join(job.dest, freeName(job.dest, path.basename(src))) });
      }
      // Déplacement sur le même disque : renommage direct.
      const rest: typeof plan = [];
      for (const p of plan) {
        if (!copy) {
          try {
            await fs.promises.rename(p.top, p.target);
            job.filesDone++;
            continue;
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
          }
        }
        rest.push(p);
      }
      const items: Item[] = [];
      for (const p of rest) await walk(p.top, p.target, items);
      job.total = items.reduce((s, i) => s + i.size, 0);
      job.files = items.filter((i) => !i.dir).length + job.filesDone;
      this.push(true);
      for (const it of items) {
        await this.gate(c);
        if (it.dir) {
          await fs.promises.mkdir(it.dest, { recursive: true });
          continue;
        }
        job.current = path.basename(it.src);
        await fs.promises.mkdir(path.dirname(it.dest), { recursive: true });
        await new Promise<void>((resolve, reject) => {
          const rs = fs.createReadStream(it.src, { highWaterMark: 1 << 20 });
          const ws = fs.createWriteStream(it.dest, { flags: 'wx' });
          rs.on('data', (chunk) => {
            job.done += chunk.length;
            this.push();
            if (c.cancelled) rs.destroy(new Error('cancelled'));
            else if (c.paused) {
              rs.pause();
              c.wake = () => {
                c.wake = null;
                if (c.cancelled) rs.destroy(new Error('cancelled'));
                else rs.resume();
              };
            }
          });
          rs.on('error', (e) => {
            ws.destroy();
            reject(e);
          });
          ws.on('error', reject);
          ws.on('finish', resolve);
          rs.pipe(ws);
        }).catch(async (e) => {
          await fs.promises.rm(it.dest, { force: true }).catch(() => undefined);
          throw e;
        });
        const st = await fs.promises.stat(it.src);
        await fs.promises.utimes(it.dest, st.atime, st.mtime).catch(() => undefined);
        job.filesDone++;
      }
      if (!copy) for (const p of rest) await fs.promises.rm(p.top, { recursive: true, force: true });
      job.state = 'done';
      job.current = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      job.state = msg === 'cancelled' ? 'cancelled' : 'error';
      job.error = msg === 'cancelled' ? null : msg;
    }
  }
}
