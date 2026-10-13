import { textW } from './uikit.js';

export const BUILD_Y = 102;
export const BUILD_VISIBLE = 6;
export const CATEGORY_ICONS = {
  loger: 'logement', cultiver: 'mais', extraire: 'travail', industrie: 'outils',
  services: 'sante', ordre: 'loi', commerce: 'commerce', etat: 'territoire',
  routes: 'route', demolir: 'demolir',
};
export const HOVER_DELAY = 1000;

export class HoverDelay {
  reset() { this.key = null; this.since = 0; }
  ready(key, now) {
    if (key == null) { this.reset(); return false; }
    if (key !== this.key) { this.key = key; this.since = now; }
    return now - this.since >= HOVER_DELAY;
  }
}

export function fitText(value, width, measure = textW) {
  const text = String(value);
  if (measure(text) <= width) return text;
  if (measure('…') > width) return '';
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid) + '…') <= width) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + '…';
}

export function hitZone(zones, p) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const r = zones[i];
    if (p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h) return r;
  }
  return null;
}
