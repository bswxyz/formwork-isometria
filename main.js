/* ISOMETRIA — an isometric island world (three.js) + motion */
import * as THREE from 'three';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('world');

let setNight = () => {};
function initWorld() {
  // acquire the context ourselves and hand it to three, so it never probes a conflicting type
  const ctx = canvas.getContext('webgl2', { antialias: true, alpha: true })
           || canvas.getContext('webgl', { antialias: true, alpha: true });
  if (!ctx) return;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, context: ctx, antialias: true, alpha: true }); }
  catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const FRUST = 15;
  function makeCam() {
    const a = innerWidth / innerHeight;
    const c = new THREE.OrthographicCamera(-FRUST * a / 2, FRUST * a / 2, FRUST / 2, -FRUST / 2, -50, 100);
    c.position.set(9, 10, 9); c.lookAt(0, 1.2, 0); return c;
  }
  let camera = makeCam();

  const world = new THREE.Group(); scene.add(world);

  // lights
  const amb = new THREE.AmbientLight(0xffffff, 0.62);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(8, 14, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xa8cff, 0.0); fill.position.set(-6, 6, -8); scene.add(fill);

  // palette by level
  const COLORS = [0x4db6e8, 0xf0d79a, 0x7ec850, 0x69b545, 0x9aa0a6, 0xf4f7fb];
  const COLS = 11, ROWS = 11, SIZE = 1.0;
  const cx = (COLS - 1) / 2, cz = (ROWS - 1) / 2;
  const mats = COLORS.map(c => new THREE.MeshLambertMaterial({ color: c }));
  const box = new THREE.BoxGeometry(SIZE, 1, SIZE);
  const trees = [];

  function levelAt(i, j) {
    const dx = (i - cx) / cx, dz = (j - cz) / cz;
    const r = Math.sqrt(dx * dx + dz * dz);
    let h = (1 - r) * 4.2 + Math.sin(i * 0.9) * 0.5 + Math.cos(j * 0.75) * 0.5 - 0.4;
    return Math.max(0, Math.round(h));
  }

  for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
    const lvl = levelAt(i, j);
    const hgt = lvl === 0 ? 0.6 : lvl + 0.6;
    const mIdx = Math.min(lvl, COLORS.length - 1);
    const tile = new THREE.Mesh(box, mats[mIdx]);
    tile.scale.y = hgt;
    tile.position.set((i - cx) * SIZE, hgt / 2, (j - cz) * SIZE);
    tile.castShadow = true; tile.receiveShadow = true;
    tile.userData.baseY = hgt / 2;
    world.add(tile);
    // trees on mid grass
    if ((lvl === 2 || lvl === 3) && ((i * 7 + j * 3) % 5 === 0)) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0x8a5a34 }));
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 7), new THREE.MeshLambertMaterial({ color: 0x3f9b57 }));
      leaf.position.y = 0.55; const t = new THREE.Group(); t.add(trunk, leaf);
      t.position.set((i - cx) * SIZE, hgt + 0.2, (j - cz) * SIZE);
      t.traverse(o => { o.castShadow = true; });
      t.userData.phase = i + j; world.add(t); trees.push(t);
    }
  }
  // a little lighthouse in the center-ish
  const house = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.4, 10), new THREE.MeshLambertMaterial({ color: 0xfdfbf5 }));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0xef8d5a }));
  roof.position.y = 0.95;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffd76e }));
  lamp.position.y = 0.62;
  house.add(body, roof, lamp); house.traverse(o => { if (o.geometry && o.material.type !== 'MeshBasicMaterial') o.castShadow = true; });
  const topLvl = levelAt(Math.round(cx), Math.round(cz));
  house.position.set(0, (topLvl + 0.6) + 0.7, 0);
  world.add(house);

  // interaction: drag to spin + hover raise
  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
  let dragging = false, lastX = 0, targetRot = 0.6, autoRot = true, hovered = null;
  world.rotation.y = targetRot;
  canvas.style.pointerEvents = 'auto';
  canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; autoRot = false; canvas.setPointerCapture(e.pointerId); });
  addEventListener('pointerup', () => { dragging = false; setTimeout(() => autoRot = true, 1800); });
  addEventListener('pointermove', e => {
    if (dragging) { targetRot += (e.clientX - lastX) * 0.008; lastX = e.clientX; }
    ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = -(e.clientY / innerHeight) * 2 + 1;
  });

  addEventListener('resize', () => { camera = makeCam(); renderer.setSize(innerWidth, innerHeight); });

  const clock = new THREE.Clock();
  function frame() {
    const t = clock.getElapsedTime();
    if (autoRot && !reduce) targetRot += 0.0016;
    world.rotation.y += (targetRot - world.rotation.y) * 0.08;
    if (!reduce) trees.forEach(tr => { tr.rotation.z = Math.sin(t * 1.5 + tr.userData.phase) * 0.04; });
    if (!reduce) lamp.material.color.setHSL(0.12, 1, 0.6 + Math.sin(t * 3) * 0.12);
    // hover raise
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(world.children.filter(o => o.userData.baseY !== undefined))[0];
    const now = hit ? hit.object : null;
    if (now !== hovered) hovered = now;
    world.children.forEach(o => {
      if (o.userData.baseY === undefined) return;
      const tgt = (o === hovered && !dragging) ? o.userData.baseY + 0.35 : o.userData.baseY;
      o.position.y += (tgt - o.position.y) * 0.2;
    });
    renderer.render(scene, camera);
    if (!reduce) requestAnimationFrame(frame);
  }
  renderer.render(scene, camera);
  if (!reduce) requestAnimationFrame(frame);

  setNight = (on) => {
    amb.intensity = on ? 0.28 : 0.62;
    sun.intensity = on ? 0.35 : 1.5;
    sun.color.set(on ? 0x8ea8ff : 0xffffff);
    fill.intensity = on ? 0.5 : 0.0;
    lamp.material.color.set(0xffd76e);
  };
}
try { initWorld(); } catch (e) { /* CSS bg + hero card remain */ }

/* ---- day / night toggle ---- */
const btn = document.getElementById('daynight');
if (btn) btn.addEventListener('click', () => {
  const night = document.body.classList.toggle('night');
  btn.textContent = night ? '☾ Night' : '☀ Day';
  document.querySelector('meta[name=theme-color]').setAttribute('content', night ? '#0e1230' : '#bfe9ff');
  setNight(night);
});

/* ---- motion layer ---- */
const hero = document.querySelector('.hero');
requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('loaded')));
setTimeout(() => hero.classList.add('loaded'), 400);
const revealAll = () => document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'));
window.addEventListener('load', () => {
  if (!window.gsap) { revealAll(); return; }
  gsap.registerPlugin(ScrollTrigger);
  gsap.utils.toArray('.reveal').forEach(el =>
    ScrollTrigger.create({ trigger: el, start: 'top 90%', onEnter: () => el.classList.add('is-in') }));
});
setTimeout(() => { if (!window.gsap) revealAll(); }, 2500);
