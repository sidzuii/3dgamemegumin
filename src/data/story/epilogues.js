import { CLIPS } from './clips.js';

/**
 * Epilogues of the side stories (docs/story/05, V06): [variable/flag set when the order is handed in, clip id]. The credits
 * (RPG._credits) quote the clip of each completed one; the same clips are the plaza barks after the finale (npcs.js).
 */
const EPI = [
  ['IVO_HELP', 'V06_001'], ['RANN_NESTS', 'V06_003'], ['BORIS_GATE', 'V06_004'], ['GARRET_RECORD', 'V06_005'], ['MARTA_BRIDGE', 'V06_006'],
  ['TOBIAS_ROAD', 'V06_007'], ['EDMUND_TEAM', 'V06_008'], ['CLARA_RECORD', 'V06_009'], ['AXEL_SHELTER', 'V06_010'],
];
const NAMES = { ИВО: 'Иво', САЙРУС: 'Сайрус', РАНН: 'Ранн', БОРИС: 'Борис', ГАРРЕТ: 'Гаррет', МАРТА: 'Марта', ТОБИАС: 'Тобиас', ТЕРА: 'Тера', АГАТА: 'Агата', МИЯ: 'Мия' };
export const SIDE_EPILOGUES = EPI.map(([key, id]) => [key, `${NAMES[CLIPS[id][0]] || CLIPS[id][0]}: «${CLIPS[id][1]}»`]);
