// Design direction: an allowlist, chosen with ?design=name or on /designs/. Kept in sessionStorage (not secret).
// High contrast is a setting on top of any direction, with a button in the header.
export const DESIGNS = ['paper', 'terminal', 'ledger', 'cards', 'twopane'];
const get = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const put = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } };
export function applyDesign() {
  let d = null, c = null;
  try { const q = new URLSearchParams(location.search); d = q.get('design'); c = q.get('contrast'); } catch (e) { /* no query */ }
  if (DESIGNS.includes(d)) put('design', d); else d = get('design');
  if (c === '1') put('contrast', '1'); else if (c === '0') put('contrast', null);
  if (DESIGNS.includes(d)) document.documentElement.dataset.design = d;
  if (get('contrast') === '1') document.documentElement.dataset.contrast = 'high';
}
function contrastButton() {
  const nav = document.querySelector('.own'); if (!nav) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'alt small'; b.id = 'contrast';
  const sync = () => { const on = document.documentElement.dataset.contrast === 'high'; b.setAttribute('aria-pressed', String(on)); b.textContent = 'High contrast: ' + (on ? 'on' : 'off'); };
  b.addEventListener('click', () => { const on = document.documentElement.dataset.contrast === 'high'; if (on) { delete document.documentElement.dataset.contrast; put('contrast', null); } else { document.documentElement.dataset.contrast = 'high'; put('contrast', '1'); } sync(); });
  sync(); nav.append(b);
}
applyDesign();
contrastButton();
