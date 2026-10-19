import DATA from '../data/icons.json';
import { ITEMS } from '../data/items.js';

/**
 * The painted icons (the pack «Megumin_Icons_v1»: raw sources in model/icons/, data src/data/icons.json): 64 items by their
 * ITEMS id, the eight combat skills (`skill_*`) and eight interface signs (`ui_*`), drawn from five atlases
 * (public/ui/icons/*.webp — 768 px copies of the 1254 px PNGs; the frames of icons.json are in source pixels, the CSS below works
 * in percentages, so the scale of the atlas does not matter). An icon is a square of `size` px with the picture centred in it,
 * never stretched; an unknown id falls back to the item's emoji.
 */
const ICONS = DATA.icons;
const BASE = (import.meta.env?.BASE_URL ?? '/') + 'ui/icons/';
const ID_OF = new Map(Object.entries(ITEMS).map(([id, it]) => [it, id]));
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Combat slots → their icons. */
export const SKILL_ICON = {
  M_Q: 'skill_staff_lunge', M_E: 'skill_staff_sweep', M_R: 'skill_explosion', M_F: 'skill_crimson_breach',
  R_Q: 'skill_water_lash', R_E: 'skill_counter_thrust', R_R: 'skill_water_volley', R_F: 'skill_tidal_collapse',
};

export function hasIcon(id) {
  return Object.hasOwn(ICONS, id);
}

/** HTML of an atlas icon `size` px square, or '' when there is none. */
export function iconHtml(id, size = 40, extra = '') {
  const icon = ICONS[id];
  if (!icon) return '';
  const { x, y, w, h } = icon.frame;
  const W = DATA.atlases[icon.atlas]?.width ?? icon.atlasWidth ?? 1254, H = DATA.atlases[icon.atlas]?.height ?? icon.atlasHeight ?? 1254;
  const url = BASE + icon.file.replace(/\.png$/, '.webp');
  const k = (size * 0.88) / Math.max(w, h);
  const st = `width:${(w * k).toFixed(1)}px;height:${(h * k).toFixed(1)}px;background-image:url('${esc(url)}');`
    + `background-position:${((x / (W - w)) * 100).toFixed(3)}% ${((y / (H - h)) * 100).toFixed(3)}%;background-size:${((W / w) * 100).toFixed(3)}% ${((H / h) * 100).toFixed(3)}%`;
  return `<span class="mg-icon${extra ? ' ' + extra : ''}" role="img" aria-label="${esc(icon.name)}" style="--mg-icon-size:${size}px"><span class="mg-icon-image" style="${st}"></span></span>`;
}

/** An item's icon by id or by its ITEMS object: the painted one, else its emoji (marked `.ico-emoji`, the only one the potion tints recolour). */
export function itemIcon(item, size = 40) {
  const id = typeof item === 'string' ? item : ID_OF.get(item);
  const it = typeof item === 'string' ? ITEMS[item] : item;
  return iconHtml(id, size) || `<span class="ico-emoji">${esc(it?.icon ?? '❔')}</span>`;
}

/** The same as a DOM node (for places that build their elements and keep text in textContent). */
export function itemIconNode(item, size = 40) {
  const t = document.createElement('template');
  t.innerHTML = itemIcon(item, size);
  return t.content.firstChild;
}
