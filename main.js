// --- JUEGO: FPS simple con joystick, ítems y puerta (v2 con depuración) ---
import { createJoystick } from './joystick.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const fireBtn = document.getElementById('fireBtn');
const panel = document.getElementById('formPanel');
const redeemBtn = document.getElementById('redeem');

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
resize(); window.addEventListener('resize', resize);

// Scene & Camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);

const clock = new THREE.Clock();
const player = { pos: new THREE.Vector3(0, 1.6, 6), yaw: 0, pitch: 0, speed: 6, collected: 0, ammo: 999 };

let joystick, lookPointer = null, lastPt = null;
let enemies = [], items = [], door, hasOpened = false;
let debugRay;

const ITEM_NAMES = [
  "Botella de aceite","Exfoliante Ayurveda","Dos toallas",
  "Bata para masaje","Altavoz","Cobija","Tapa ojos"
];

init();
animate();

function init() {
  // Luces
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(6, 10, 4); scene.add(dir);

  // Piso
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Paredes
  addWall(80,6,1, 0,3,-40);
  addWall(1,6,80, -40,3,0);
  addWall(1,6,80, 40,3,0);
  addWall(80,6,1, 0,3, 40);

  // Puerta
  door = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 1), new THREE.MeshStandardMaterial({ color: 0x444488 }));
  door.position.set(0, 3, 39.5); scene.add(door);

  // Enemigos
  const enemyMat = new THREE.MeshStandardMaterial({ color: 0xaa3333 });
  for (let i = 0; i < 5; i++) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), enemyMat);
    e.position.set(rand(-20, 20), 0.5, rand(-20, 20));
    scene.add(e); enemies.push(e);
  }

  // Ítems
  const itemMat = new THREE.MeshStandardMaterial({ color: 0x00ffaa, emissive: 0x007755, emissiveIntensity: 1.2 });
  for (let i = 0; i < ITEM_NAMES.length; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), itemMat.clone());
    s.position.set(rand(-30, 30), 0.5, rand(-25, 25));
    s.userData.name = ITEM_NAMES[i];
    scene.add(s); items.push(s);
  }

  // Línea de depuración del disparo
  const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0,0,-4)]);
  debugRay = new THREE.Line(rayGeom, new THREE.LineBasicMaterial({ color: 0x00ffff }));
  camera.add(debugRay); debugRay.visible = false; // se muestra brevemente al disparar
  scene.add(camera);

  // Controles
  joystick = createJoystick(document.getElementById('stick'));
  fireBtn.addEventListener('click', shoot);
  window.addEventListener('keydown', (e)=>{ if (e.code === 'Space') shoot(); });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);

  // Form
  redeemBtn.addEventListener('click', () => {
    const name = document.getElementById('name').value.trim();
    const mail = document.getElementById('mail').value.trim();
    if (!name || !mail) { alert('Completa al menos Nombre y Correo'); return; }
    alert('¡Cupón canjeado! (demo)');
    panel.classList.add('hidden');
  });

  updateStatus();
  camera.position.copy(player.pos);
  console.log('✅ Juego listo. Usa joystick para moverte, arrastra en la derecha para mirar, SPACE o botón para disparar.');
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());

  // Movimiento (joystick)
  const j = joystick.value; // {x,y} en [-1..1]
  const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const vel = fwd.clone().multiplyScalar(j.y).add(right.clone().multiplyScalar(j.x)).multiplyScalar(player.speed * dt);
  player.pos.add(vel);

  // Enemigos persiguen
  enemies.forEach(e => {
    const dir = player.pos.clone().setY(0).sub(e.position.clone().setY(0));
    if (dir.length() > 0.001) e.position.add(dir.normalize().multiplyScalar(1.6 * dt));
  });

  // Recoger ítems (radio ampliado para que sea fácil)
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].position.distanceTo(player.pos) < 2.2) {
      const name = items[i].userData.name;
      scene.remove(items[i]); items.splice(i, 1);
      player.collected++; updateStatus(`Recogido: ${name}`);
    }
  }

  // Abrir puerta
  if (!hasOpened && player.collected >= ITEM_NAMES.length) {
    hasOpened = true;
    door.position.y = 9;
    setTimeout(() => panel.classList.remove('hidden'), 600);
  }

  // Cámara
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0, 'ZYX');

  renderer.render(scene, camera);
}

function shoot() {
  if (player.ammo <= 0) return;

  // Mostrar brevemente la línea de disparo
  debugRay.visible = true;
  setTimeout(()=>debugRay.visible=false, 70);

  const ray = new THREE.Raycaster(camera.position, getForward(), 0, 60);
  const hits = ray.intersectObjects(enemies);
  if (hits.length) {
    const e = hits[0].object;
    scene.remove(e);
    enemies = enemies.filter(x => x !== e);
    console.log('🎯 enemigo eliminado');
  } else {
    console.log('💨 disparo sin impacto');
  }
  player.ammo--;
}

function onPointerDown(e) {
  if (e.clientX > window.innerWidth * 0.35) {
    lookPointer = e.pointerId; lastPt = { x: e.clientX, y: e.clientY };
  }
}
function onPointerMove(e) {
  if (e.pointerId !== lookPointer) return;
  const dx = e.clientX - lastPt.x, dy = e.clientY - lastPt.y;
  lastPt = { x: e.clientX, y: e.clientY };
  const sens = 0.0022;
  player.yaw -= dx * sens;
  player.pitch = clamp(player.pitch - dy * sens, -1.3, 1.3);
}
function onPointerUp(e) { if (e.pointerId === lookPointer) lookPointer = null; }

function getForward() {
  const f = new THREE.Vector3(0, 0, -1);
  f.applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'ZYX')).normalize();
  return f;
}

function updateStatus(extra) {
  statusEl.textContent = `Objetos: ${player.collected} / ${ITEM_NAMES.length}` + (extra ? ` — ${extra}` : '');
}

function addWall(w, h, d, x, y, z) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x1f1f1f }));
  wall.position.set(x, y, z); scene.add(wall); return wall;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
