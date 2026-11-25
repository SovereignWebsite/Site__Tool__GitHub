import './theme.js';
import * as tok from './token.js';
import { api, enc, encPath, b64ToText, textToB64 } from './github.js';

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
async function guard(fn) { try { say('Working...'); await fn(); say(''); } catch (e) { say(e.message || 'Something went wrong.', true); } }

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
    $('connected').hidden = false; $('connect').hidden = true;
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
  const box = $('identity'); box.replaceChildren(dl,
    h('p', {}, 'GitHub does not list a fine-grained token\'s permissions through its API. What it reports is shown per repository below, as your access to that repository through this token. To see the exact permissions, open the token\'s page on GitHub.'));
}
function disconnect() {
  tok.forget(); me = null; perms.clear();
  $('connected').hidden = true; $('connect').hidden = false; view.replaceChildren(); say('Token forgotten.');
}

// ---- repositories ----
async function showRepos() {
  const r = await api('/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member');
  view.replaceChildren(h('h2', {}, 'Repositories this token can see (' + r.body.length + ')'));
  const ul = h('ul', { class: 'list' });
  for (const repo of r.body) {
    perms.set(repo.full_name, repo.permissions || {});
    const p = repo.permissions || {};
    ul.append(h('li', {}, link(repo.full_name, () => guard(() => openRepo(repo.full_name, repo.default_branch))),
      h('span', { class: 'tag ' + (p.push ? 'ok' : '') }, p.push ? 'can write' : 'read only'),
      repo.private ? h('span', { class: 'tag' }, 'private') : null,
      h('span', { class: 'meta' }, 'pushed ' + when(repo.pushed_at))));
  }
  if (!r.body.length) ul.append(h('li', {}, 'No repositories. The token may not have been given any.'));
  view.append(ul);
}

