// Design direction: an allowlist, chosen with ?design=name or on /designs/. Kept in sessionStorage (not secret).
export const DESIGNS = ['paper', 'terminal', 'ledger', 'cards', 'contrast'];
export function applyDesign() {
  let d = null;
  try { d = new URLSearchParams(location.search).get('design'); } catch (e) { d = null; }
  try {
    if (DESIGNS.includes(d)) sessionStorage.setItem('design', d);
    else d = sessionStorage.getItem('design');
  } catch (e) { /* storage may be blocked: the default design is used */ }
  if (DESIGNS.includes(d)) document.documentElement.dataset.design = d;
}
applyDesign();
