import { SHEETS, analyticHeight } from './Terrain.js';
import { planeNormals, shadeTerrain } from './terrainShade.js';

/**
 * One terrain grid (Terrain.SHEETS[id]) off the main thread: heights, vertex normals and ground colours. Heightfield.compute
 * starts one of these per sheet while the assets download.
 */
self.onmessage = (e) => {
  const sh = SHEETS.find((s) => s.id === e.data.id);
  const data = new Float32Array(sh.nx * sh.nz);
  for (let j = 0; j < sh.nz; j++) {
    const z = sh.z0 + j * sh.step;
    for (let i = 0; i < sh.nx; i++) data[j * sh.nx + i] = analyticHeight(sh.x0 + i * sh.step, z);
  }
  const normals = planeNormals(sh, data);
  const colors = shadeTerrain(sh, data, normals);
  self.postMessage({ id: sh.id, data, normals, colors }, [data.buffer, normals.buffer, colors.buffer]);
};
