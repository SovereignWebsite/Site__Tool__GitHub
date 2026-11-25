import './theme.js?v=5667ac0a';
import * as tok from './token.js?v=40275a7c';
import { api, enc, encPath, b64ToText, textToB64, setDemo, isDemo } from './github.js?v=e7846b6c';

// Do not run inside another page: a framing site could overlay this one to trick a paste or a click.
if (window.top !== window.self) {
  document.body.replaceChildren(document.createTextNode('This tool does not run inside another page. Open https://github.tool.sovereignweb.site/ directly.'));
  throw new Error('framed');
}
const $ = (id) => document.getElementById(id);
// Build DOM nodes from text only. Nothing from GitHub is ever put in as HTML.
function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
  for (const k of kids) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}
const view = $('view'), status = $('status');
function say(msg, err) { status.textContent = msg || ''; status.className = 'status' + (err ? ' err' : ''); }
function when(iso) { return iso ? new Date(iso).toLocaleString('en-GB') : ''; }
function btn(label, fn, alt) { const b = h('button', { type: 'button', class: alt ? 'alt' : '' }, label); b.addEventListener('click', fn); return b; }
function link(label, fn) { const b = h('button', { type: 'button', class: 'link' }, label); b.addEventListener('click', fn); return b; }
async function guard(fn) { try { say('Working...'); await fn(); if (status.textContent === 'Working...') say(''); } catch (e) { say(e.message || 'Something went wrong.', true); } }

