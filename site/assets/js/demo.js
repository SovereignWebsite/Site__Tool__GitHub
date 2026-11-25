// Synthetic data for the demo view. Nothing here touches the network and no token is used.
// Names are invented: example-org/example-repo is not a real repository.
const iso = (d) => '2026-11-' + String(d).padStart(2, '0') + 'T10:00:00Z';
const readme = '# example-repo\n\nA made-up repository for the demo.\n\n- Nothing here is real.\n- Edits and comments in the demo are not sent anywhere.\n';
const files = {
  '': [{ name: 'docs', path: 'docs', type: 'dir', size: 0 }, { name: 'src', path: 'src', type: 'dir', size: 0 }, { name: 'README.md', path: 'README.md', type: 'file', size: readme.length }],
  docs: [{ name: 'guide.md', path: 'docs/guide.md', type: 'file', size: 52 }],
  src: [{ name: 'main.txt', path: 'src/main.txt', type: 'file', size: 28 }],
};
const text = { 'README.md': readme, 'docs/guide.md': '# Guide\n\nStart here. This is demo text.\n', 'src/main.txt': 'print("hello from the demo")\n' };
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
export function demoApi(path, opts) {
  const [p, q] = path.split('?'); const method = (opts && opts.method) || 'GET';
  const ok = (body, headers) => ({ body, headers: new Headers(headers || {}) });
  if (method !== 'GET') return ok({ commit: { sha: 'd3m0d3m0d3m0' } });
  if (p === '/user') return ok({ login: 'demo-user' }, { 'github-authentication-token-expiration': '2099-01-01 00:00:00 UTC (demo)' });
  if (p === '/rate_limit') return ok({ rate: { limit: 5000, remaining: 5000 } });
  if (p === '/user/repos') return ok([
    { full_name: 'example-org/example-repo', default_branch: 'main', permissions: { push: true }, private: false, pushed_at: iso(24) },
    { full_name: 'example-org/read-only-notes', default_branch: 'main', permissions: { push: false }, private: true, pushed_at: iso(20) }]);
  if (p === '/repos/example-org/example-repo/branches' || p === '/repos/example-org/read-only-notes/branches') return ok([{ name: 'main', protected: true }, { name: 'draft', protected: false }]);
  const c = p.match(/^\/repos\/example-org\/[^/]+\/contents\/(.*)$/);
  if (c) { const k = decodeURIComponent(c[1]); if (files[k]) return ok(files[k]); if (text[k] != null) return ok({ type: 'file', encoding: 'base64', content: b64(text[k]), sha: 'demo-sha', size: text[k].length }); }
  if (/\/issues$/.test(p)) return ok([
    { number: 12, title: 'Add a contributing guide', body: 'We should explain how to send a change.', user: { login: 'sam-example' }, created_at: iso(21), updated_at: iso(23) },
    { number: 9, title: 'Typo in the guide', body: 'Line 3 says "teh".', user: { login: 'alex-example' }, created_at: iso(18), updated_at: iso(19) }]);
  if (/\/pulls$/.test(p)) return ok([{ number: 14, title: 'Fix the typo', body: 'Fixes #9.', user: { login: 'alex-example' }, created_at: iso(22), updated_at: iso(22) }]);
  if (/\/issues\/\d+\/comments$/.test(p)) return ok([{ user: { login: 'sam-example' }, created_at: iso(22), body: 'Happy to take this one.' }]);
  return ok({ message: 'demo: nothing here' });
}
