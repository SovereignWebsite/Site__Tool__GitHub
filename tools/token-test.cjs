// Token-handling test for the GitHub tool: serves site/ locally, mocks api.github.com, and checks where the token goes,
// that GitHub text cannot run as script, that writes need a confirmation, that framing is refused and bad paths are refused.
// node tools/token-test.cjs site   (uses the Playwright already in the container). By a.factory, review of 25 Nov 2026.
// Exits non-zero if any check fails (asserts added by github-tool.a).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2];
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURI(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
const TOKEN = 'github_pat_TESTONLY0000000000000000000000';
const X = '<img src=x onerror="window.__pwned=1">';
(async () => {
  await new Promise((ok) => srv.listen(0, ok)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  const hosts = new Set(), authTo = new Set(), logs = [], writes = [];
  p.on('console', (m) => logs.push(m.text())); p.on('dialog', (d) => { writes.push('dialog:' + d.message()); d.dismiss(); });
  p.on('request', (q) => { const u = new URL(q.url()); hosts.add(u.host); if (q.headers().authorization) authTo.add(u.host); if (q.url().includes(TOKEN)) logs.push('TOKEN IN URL ' + q.url()); });
  const j = (o, h = {}) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...h }, body: JSON.stringify(o) });
  await ctx.route('https://api.github.com/**', (rt) => {
    const u = new URL(rt.request().url()), m = rt.request().method();
    if (m !== 'GET') { writes.push(m + ' ' + u.pathname); return rt.fulfill(j({ commit: { sha: 'abcdef0123' } })); }
    if (u.pathname === '/user') return rt.fulfill(j({ login: X }));
    if (u.pathname === '/rate_limit') return rt.fulfill(j({ rate: { remaining: 1, limit: 2 } }));
    if (u.pathname === '/user/repos') return rt.fulfill(j([{ full_name: 'o/r', default_branch: 'dev', permissions: { push: true }, pushed_at: '2026-11-25T00:00:00Z' }]));
    if (u.pathname === '/repos/o/r/contents/') return rt.fulfill(j([{ type: 'file', name: X, path: 'evil.html', size: 9 }]));
    if (u.pathname === '/repos/o/r/contents/evil.html') return rt.fulfill(j({ encoding: 'base64', content: Buffer.from('<script>window.__pwned=2</script>' + X).toString('base64'), sha: 's', size: 9 }));
    if (u.pathname === '/repos/o/r/issues') return rt.fulfill(j([{ number: 1, title: X, body: X, user: { login: X } }]));
    if (u.pathname === '/repos/o/r/issues/1/comments') return rt.fulfill(j([{ body: X, user: { login: X } }]));
    return rt.fulfill({ status: 404, body: '{}' });
  });
  await p.goto(base + '/');
  await p.fill('#token', TOKEN); await p.check('#keep'); await p.click('button[type=submit]');
  await p.waitForSelector('text=o/r'); await p.click('text=o/r'); await p.waitForTimeout(300);
  await p.click('button.link:has-text("onerror")'); await p.waitForTimeout(300);
  await p.click('text=Edit this file'); await p.waitForTimeout(200);
  await p.click('text=Commit this change'); await p.waitForTimeout(300);
  await p.click('button[data-t=issues]'); await p.waitForTimeout(300); await p.click('button.link:has-text("#1")'); await p.waitForTimeout(300);
  await p.fill('#cmt', 'hi'); await p.click('text=Post comment'); await p.waitForTimeout(300);
  const st = await p.evaluate(() => ({ pwned: window.__pwned || 0, ls: JSON.stringify(localStorage), ss: Object.keys(sessionStorage), cookie: document.cookie, url: location.href, field: document.getElementById('token').value }));
  await p.reload(); await p.waitForTimeout(500);
  const afterReload = await p.evaluate(() => !document.getElementById('connected').hidden);
  await p.click('#forget'); const afterForget = await p.evaluate(() => Object.keys(sessionStorage));
  // A framed copy: does it run?
  const page2 = await ctx.newPage(); await page2.setContent(`<iframe src="${base}/" width=800 height=600></iframe>`); await page2.waitForTimeout(500);
  const framed = await page2.frames()[1].evaluate(() => document.querySelectorAll("#token").length);
  const paths = await p.evaluate(async () => { const g = await import("/assets/js/github.js"); const t = await import("/assets/js/token.js"); t.set("x", false); const out = {}; for (const q of ["/repos/../user", "/a/./b", "/a/%2e%2e/b", "//evil.com", "/a\\b", "/a\nb", "/repos/o/r/contents/x?ref=feature%2Fx", "/user"]) { try { await g.api(q); out[q] = "allowed"; } catch (e) { out[q] = e.status === 0 && /Bad request/.test(e.message) ? "refused" : "allowed(" + e.status + ")"; } } t.forget(); return out; });
  const report = { hosts: [...hosts], authTo: [...authTo], st, writesAttempted_withDialogDismissed: writes, tokenInConsole: logs.some((l) => l.includes(TOKEN)), logs: logs.filter((l) => l.includes('TOKEN')), afterReload, afterForget, framedTokenFields: framed, paths };
  console.log(JSON.stringify(report, null, 1));
  const own = new URL(base).host, bad = [];
  const chk = (ok, why) => { if (!ok) bad.push(why); };
  chk([...hosts].every((h) => h === own || h === 'api.github.com'), 'a request went to a host other than the page and api.github.com');
  chk([...authTo].every((h) => h === 'api.github.com'), 'Authorization was sent somewhere other than api.github.com');
  chk(st.pwned === 0, 'GitHub text ran as script');
  chk(st.ls === '{}', 'localStorage is not empty');
  chk(st.cookie === '', 'there is a cookie');
  chk(!report.tokenInConsole && report.logs.length === 0, 'the token reached the console or a URL');
  chk(!writes.some((w) => !w.startsWith('dialog:')), 'a PUT or POST went out with the confirmation dismissed');
  chk(framed === 0, 'the tool runs inside a frame');
  chk(Object.entries(paths).every(([q, v]) => (q === '/user' || q.includes('feature%2Fx') ? !/^refused/.test(v) : v === 'refused')), 'a bad path was allowed or a good path refused');
  chk(afterForget.length === 0, 'forget left something in sessionStorage');
  await b.close(); srv.close();
  if (bad.length) { console.error('FAILED:\n- ' + bad.join('\n- ')); process.exit(1); }
  console.log('token-test: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
