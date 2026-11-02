// Builds the service worker from lib/sw.template.js: the cache version is a hash of every precached file,
// so a deploy that changes any asset gives installed apps a new worker (and the update bar) on their own.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKIP = [/^jarvis\//, /^splash\//, /^vendor\/three/, /\.svg$/, /\.map$/, /^client\.html$/, /^sw\.js$/];
let built = null;

const walk = (root, dir = '') => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = path.posix.join(dir, e.name);
  return e.isDirectory() ? walk(root, rel) : [rel];
});

export function swSource(publicDir) {
  if (built) return built;
  const files = walk(publicDir).filter((f) => !SKIP.some((re) => re.test(f))).sort();
  const hash = crypto.createHash('sha256');
  const urls = files.map((f) => { hash.update(f); hash.update(fs.readFileSync(path.join(publicDir, f))); return f === 'index.html' ? '/' : '/' + f; });
  const version = hash.digest('hex').slice(0, 12);
  built = fs.readFileSync(path.join(here, 'sw.template.js'), 'utf8').replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls));
  return built;
}
