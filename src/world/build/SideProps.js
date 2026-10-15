import * as THREE from 'three';
import { Frame } from './Kit.js';
import { QuestProp } from '../Interactables.js';
import { SIDE_SPOTS, SIDE_PROPS, SIDE_CAMPS } from '../../data/story/sideprops.js';

/**
 * Places and props of the side stories (data/story/sideprops.js): named spots and simple props at spots / points of interest.
 * Runs after every other builder, so spots registered by them exist. Each prop is its own group `sp_<id>` (editor-movable).
 */
export function buildSideProps(W) {
  const base = (e) => {
    if (e.abs) return { x: e.abs[0] + (e.dx || 0), z: e.abs[1] + (e.dz || 0), y: 0 };
    let x, z;
    if (e.spot) {
      const s = W.npcSpots[e.spot]?.pos;
      if (!s) return null;
      x = s.x; z = s.z;
    } else [x, z] = e.at;
    x += e.dx || 0; z += e.dz || 0;
    return { x, z, y: W.heightAt(x, z) };
  };
  for (const s of SIDE_SPOTS) {
    const b = base(s);
    if (b) W.spot(s.name, new THREE.Vector3(b.x, b.y, b.z), s.yaw || 0);
  }
  for (const c of SIDE_CAMPS) {
    const b = base(c);
    if (b) W.camp(c.type, b.x, b.z, c.camp);
  }
  for (const e of SIDE_PROPS) {
    const b = base(e);
    if (!b) { console.warn('side prop without a place:', e.id); continue; }
    W.group('sp_' + e.id, { x: b.x, z: b.z }, () => {
      const F = new Frame(W, b.x, b.y, b.z, 0);
      switch (e.shape) {
        case 'lever': F.box(0.5, 0.5, 0.5, 0, 0, 0, 'stoneDark', { collide: false, tint: 0x8a8478 }); F.cyl(0.06, 1.0, 0, 0.5, 0, 'metal', { seg: 6, rx: -0.5, collide: false }); break;
        case 'valve': F.cyl(0.14, 1.1, 0, 0, 0, 'metal', { seg: 8, collide: false }); F.cyl(0.38, 0.08, 0, 1.15, 0, 'metal', { seg: 12, collide: false }); break;
        case 'stake': F.cyl(0.08, 1.4, 0, 0, 0, 'log', { seg: 6, collide: false, tint: 0x6a4a34 }); F.box(0.5, 0.3, 0.06, 0, 1.4, 0, 'plank', { collide: false, tint: 0xc8b890 }); break;
        case 'board': F.cyl(0.07, 1.2, 0, 0, 0, 'log', { seg: 6, collide: false, tint: 0x6a4a34 }); F.box(0.9, 0.6, 0.08, 0, 1.1, 0, 'plank', { collide: false, tint: 0xb89a6a }); break;
        case 'ring': F.cyl(0.35, 0.08, 0, 0.6, 0, 'metal', { seg: 12, rx: Math.PI / 2, collide: false }); break;
        case 'crate': F.box(0.9, 0.7, 0.7, 0, 0, 0, 'wood', { collide: false, tint: 0x7a5232 }); break;
        case 'plank': F.box(1.6, 0.1, 0.4, 0, 0.05, 0, 'plank', { collide: false, tint: 0x8a6a44, ry: 0.4 }); break;
        case 'pipe': F.cyl(0.4, 1.3, 0, 0, 0, 'metal', { seg: 10, collide: false, tint: 0x6a7684 }); F.cyl(0.5, 0.1, 0, 1.3, 0, 'stoneDark', { seg: 10, collide: false }); break;
        case 'mark': F.cyl(0.5, 0.05, 0, 0, 0, 'stone', { seg: 10, collide: false, castShadow: false, tint: 0xa89a7a }); break;
        default: break;
      }
      W.addInteractable(new QuestProp({ id: e.id, name: e.name, prompt: e.prompt, position: new THREE.Vector3(b.x, b.y + (e.y ?? 0.9), b.z), shape: e.shape === 'sack' ? 'sack' : 'none' }));
    }, 'Побочное задание: ' + e.name);
  }
}
