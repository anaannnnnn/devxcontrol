// Streams a directory as a .zip with no dependencies (deflate, data descriptors, so memory stays flat).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crcUpdate = (crc, buf) => { let c = crc; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return c >>> 0; };

const SKIP_DIRS = new Set(['node_modules', '.next', '.nuxt', '.turbo', '.cache', '__pycache__', '.venv', 'venv', '.pytest_cache', '.gradle']);
const isSecret = (n) => /^\.env(\..+)?$/.test(n) && !/\.(example|sample|template)$/.test(n);

/** Lists files to include: [{abs, rel, size, mtime, mode}]. Skips deps, build caches, secret .env files and symlinks. */
export function listFiles(root, { maxFiles = 60000 } = {}) {
  const out = []; const stack = [''];
  while (stack.length) {
    const rel = stack.pop(); let ents;
    try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(r); continue; }
      if (!e.isFile() || isSecret(e.name)) continue;
      let st; try { st = fs.statSync(path.join(root, r)); } catch { continue; }
      if (st.size >= 0xFFFFFFFF) continue;
      out.push({ abs: path.join(root, r), rel: r, size: st.size, mtime: st.mtime, mode: st.mode });
      if (out.length > maxFiles) throw new Error(`More than ${maxFiles} files.`);
    }
  }
  return out.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

const dosTime = (d) => ({ t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() });

/** Pipes the zip of `files` into `out` (a writable). Resolves when finished; rejects on error. Stops if `out` closes. */
export async function writeZip(files, out) {
  let closed = false; out.on('close', () => { closed = true; });
  const write = (b) => new Promise((ok) => { if (closed) return ok(); out.write(b) ? ok() : out.once('drain', ok); });
  let offset = 0; const central = [];
  const emit = async (b) => { offset += b.length; await write(b); };
  for (const f of files) {
    if (closed) return;
    const name = Buffer.from(f.rel, 'utf8'); const { t, d } = dosTime(f.mtime); const start = offset;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0808, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(t, 10); lh.writeUInt16LE(d, 12); lh.writeUInt16LE(name.length, 26);
    await emit(Buffer.concat([lh, name]));
    let crc = 0xFFFFFFFF, size = 0, csize = 0;
    try {
      const gz = zlib.createDeflateRaw({ level: 6 });
      const src = fs.createReadStream(f.abs);
      const pump = (async () => { for await (const chunk of gz) { csize += chunk.length; await emit(chunk); } })();
      const feed = (async () => { for await (const chunk of src) { crc = crcUpdate(crc, chunk); size += chunk.length; if (!gz.write(chunk)) await new Promise((ok) => gz.once('drain', ok)); } gz.end(); })();
      await Promise.all([feed, pump]);
    } catch (e) { if (!closed) throw e; return; }
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    const dd = Buffer.alloc(16); dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc, 4); dd.writeUInt32LE(csize, 8); dd.writeUInt32LE(size, 12);
    await emit(dd);
    central.push({ name, t, d, crc, csize, size, start, mode: f.mode });
  }
  const cdStart = offset;
  for (const c of central) {
    const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(0x031E, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0808, 8); h.writeUInt16LE(8, 10);
    h.writeUInt16LE(c.t, 12); h.writeUInt16LE(c.d, 14); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.size, 24);
    h.writeUInt16LE(c.name.length, 28); h.writeUInt32LE(((c.mode & 0xFFFF) << 16) >>> 0, 38); h.writeUInt32LE(c.start, 42);
    await emit(Buffer.concat([h, c.name]));
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0);
  const n = Math.min(central.length, 0xFFFF); end.writeUInt16LE(n, 8); end.writeUInt16LE(n, 10); end.writeUInt32LE(offset - cdStart, 12); end.writeUInt32LE(cdStart, 16);
  await emit(end);
  if (!closed) await new Promise((ok) => out.end(ok));
}
