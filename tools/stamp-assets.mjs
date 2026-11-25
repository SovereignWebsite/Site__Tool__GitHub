// Put a content hash on every local stylesheet and script link in site/*.html (?v=<8 hex>), so a browser that cached an
// old file at the same address fetches the new one. Run it after changing anything in site/assets/, before committing:
//   node tools/stamp-assets.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const site = 'site';
const hash = (p) => createHash('sha256').update(readFileSync(join(site, p))).digest('hex').slice(0, 8);
const pages = []; (function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && pages.push(p); } })(site);
let n = 0;
for (const f of pages) {
  const s = readFileSync(f, 'utf8');
  const t = s.replace(/(href|src)="\/assets\/([^"?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g, (m, a, p) => { n++; return `${a}="/assets/${p}?v=${hash('assets/' + p)}"`; });
  if (t !== s) writeFileSync(f, t);
}
console.log(`stamped ${n} links in ${pages.length} pages`);