// ---- one repository ----
async function openRepo(full, branch) {
  const state = { full, branch, tab: 'files' };
  const head = h('div'), body = h('div');
  view.replaceChildren(h('div', { class: 'crumbs' }, link('All repositories', () => guard(showRepos))), h('h2', {}, full), head, body);
  const p = perms.get(full) || {};
  head.append(h('p', {}, 'Your access through this token: ' + (p.admin ? 'admin, ' : '') + (p.push ? 'write' : 'read only') + '.'));
  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Repository sections' });
  const go = (t) => { state.tab = t; [...tabs.children].forEach((b) => b.setAttribute('aria-current', String(b.dataset.t === t))); guard(() => ({ files: () => showDir(state, body, ''), branches: () => showBranches(state, body), issues: () => showIssues(state, body), pulls: () => showPulls(state, body) })[t]()); };
  for (const [t, label] of [['files', 'Files'], ['branches', 'Branches'], ['issues', 'Issues'], ['pulls', 'Pull requests']]) { const b = btn(label, () => go(t), true); b.dataset.t = t; tabs.append(b); }
  head.append(tabs); go('files');
}
async function showBranches(s, body) {
  const r = await api('/repos/' + s.full + '/branches?per_page=100');
  const ul = h('ul', { class: 'list' });
  for (const b of r.body) ul.append(h('li', {}, link(b.name, () => { s.branch = b.name; guard(() => showDir(s, body, '')); }), b.protected ? h('span', { class: 'tag' }, 'protected') : null, s.branch === b.name ? h('span', { class: 'tag ok' }, 'selected') : null));
  body.replaceChildren(h('h3', {}, 'Branches (' + r.body.length + ')'), ul);
}
async function showDir(s, body, path) {
  const r = await api('/repos/' + s.full + '/contents/' + encPath(path) + '?ref=' + enc(s.branch));
  if (!Array.isArray(r.body)) return showFile(s, body, path);
  const crumbs = h('div', { class: 'crumbs' }, h('span', {}, 'Branch ' + s.branch + ' /'), link('root', () => guard(() => showDir(s, body, ''))));
  let acc = ''; for (const part of path.split('/').filter(Boolean)) { acc += (acc ? '/' : '') + part; const here = acc; crumbs.append('/', link(part, () => guard(() => showDir(s, body, here)))); }
  const ul = h('ul', { class: 'list' });
  r.body.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  for (const f of r.body) ul.append(h('li', {}, link((f.type === 'dir' ? 'Folder: ' : '') + f.name, () => guard(() => (f.type === 'dir' ? showDir(s, body, f.path) : showFile(s, body, f.path)))), f.type === 'file' ? h('span', { class: 'meta' }, f.size + ' bytes') : null));
  body.replaceChildren(crumbs, ul);
}
async function showFile(s, body, path) {
  const r = await api('/repos/' + s.full + '/contents/' + encPath(path) + '?ref=' + enc(s.branch));
  const f = r.body;
  const back = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const out = [h('div', { class: 'crumbs' }, link('Back to folder', () => guard(() => showDir(s, body, back))), h('strong', {}, path))];
  let text = null;
  if (f.encoding === 'base64') { try { text = b64ToText(f.content); } catch (e) { text = null; } }
  if (text == null) { out.push(h('p', {}, 'This file is binary or too large to show here (' + f.size + ' bytes). Editing is switched off for it.')); body.replaceChildren(...out); return; }
  out.push(h('pre', { class: 'body code', tabindex: '0', 'aria-label': 'File contents' }, text));
  const p = perms.get(s.full) || {};
  if (p.push) out.push(editor(s, body, path, f.sha, text));
  else out.push(h('p', {}, 'Editing needs a token with write access to this repository. This one is read only.'));
  body.replaceChildren(...out);
}
function editor(s, body, path, sha, text) {
  const ta = h('textarea', { id: 'edit', 'aria-label': 'New file contents' }); ta.value = text;
  const msg = h('input', { type: 'text', id: 'msg', 'aria-label': 'Commit message' }); msg.value = 'Edit ' + path.split('/').pop();
  const save = btn('Commit this change to ' + s.branch, () => guard(async () => {
    if (!msg.value.trim()) throw new Error('Write a commit message first.');
    if (!confirm('Commit this change to ' + s.full + ' on branch ' + s.branch + '?')) return;
    const r = await api('/repos/' + s.full + '/contents/' + encPath(path), { method: 'PUT', body: { message: msg.value, content: textToB64(ta.value), sha, branch: s.branch } });
    say('Committed ' + r.body.commit.sha.slice(0, 7) + '.'); await showFile(s, body, path); say('Committed.');
  }));
  return h('div', { class: 'panel' }, h('h3', {}, 'Edit this file'), h('p', {}, 'This makes a real commit on branch ' + s.branch + ' in your name. Pick a branch that is not protected unless you mean it.'), ta, h('label', { for: 'msg' }, 'Commit message'), msg, h('p', {}), save);
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
  const ul = h('ul', { class: 'list' });
  for (const i of items) ul.append(h('li', {}, link('#' + i.number + ' ' + i.title, () => guard(() => showThread(s, body, i, canComment))), h('span', { class: 'meta' }, (i.user ? i.user.login : '') + ', ' + when(i.updated_at))));
  if (!items.length) ul.append(h('li', {}, 'None open.'));
  body.replaceChildren(h('h3', {}, title + ' (' + items.length + ')'), ul);
}
async function showThread(s, body, item, canComment) {
  const c = await api('/repos/' + s.full + '/issues/' + item.number + '/comments?per_page=100');
  const out = [h('div', { class: 'crumbs' }, link('Back to list', () => guard(() => (canComment ? showIssues(s, body) : showPulls(s, body))))), h('h3', {}, '#' + item.number + ' ' + item.title),
    h('p', {}, (item.user ? item.user.login : '') + ' opened this ' + when(item.created_at) + '. '), h('pre', { class: 'body' }, item.body || '(no description)')];
  for (const m of c.body) out.push(h('div', { class: 'panel' }, h('strong', {}, m.user ? m.user.login : ''), ' ', h('span', { class: 'meta' }, when(m.created_at)), h('pre', { class: 'body' }, m.body)));
  const ta = h('textarea', { id: 'cmt', 'aria-label': 'Your comment' });
  out.push(h('div', { class: 'panel' }, h('h3', {}, 'Add a comment'), h('p', {}, 'Posts a public comment as ' + (me ? me.login : 'you') + ' (pull request comments here are conversation comments). Needs a token with write access to issues or pull requests.'), ta, h('p', {}),
    btn('Post comment', () => guard(async () => {
      if (!ta.value.trim()) throw new Error('Write a comment first.');
      if (!confirm('Post this comment on #' + item.number + ' in ' + s.full + '?')) return;
      await api('/repos/' + s.full + '/issues/' + item.number + '/comments', { method: 'POST', body: { body: ta.value } });
      await showThread(s, body, item, canComment);
    }))));
  body.replaceChildren(...out);
}

// ---- start ----
$('connect').addEventListener('submit', (e) => { e.preventDefault(); connect(); });
$('forget').addEventListener('click', disconnect);
if (tok.restore()) { $('connect').hidden = true; $('connected').hidden = false; guard(async () => { const [u, rl] = await Promise.all([api('/user'), api('/rate_limit')]); me = u.body; renderIdentity(me, u.headers.get('github-authentication-token-expiration'), u.headers.get('x-oauth-scopes'), rl.body && rl.body.rate); await showRepos(); }).then(() => { if (!me) disconnect(); }); }