// A repository view has a list pane and a detail pane. Narrow screens and most designs show one at a time;
// the Two-pane design shows both.
const twopane = () => document.documentElement.dataset.design === 'twopane';
function closeDetail(s) {
  if (twopane()) { s.detail.replaceChildren(h('p', { class: 'meta placeholder' }, 'Choose a file, issue or pull request on the left.')); s.detail.hidden = false; } else s.detail.hidden = true;
  s.split.classList.remove('open');
}
function paint(s, which, ...nodes) {
  s[which].replaceChildren(...nodes);
  if (which === 'detail') { s.detail.hidden = false; s.split.classList.add('open'); } else if (!twopane()) closeDetail(s);
}
// Lists: a real table in Ledger and Two-pane, a plain list elsewhere (Cards lays the list out as cards in CSS).
// Terminal adds a filter box and j/k keys.
const design = () => document.documentElement.dataset.design || 'paper';
const tabled = () => ['ledger', 'twopane'].includes(design());
const rowLink = (label, fn) => { const b = link(label, fn); b.classList.add('rowlink'); return b; };
const cell = (c) => (c && c.nodeType ? c : document.createTextNode(c == null ? '' : String(c)));
function listOf(head, items, empty) {
  if (!items.length) return h('p', {}, empty || 'Nothing here.');
  let out;
  if (tabled()) {
    out = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...head.map((t) => h('th', { scope: 'col' }, t)))));
    const tb = h('tbody'); for (const it of items) tb.append(h('tr', {}, h('td', {}, it.main), ...it.cells.map((c) => h('td', {}, cell(c))))); out.append(tb);
  } else {
    out = h('ul', { class: 'list' });
    for (const it of items) out.append(h('li', {}, it.main, ...it.cells.map((c, i) => (c && c.nodeType ? c : c ? h('span', { class: 'meta' }, (head[i + 1] ? head[i + 1] + ': ' : '') + c) : null))));
  }
  if (design() !== 'terminal') return out;
  const f = h('input', { type: 'text', id: 'filter', placeholder: '/ to filter', 'aria-label': 'Filter this list' });
  f.addEventListener('input', () => { const q = f.value.toLowerCase(); out.querySelectorAll('li,tbody tr').forEach((r) => { r.hidden = q && !r.textContent.toLowerCase().includes(q); }); });
  return h('div', {}, h('p', { class: 'meta' }, 'keys: / filter, j and k move, Enter opens, Esc leaves the box'), f, out);
}
document.addEventListener('keydown', (e) => {
  if (design() !== 'terminal' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, typing = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if (typing) { if (e.key === 'Escape') t.blur(); return; }
  if (e.key === '/') { const f = $('filter'); if (f) { e.preventDefault(); f.focus(); } return; }
  if (e.key !== 'j' && e.key !== 'k') return;
  const links = [...view.querySelectorAll('.rowlink')].filter((b) => !b.closest('[hidden]')); if (!links.length) return;
  const i = links.indexOf(document.activeElement); links[e.key === 'j' ? Math.min(i + 1, links.length - 1) : Math.max(i - 1, 0)].focus();
});
function live(on) { document.body.classList.toggle('live', on); }
let me = null;
const perms = new Map(); // "owner/repo" -> permissions object as GitHub reports it

// ---- token panel ----
async function connect() {
  const field = $('token');
  tok.set(field.value, $('keep').checked);
  field.value = '';
  await guard(async () => {
    const [u, rl] = await Promise.all([api('/user'), api('/rate_limit')]);
    me = u.body;
    const exp = u.headers.get('github-authentication-token-expiration');
    const classic = u.headers.get('x-oauth-scopes');
    renderIdentity(me, exp, classic, rl.body && rl.body.rate);
    $('connected').hidden = false; $('connect').hidden = true; live(true);
    await showRepos();
  });
  if (!me) tok.forget();
}
function renderIdentity(u, exp, classic, rate) {
  const dl = h('dl', { class: 'kv' });
  const row = (k, v) => { dl.append(h('dt', {}, k), h('dd', {}, v)); };
  row('Signed in as', u.login);
  row('Token expires', exp ? exp : 'GitHub did not report an expiry (a token with no expiry is riskier)');
  row('Token kind', classic ? 'Classic token. Scopes: ' + classic + '. Prefer a fine-grained token.' : 'Fine-grained token (no classic scopes reported)');
  row('Kept', tok.isPersisted() ? 'In this tab only (sessionStorage), because you ticked the box.' : 'In memory only. Reloading the page forgets it.');
  if (rate) row('Rate limit', rate.remaining + ' of ' + rate.limit + ' requests left');
  $('who').textContent = u.login + ' (' + (tok.isPersisted() ? 'kept for this tab' : 'in memory') + ')';
  const box = $('identity'); box.replaceChildren(dl,
    h('p', {}, 'GitHub does not list a fine-grained token\'s permissions through its API. What it reports is shown per repository below, as your access to that repository through this token. To see the exact permissions, open the token\'s page on GitHub.'));
}
function disconnect() {
  tok.forget(); setDemo(false); me = null; perms.clear(); $('forget').textContent = 'Forget the token';
  $('connected').hidden = true; $('connect').hidden = false; live(false); view.replaceChildren(); say('Token forgotten.');
}

// ---- repositories ----
async function showRepos() {
  const r = await api('/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member');
  view.replaceChildren(h('h2', {}, 'Repositories this token can see (' + r.body.length + ')'));
  const items = r.body.map((repo) => { perms.set(repo.full_name, repo.permissions || {}); const p = repo.permissions || {};
    return { main: rowLink(repo.full_name, () => guard(() => openRepo(repo.full_name, repo.default_branch))), cells: [h('span', { class: 'tag ' + (p.push ? 'ok' : '') }, p.push ? 'can write' : 'read only'), repo.private ? 'private' : 'public', when(repo.pushed_at)] }; });
  view.append(listOf(['Repository', 'Access', 'Visibility', 'Last push'], items, 'No repositories. The token may not have been given any.'));
}

// ---- one repository ----
async function openRepo(full, branch) {
  const state = { full, branch, tab: 'files' };
  const list = h('div', { class: 'listpane' }), detail = h('div', { class: 'detailpane' }); detail.hidden = true;
  const body = h('div', { class: 'split' }, list, detail); Object.assign(state, { split: body, list, detail });
  const p = perms.get(full) || {};
  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Repository sections' });
  const head = h('div', { class: 'repobar' }, link('All repositories', () => guard(showRepos)), h('strong', {}, full), h('span', { class: 'tag ' + (p.push ? 'ok' : '') }, p.push ? 'can write' : 'read only'), tabs);
  view.replaceChildren(head, body);
  const go = (t) => { state.tab = t; closeDetail(state); [...tabs.children].forEach((b) => b.setAttribute('aria-current', String(b.dataset.t === t))); guard(() => ({ files: () => showDir(state, body, ''), branches: () => showBranches(state, body), issues: () => showIssues(state, body), pulls: () => showPulls(state, body) })[t]()); };
  for (const [t, label] of [['files', 'Files'], ['branches', 'Branches'], ['issues', 'Issues'], ['pulls', 'PRs']]) { const b = btn(label, () => go(t), true); b.dataset.t = t; if (t === 'pulls') b.setAttribute('aria-label', 'Pull requests'); tabs.append(b); }
  go('files');
}
async function showBranches(s, body) {
  const r = await api('/repos/' + s.full + '/branches?per_page=100');
  const ul = listOf(['Branch', 'State'], r.body.map((b) => ({ main: rowLink(b.name, () => { s.branch = b.name; guard(() => showDir(s, body, '')); }), cells: [(b.protected ? 'protected' : '') + (s.branch === b.name ? (b.protected ? ', ' : '') + 'selected' : '')] })));
  paint(s, 'list', h('h2', {}, 'Branches (' + r.body.length + ')'), ul);
}
async function showDir(s, body, path) {
  const r = await api('/repos/' + s.full + '/contents/' + encPath(path) + '?ref=' + enc(s.branch));
  if (!Array.isArray(r.body)) return showFile(s, body, path);
  const crumbs = h('div', { class: 'crumbs' }, h('span', {}, 'Branch ' + s.branch + ' /'), link('root', () => guard(() => showDir(s, body, ''))));
  let acc = ''; for (const part of path.split('/').filter(Boolean)) { acc += (acc ? '/' : '') + part; const here = acc; crumbs.append('/', link(part, () => guard(() => showDir(s, body, here)))); }
  r.body.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  const ul = listOf(['Name', 'Size'], r.body.map((f) => ({ main: rowLink((f.type === 'dir' ? 'Folder: ' : '') + f.name, () => guard(() => (f.type === 'dir' ? showDir(s, body, f.path) : showFile(s, body, f.path)))), cells: [f.type === 'file' ? f.size + ' bytes' : ''] })));
  paint(s, 'list', crumbs, ul);
}
async function showFile(s, body, path) {
  const r = await api('/repos/' + s.full + '/contents/' + encPath(path) + '?ref=' + enc(s.branch));
  const f = r.body;
  const back = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const out = [h('div', { class: 'crumbs' }, link('Back to folder', () => guard(() => showDir(s, body, back))), h('strong', {}, path))];
  let text = null;
  if (f.encoding === 'base64') { try { text = b64ToText(f.content); } catch (e) { text = null; } }
  if (text == null) { out.push(h('p', {}, 'This file is binary or too large to show here (' + f.size + ' bytes). Editing is switched off for it.')); paint(s, 'detail', ...out); return; }
  const shown = h('pre', { class: 'body code', tabindex: '0', 'aria-label': 'File contents' }, text);
  out.push(shown);
  const p = perms.get(s.full) || {};
  if (p.push) {
    const slot = h('div'); out.push(slot);
    const edit = btn('Edit this file', () => { shown.hidden = true; slot.replaceChildren(editor(s, body, path, f.sha, text, () => { shown.hidden = false; slot.replaceChildren(edit); })); slot.querySelector('textarea').focus(); });
    slot.append(edit);
  } else out.push(h('p', {}, 'Editing needs a token with write access to this repository. This one is read only.'));
  paint(s, 'detail', ...out);
}
function editor(s, body, path, sha, text, cancel) {
  const ta = h('textarea', { id: 'edit', 'aria-label': 'New file contents' }); ta.value = text;
  const msg = h('input', { type: 'text', id: 'msg', 'aria-label': 'Commit message' }); msg.value = 'Edit ' + path.split('/').pop();
  const save = btn('Commit this change to ' + s.branch, () => guard(async () => {
    if (!msg.value.trim()) throw new Error('Write a commit message first.');
    if (!confirm('Commit this change to ' + s.full + ' on branch ' + s.branch + '?')) return;
    const r = await api('/repos/' + s.full + '/contents/' + encPath(path), { method: 'PUT', body: { message: msg.value, content: textToB64(ta.value), sha, branch: s.branch } });
    await showFile(s, body, path); say(isDemo() ? 'Demo only: nothing was sent to GitHub.' : 'Committed ' + r.body.commit.sha.slice(0, 7) + '.');
  }));
  return h('div', { class: 'panel' }, h('h2', {}, 'Edit this file'), h('p', {}, 'This makes a real commit on branch ' + s.branch + ' in your name. Pick a branch that is not protected unless you mean it.'), ta, h('label', { for: 'msg' }, 'Commit message'), msg, h('div', { class: 'row' }, save, btn('Cancel', cancel, true)));
}

// ---- issues and pull requests ----
async function showIssues(s, body) {
  const r = await api('/repos/' + s.full + '/issues?state=open&per_page=50');
  const items = r.body.filter((i) => !i.pull_request);
  listItems(s, body, 'Open issues', items, true);
}
async function showPulls(s, body) {
  const r = await api('/repos/' + s.full + '/pulls?state=open&per_page=50');
  listItems(s, body, 'Open pull requests', r.body, false);
}
function listItems(s, body, title, items, canComment) {
  const ul = listOf(['Title', 'Author', 'Updated'], items.map((i) => ({ main: rowLink('#' + i.number + ' ' + i.title, () => guard(() => showThread(s, body, i, canComment))), cells: [i.user ? i.user.login : '', when(i.updated_at)] })), 'None open.');
  paint(s, 'list', h('h2', {}, title + ' (' + items.length + ')'), ul);
}
async function showThread(s, body, item, canComment) {
  const c = await api('/repos/' + s.full + '/issues/' + item.number + '/comments?per_page=100');
  const out = [h('div', { class: 'crumbs' }, link('Back to list', () => guard(() => (canComment ? showIssues(s, body) : showPulls(s, body))))), h('h2', {}, '#' + item.number + ' ' + item.title),
    h('p', {}, (item.user ? item.user.login : '') + ' opened this ' + when(item.created_at) + '. '), h('pre', { class: 'body' }, item.body || '(no description)')];
  for (const m of c.body) out.push(h('div', { class: 'panel' }, h('strong', {}, m.user ? m.user.login : ''), ' ', h('span', { class: 'meta' }, when(m.created_at)), h('pre', { class: 'body' }, m.body)));
  const ta = h('textarea', { id: 'cmt', 'aria-label': 'Your comment' });
  out.push(h('div', { class: 'panel' }, h('h2', {}, 'Add a comment'), h('p', {}, 'Posts a public comment as ' + (me ? me.login : 'you') + ' (pull request comments here are conversation comments). Needs a token with write access to issues or pull requests.'), ta, h('p', {}),
    btn('Post comment', () => guard(async () => {
      if (!ta.value.trim()) throw new Error('Write a comment first.');
      if (!confirm('Post this comment on #' + item.number + ' in ' + s.full + '?')) return;
      await api('/repos/' + s.full + '/issues/' + item.number + '/comments', { method: 'POST', body: { body: ta.value } });
      await showThread(s, body, item, canComment); say(isDemo() ? 'Demo only: nothing was sent to GitHub.' : 'Comment posted.');
    }))));
  paint(s, 'detail', ...out);
}

// ---- start ----
$('connect').addEventListener('submit', (e) => { e.preventDefault(); connect(); });
$('forget').addEventListener('click', disconnect);
async function startDemo() {
  setDemo(true); tok.forget();
  await guard(async () => {
    me = (await api('/user')).body; renderIdentity(me, null, null, null);
    $('identity').replaceChildren(h('p', { class: 'banner' }, h('strong', {}, 'Demo. '), 'Synthetic data about an invented organisation. No token is used and nothing is sent to GitHub, even if you press a commit or comment button.'));
    $('forget').textContent = 'Leave the demo'; $('connected').hidden = false; $('connect').hidden = true; live(true); await showRepos();
  });
}
$('demo').addEventListener('click', startDemo);
try { if (new URLSearchParams(location.search).get('demo') === '1') startDemo(); } catch (e) { /* no demo link */ }
if (tok.restore()) { $('connect').hidden = true; $('connected').hidden = false; live(true); guard(async () => { const [u, rl] = await Promise.all([api('/user'), api('/rate_limit')]); me = u.body; renderIdentity(me, u.headers.get('github-authentication-token-expiration'), u.headers.get('x-oauth-scopes'), rl.body && rl.body.rate); await showRepos(); }).then(() => { if (!me) disconnect(); }); }
