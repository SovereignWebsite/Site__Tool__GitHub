// The only network code. Every request goes to https://api.github.com and nowhere else.
import { bearer, has } from './token.js';
const BASE = 'https://api.github.com';
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function plain(status, body) {
  const m = body && body.message ? String(body.message) : '';
  if (status === 401) return 'GitHub did not accept the token (401). It may be wrong, expired or revoked.';
  if (status === 403 && /rate limit/i.test(m)) return 'GitHub rate limit reached. Wait and try again.';
  if (status === 403) return 'The token is not allowed to do that (403). ' + m;
  if (status === 404) return 'Not found (404). With a fine-grained token this also means the token cannot see it.';
  if (status === 409 || status === 422) return 'GitHub refused the change (' + status + '). ' + m;
  return 'GitHub answered ' + status + '. ' + m;
}
// Refuse anything that could make fetch resolve to a different endpoint: dot segments, backslashes,
// control characters, encoded dots, slashes or backslashes, and a double slash at the start.
function safePath(path) {
  if (typeof path !== 'string' || path[0] !== '/' || path.startsWith('//')) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return false;
  const base = path.split(/[?#]/)[0];
  if (/%(2e|2f|5c)/i.test(base)) return false; // a query may legitimately hold %2F (a branch such as feature/x)
  return !base.split('/').some((seg) => seg === '.' || seg === '..');
}
export async function api(path, opts = {}) {
  if (!has()) throw new ApiError(0, 'Paste a token first.');
  if (!safePath(path)) throw new ApiError(0, 'Bad request path.');
  const init = { method: opts.method || 'GET', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: bearer() }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };
  if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
  let res;
  try { res = await fetch(BASE + path, init); } catch (e) { throw new ApiError(0, 'Could not reach api.github.com. Check your connection.'); }
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok) throw new ApiError(res.status, plain(res.status, body));
  return { body, headers: res.headers };
}
export const enc = (s) => encodeURIComponent(s);
export const encPath = (p) => p.split('/').map(enc).join('/');
export function b64ToText(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
export function textToB64(text) {
  const bytes = new TextEncoder().encode(text); let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}
