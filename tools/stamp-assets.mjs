// Put a content hash on every local stylesheet and script link in site/*.html (?v=<8 hex>), and on every module import
// inside site/assets/js/*.js, so a browser that cached an old file at the same address fetches the new one. For this tool
// that is a security point: a stale token.js or github.js could run an older path guard than the one that was reviewed.
// A module's hash covers its own imports (dependencies are stamped first), and every importer of a module uses the same
// specifier, so the browser loads one instance of each module. Run after changing anything in site/assets/, before committing:
//   node tools/stamp-assets.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const site = 'site', jsdir = join(site, 'assets', 'js');
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);
const done = new Map();
function stampModule(file, trail = []) {
  if (done.has(file)) return done.get(file);
  if (trail.includes(file)) throw new Error('import cycle: ' + [...trail, file].join(' > '));
  const path = join(jsdir, file);
  const src = readFileSync(path, 'utf8');
  const out = src.replace(/((?:from|import)\s*')\.\/([\w-]+\.js)(?:\?v=[0-9a-f]+)?(')/g, (m, a, dep, c) => `${a}./${dep}?v=${stampModule(dep, [...trail, file])}${c}`);
  if (out !== src) writeFileSync(path, out);
  const h = sha(out); done.set(file, h); return h;
}
for (const f of readdirSync(jsdir)) if (f.endsWith('.js')) stampModule(f);
const hash = (p) => p.startsWith('js/') ? done.get(p.slice(3)) : sha(readFileSync(join(site, 'assets', p)));
const pages = []; (function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && pages.push(p); } })(site);
let n = 0;
for (const f of pages) {
  const s = readFileSync(f, 'utf8');
  const t = s.replace(/(href|src)="\/assets\/([^"?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g, (m, a, p) => { n++; return `${a}="/assets/${p}?v=${hash(p)}"`; });
  if (t !== s) writeFileSync(f, t);
}
console.log(`stamped ${done.size} modules and ${n} page links in ${pages.length} pages`);
