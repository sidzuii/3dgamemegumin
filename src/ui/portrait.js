/** Small SVG portraits for dialogue: built from an NPC's `look` colours. */
const hex = (n, d = '#888') => (typeof n === 'number' ? '#' + n.toString(16).padStart(6, '0') : d);

export function portraitSVG(look) {
  if (look === 'megumin') {
    return `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#3a1418"/>
      <path d="M14 70 Q38 50 62 70 Z" fill="#a8243a"/>
      <circle cx="38" cy="44" r="15" fill="#ffe4d0"/>
      <path d="M22 44 Q24 24 38 26 Q52 24 54 44 Q50 34 38 34 Q26 34 22 44 Z" fill="#3a2418"/>
      <circle cx="32" cy="45" r="2.6" fill="#d8202a"/><circle cx="44" cy="45" r="2.6" fill="#d8202a"/>
      <path d="M8 30 Q38 38 68 30 L58 26 L44 2 L34 22 L18 26 Z" fill="#2a1c22" stroke="#e8a33a" stroke-width="1.5"/>
      <path d="M8 30 Q38 38 68 30" fill="none" stroke="#e8a33a" stroke-width="2.4"/></svg>`;
  }
  if (look === 'roxy' || look?.roxy) {
    return `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#14203a"/>
      <path d="M14 70 Q38 50 62 70 Z" fill="#f0f0f8"/>
      <circle cx="38" cy="44" r="15" fill="#ffe8dc"/>
      <path d="M21 50 Q20 26 38 26 Q56 26 55 50 Q52 34 38 34 Q24 34 21 50 Z" fill="#3a5ab8"/>
      <circle cx="32" cy="45" r="2.6" fill="#3a6ad8"/><circle cx="44" cy="45" r="2.6" fill="#3a6ad8"/>
      <path d="M6 30 Q38 37 70 30 L58 26 L40 4 L34 24 L18 26 Z" fill="#1a1a2a" stroke="#d8d8f0" stroke-width="1.2"/></svg>`;
  }
  const L = look || {};
  const skin = hex(L.skin, '#ffe0c8'), hair = hex(L.hair, '#3a2418'), top = hex(L.top, '#6a7ab0');
  const style = L.hairStyle || 'short';
  const hat = L.hat;
  const hatC = hex(L.hatColor, '#5a3a2a');
  let hairBack = '', hatSvg = '';
  if (style === 'long' || style === 'braids') hairBack = `<rect x="21" y="34" width="34" height="28" rx="10" fill="${hair}"/>`;
  if (style === 'bun') hairBack = `<circle cx="38" cy="22" r="7" fill="${hair}"/>`;
  if (style === 'ponytail') hairBack = `<path d="M50 30 Q62 40 56 56" stroke="${hair}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  const hairTop = style === 'bald' ? '' : `<path d="M22 44 Q22 26 38 26 Q54 26 54 44 Q50 33 38 33 Q26 33 22 44 Z" fill="${hair}"/>`;
  if (hat === 'wide') hatSvg = `<ellipse cx="38" cy="30" rx="28" ry="5" fill="${hatC}"/><path d="M27 30 Q28 16 38 16 Q48 16 49 30 Z" fill="${hatC}"/>`;
  if (hat === 'witch') hatSvg = `<ellipse cx="38" cy="30" rx="30" ry="5" fill="${hatC}"/><path d="M26 30 L40 2 L50 30 Z" fill="${hatC}"/>`;
  if (hat === 'hood') hatSvg = `<path d="M18 52 Q16 22 38 20 Q60 22 58 52 Q54 32 38 32 Q22 32 18 52 Z" fill="${hatC}"/>`;
  if (hat === 'helmet') hatSvg = `<path d="M21 38 Q21 20 38 20 Q55 20 55 38 Z" fill="${hatC}"/><rect x="36" y="30" width="4" height="14" fill="${hatC}"/>`;
  if (hat === 'cap') hatSvg = `<path d="M22 34 Q24 22 38 22 Q52 22 54 34 Z" fill="${hatC}"/>`;
  if (hat === 'scarf') hatSvg = `<path d="M21 40 Q21 22 38 22 Q55 22 55 40 Q50 30 38 30 Q26 30 21 40 Z" fill="${hatC}"/>`;
  const beard = L.beard ? `<path d="M27 48 Q38 66 49 48 Q44 54 38 54 Q32 54 27 48 Z" fill="${hair}"/>` : '';
  return `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#2a1e22"/>
    ${hairBack}
    <path d="M12 76 Q38 52 64 76 Z" fill="${top}"/>
    <circle cx="38" cy="44" r="15" fill="${skin}"/>
    <circle cx="32" cy="45" r="2.2" fill="#2a1e2a"/><circle cx="44" cy="45" r="2.2" fill="#2a1e2a"/>
    <path d="M34 52 Q38 54 42 52" stroke="#8a4a4a" stroke-width="1.4" fill="none"/>
    ${beard}${hairTop}${hatSvg}</svg>`;
}
