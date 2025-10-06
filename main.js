// main.js — SpaDoom PWA (movimiento suave + disparo + sonidos + spark)
import { createJoystick } from './joystick.js';

const canvas    = document.getElementById('game');
const statusEl  = document.getElementById('status');
const fireBtn   = document.getElementById('fireBtn');
const panel     = document.getElementById('formPanel');
const redeemBtn = document.getElementById('redeem');

let renderer, scene, camera, clock;
let joystick, lookPointer = null, lastPt = null;
let enemies = [], enemyGroup, items = [], door, hasOpened = false, debugRay;
let sfx = {}; // sonidos

const ROOM_HALF = 38; // límites (sala 76x76)
const ITEM_NAMES = [
  "Botella de aceite","Exfoliante Ayurveda","Dos toallas",
  "Bata para masaje","Altavoz","Cobija","Tapa ojos"
];

const player = {
  pos: new THREE.Vector3(0, 1.6, 6),
  yaw: 0, pitch: 0,
  speed: 7,
  vel: new THREE.Vector3(),
  collected: 0, ammo: 999
};

init();
animate();

function init(){
  // --- Escena / Cámara / Renderer ---
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d0f);
  scene.fog = new THREE.Fog(0x0d0d0f, 40, 120);

  camera = new THREE.PerspectiveCamera(60, 16/9, 0.1, 1000);
  camera.position.copy(player.pos);

  renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  window.addEventListener('resize', resize);
  resize();

  clock = new THREE.Clock();

  // --- Sonidos ---
  sfx.shoot  = new Audio('./assets/sfx/shoot.mp3');
  sfx.pickup = new Audio('./assets/sfx/pickup.mp3');
  sfx.door   = new Audio('./assets/sfx/door.mp3');
  [sfx.shoot, sfx.pickup, sfx.door].forEach(a => { a.preload = 'auto'; a.volume = 0.8; });

  // --- Luces ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(10,16,6); dir.castShadow = true;
  dir.shadow.mapSize.set(1024,1024);
  dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 90;
  scene.add(dir);

  // --- Piso ---
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2*ROOM_HALF, 2*ROOM_HALF),
    new THREE.MeshStandardMaterial({ color:0x2e2e30, roughness:0.95 })
  );
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- Paredes ---
  addWall(2*ROOM_HALF, 6, 1,   0, 3, -ROOM_HALF);
  addWall(1, 6, 2*ROOM_HALF,  -ROOM_HALF, 3, 0);
  addWall(1, 6, 2*ROOM_HALF,   ROOM_HALF, 3, 0);
  addWall(2*ROOM_HALF, 6, 1,   0, 3,  ROOM_HALF);

  // --- Puerta ---
  door = new THREE.Mesh(
    new THREE.BoxGeometry(6,6,1),
    new THREE.MeshStandardMaterial({ color:0x4952a6, metalness:0.2, roughness:0.4 })
  );
  door.position.set(0,3, ROOM_HALF - 0.5);
  door.castShadow = true; door.receiveShadow = true;
  scene.add(door);

  // --- Enemigos (cápsulas) ---
  enemyGroup = new THREE.Group(); scene.add(enemyGroup);
  const enemyMat = new THREE.MeshStandardMaterial({ color:0x9b2c2c, emissive:0x330909, emissiveIntensity:0.45, roughness:0.6, metalness:0.1 });
  for (let i=0;i<6;i++){
    const geo = new THREE.CapsuleGeometry(0.45, 0.8, 6, 12);
    const e = new THREE.Mesh(geo, enemyMat.clone());
    e.castShadow = true; e.receiveShadow = true;
    e.position.set(rand(-20,20), 0.9, rand(-20,20));
    enemyGroup.add(e); enemies.push(e);
  }

  // --- Ítems (cristales) ---
  const gemMat = new THREE.MeshStandardMaterial({ color:0x00ffaa, emissive:0x0a5b48, emissiveIntensity:1.2, roughness:0.3, metalness:0.1 });
  for (let i=0;i<ITEM_NAMES.length;i++){
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), gemMat.clone());
    s.position.set(rand(-ROOM_HALF+4, ROOM_HALF-4), 0.7, rand(-ROOM_HALF+4, ROOM_HALF-4));
    s.userData.name = ITEM_NAMES[i];
    s.castShadow = true; s.receiveShadow = true;
    scene.add(s); items.push(s);
  }

  // --- Línea de disparo (debug) ---
  const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0,0,-4)]);
  debugRay = new THREE.Line(rayGeom, new THREE.LineBasicMaterial({ color:0x00ffff }));
  camera.add(debugRay); debugRay.visible = false;
  scene.add(camera);

  // --- Controles ---
  joystick = createJoystick(document.getElementById('stick'), { dead:0.18, smooth:0.2 });
  fireBtn.addEventListener('click', shoot);
  window.addEventListener('keydown', e => { if (e.code === 'Space') shoot(); });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup',   onPointerUp);

  // --- Formulario ---
  redeemBtn.addEventListener('click', () => {
    const name = document.getElementById('name').value.trim();
    const mail = document.getElementById('mail').value.trim();
    if (!name || !mail) { alert('Completa al menos Nombre y Correo'); return; }
    alert('¡Cupón canjeado! (demo)');
    panel.classList.add('hidden');
  });

  updateStatus();
}

