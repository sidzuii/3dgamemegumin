import { CLIPS } from './clips.js';
import { CH0 } from './ch0.js';
import { SIDE_F } from './side_f.js';
import { CH2 } from './ch2.js';
import { CH3 } from './ch3.js';
import { CH4 } from './ch4.js';

/** Every compiled story scene (dialogue id -> graph). Merged into DIALOGUES (data/dialogues.js). */
export const STORY_SCENES = { ...CH0, ...SIDE_F, ...CH2, ...CH3, ...CH4 };

/** Text of one recorded line, e.g. clipText('A07_006') — for barks and toasts that reuse the package's lines. */
export const clipText = (id) => CLIPS[id]?.[1] ?? '';
