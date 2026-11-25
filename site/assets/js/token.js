// The token lives in this module's memory. It is written to sessionStorage only if the user ticks the box,
// and never to localStorage, a cookie or a URL. Nothing here logs it. It is read only by github.js.
const KEY = 'ghtool-token';
let token = '';
let persisted = false;
export function restore() {
  try { const t = sessionStorage.getItem(KEY); if (t) { token = t; persisted = true; } } catch (e) { /* blocked */ }
  return has();
}
export function set(value, keepForTab) {
  token = String(value || '').trim();
  persisted = false;
  try { sessionStorage.removeItem(KEY); } catch (e) { /* blocked */ }
  if (token && keepForTab) { try { sessionStorage.setItem(KEY, token); persisted = true; } catch (e) { /* blocked */ } }
}
export function forget() {
  token = ''; persisted = false;
  try { sessionStorage.removeItem(KEY); } catch (e) { /* blocked */ }
}
export function has() { return token.length > 0; }
export function isPersisted() { return persisted; }
export function bearer() { return 'Bearer ' + token; }
