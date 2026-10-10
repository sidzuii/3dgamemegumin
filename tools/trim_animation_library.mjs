import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, resample, dedup } from '@gltf-transform/functions';
const KEEP = new Set(['A_TPose','Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Jump_Start','Jump_Loop','Jump_Land','Hit_Chest','Hit_Head','Death01','Roll','Spell_Simple_Enter','Spell_Simple_Idle_Loop','Spell_Simple_Shoot','Spell_Simple_Exit','Sword_Attack','Sword_Idle','Punch_Jab','Punch_Cross','Interact','Crouch_Idle_Loop','PickUp_Table','Idle_Talking_Loop','Dance_Loop']);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
for (const a of root.listAnimations()) if (!KEEP.has(a.getName())) a.dispose();
// Drop the mannequin mesh (keep the skeleton nodes).
for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
for (const m of root.listMaterials()) m.dispose();
for (const t of root.listTextures()) t.dispose();
await doc.transform(resample({ tolerance: 0.0005 }), dedup(), prune());
await io.write(process.argv[3], doc);
console.log('anims', root.listAnimations().map(a => a.getName()).join(','));