// Loop principal
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());

  // Movimiento con aceleración/freno (suavizado)
  const j = joystick.value;
  const fwd   = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const desired = fwd.multiplyScalar(j.y).add(right.multiplyScalar(j.x)).multiplyScalar(player.speed);

  const accel = 22;
  player.vel.x += (desired.x - player.vel.x) * Math.min(1, accel*dt);
  player.vel.z += (desired.z - player.vel.z) * Math.min(1, accel*dt);

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y = 1.6;

  // Limitar a la sala
  player.pos.x = clamp(player.pos.x, -ROOM_HALF+1.2, ROOM_HALF-1.2);
  player.pos.z = clamp(player.pos.z, -ROOM_HALF+1.2, ROOM_HALF-1.2);

  // Enemigos persiguen suavemente
  enemies.forEach(e=>{
    const dir = player.pos.clone().setY(0).sub(e.position.clone().setY(0));
    const d = dir.length();
    if (d>0.001){
      const speed = 1.4 + Math.min(1.2, d*0.06);
      e.position.add(dir.normalize().multiplyScalar(speed*dt));
    }
    e.lookAt(player.pos.x, e.position.y, player.pos.z);
  });

  // Recoger ítems
  for (let i=items.length-1;i>=0;i--){
    if (items[i].position.distanceTo(player.pos) < 1.6){
      const name = items[i].userData.name;
      sfx.pickup.currentTime = 0; sfx.pickup.play();
      scene.remove(items[i]); items.splice(i,1);
      player.collected++; updateStatus(`Recogido: ${name}`);
    }
  }

  // Abrir puerta cuando tienes todos
  if (!hasOpened && player.collected >= ITEM_NAMES.length){
    hasOpened = true;
    sfx.door.currentTime = 0; sfx.door.play();
    // animación de subida
    const t0 = performance.now(); const startY = door.position.y; const targetY = 10;
    (function lift(){
      const k = Math.min(1, (performance.now()-t0)/600);
      door.position.y = startY + (targetY-startY)*k;
      if (k<1) requestAnimationFrame(lift);
      else setTimeout(()=>panel.classList.remove('hidden'), 200);
    })();
  }

  // Cámara
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0, 'ZYX');

  renderer.render(scene, camera);
}

function shoot(){
  sfx.shoot.currentTime = 0; sfx.shoot.play();

  debugRay.visible = true; setTimeout(()=>debugRay.visible=false, 70);

  const ray = new THREE.Raycaster(camera.position, getForward(), 0, 60);
  const hits = ray.intersectObjects(enemyGroup.children, false);
  if (hits.length){
    const e = hits[0].object;
    spawnSpark(hits[0].point);
    enemyGroup.remove(e);
    enemies = enemies.filter(x => x !== e);
  }
}

function onPointerDown(e){
  if (e.clientX > window.innerWidth*0.35){
    lookPointer = e.pointerId; lastPt = {x:e.clientX,y:e.clientY};
  }
}
function onPointerMove(e){
  if (e.pointerId !== lookPointer) return;
  const dx = e.clientX - lastPt.x, dy = e.clientY - lastPt.y;
  lastPt = {x:e.clientX, y:e.clientY};
  const sens = 0.0020;
  player.yaw   -= dx * sens;
  player.pitch  = clamp(player.pitch - dy * sens, -1.2, 1.2);
}
function onPointerUp(e){ if (e.pointerId === lookPointer) lookPointer = null; }

function getForward(){
  const f = new THREE.Vector3(0,0,-1);
  f.applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'ZYX')).normalize();
  return f;
}

function updateStatus(extra){
  statusEl.textContent = `Objetos: ${player.collected} / ${ITEM_NAMES.length}` + (extra?` — ${extra}`:'');
}

function addWall(w,h,d,x,y,z){
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(w,h,d),
    new THREE.MeshStandardMaterial({ color:0x1a1a1d, roughness:0.9, metalness:0.05 })
  );
  wall.position.set(x,y,z);
  wall.castShadow = true; wall.receiveShadow = true;
  scene.add(wall);
  return wall;
}

function resize(){
  if (!renderer) return;
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  if (camera){ camera.aspect = w/h; camera.updateProjectionMatrix(); }
}

function rand(a,b){ return a + Math.random()*(b-a); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

// ---- efecto chispa / impacto ----
function spawnSpark(at) {
  const count = 20;
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = [];
  for (let i=0;i<count;i++){
    pos[i*3+0] = at.x;
    pos[i*3+1] = at.y;
    pos[i*3+2] = at.z;
    const v = new THREE.Vector3((Math.random()*2-1),(Math.random()*2-1),(Math.random()*-0.3))
      .normalize().multiplyScalar(3+Math.random()*2);
    vel.push(v);
  }
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color:0x77ffff, size:0.06, transparent:true, opacity:1 });
  const pts = new THREE.Points(geom, mat);
  scene.add(pts);

  const t0 = performance.now(), life = 350;
  (function tick(){
    const t = performance.now() - t0;
    const p = pts.geometry.attributes.position;
    for (let i=0;i<count;i++){
      const v = vel[i];
      p.array[i*3+0] += v.x * 0.016;
      p.array[i*3+1] += v.y * 0.016 - 0.015*t*0.001; // gravedad suave
      p.array[i*3+2] += v.z * 0.016;
    }
    p.needsUpdate = true;
    pts.material.opacity = 1 - (t/life);
    if (t < life) requestAnimationFrame(tick);
    else { scene.remove(pts); pts.geometry.dispose(); pts.material.dispose(); }
  })();
}
