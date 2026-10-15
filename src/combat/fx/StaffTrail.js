import * as THREE from 'three';

/**
 * Additive ribbon following the staff during swings. Physical hits only leave a faint pale streak (no flame on
 * the staff: the series is a physical attack, docs/combat/02 M-L); it lives about 0.12 s.
 */
export class StaffTrail {
  constructor(scene) {
    this.max = 18;
    this.samples = [];
    this.life = 0.12;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 2 * 3);
    this.alpha = new Float32Array(this.max * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.color = new THREE.Vector3(1.5, 1.4, 1.25);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uC: { value: this.color } },
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uC; varying float vA; void main(){ gl_FragColor = vec4(uC * vA, 1.0); }',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
  }

  setTint(r, g, b) {
    this.color.set(r, g, b);
  }

  push(tip, base, strength = 1) {
    this.samples.unshift({ tip: tip.clone(), base: base.clone(), age: 0, s: strength });
    if (this.samples.length > this.max) this.samples.pop();
  }

  update(dt) {
    const life = this.life;
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[this.samples.length - 1].age > life) this.samples.pop();
    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const a = Math.max(0, 1 - s.age / life) * (1 - i / this.max) * 0.4 * s.s;
      this.pos.set([s.tip.x, s.tip.y, s.tip.z, s.base.x, s.base.y, s.base.z], i * 6);
      this.alpha[i * 2] = a;
      this.alpha[i * 2 + 1] = a * 0.15;
    }
    this.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
