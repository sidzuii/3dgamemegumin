// Browser-console test helpers (not loaded by the game). In the dev page:
//   eval(await (await fetch('/tools/debug_helpers.js')).text()); await __init();
// The hidden browser pane does not tick by itself: __step(sec) runs frames manually.
window.__init = async () => {
  await new Promise((r) => {
    const t0 = performance.now();
    const i = setInterval(() => {
      if ((window.__game?.mainMenu?.view === 'title' && window.__game?.npcs && window.__game?.dayNight) || performance.now() - t0 > 90000) { clearInterval(i); r(); }
    }, 300);
  });
  const g = window.__game;
  if (!g.started) document.querySelector('#overlay .mm-btn.primary').click(); // «Продолжить» / «Начать путь» of the main menu
  const V = g.camera.position.constructor;
  window.V = V;
  window.__step = async (sec) => { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 33)); g._frame(); } };
  window.__tp = async (x, z, yaw = 0, y) => { g.player.controller.teleport(new V(x, y ?? g.world.groundAt(x, z) + 0.05, z), yaw); await window.__step(0.6); };
  window.__goto = async (id) => { const n = g.npcs.get(id); const p = n.position.clone(); const a = n.yaw; p.x += Math.sin(a) * 1.6; p.z += Math.cos(a) * 1.6; p.y = g.world.groundAt(p.x, p.z, p.y + 2) + 0.05; g.player.controller.teleport(p, a + Math.PI); await window.__step(0.3); };
  // Manual camera renders (stops the animation loop; __init again to resume normal play).
  window.__look = (id, dist = 3.0, h = 1.3, side = 0) => { g.renderer.setAnimationLoop(null); const n = g.npcs.get(id); const p = n.position; const a = n.yaw + side; const c = g.camera; c.position.set(p.x + Math.sin(a) * dist, p.y + h, p.z + Math.cos(a) * dist); c.lookAt(p.x, p.y + 0.95, p.z); c.updateMatrixWorld(); g.world.followShadow(p); g.composer.render(); };
  window.__lookAt = (x, y, z, tx, ty, tz) => { g.renderer.setAnimationLoop(null); const c = g.camera; c.position.set(x, y, z); c.lookAt(tx, ty, tz); c.updateMatrixWorld(); g.world.followShadow(new V(tx, ty, tz)); g.composer.render(); };
  window.__stats = () => { const i = g.renderer.info; g.composer.render(); return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; };
  return 'ready';
};
