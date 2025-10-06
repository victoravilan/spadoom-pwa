// main.js
import { createJoystick } from './joystick.js';

const canvas   = document.getElementById('game');
const statusEl = document.getElementById('status');
const fireBtn  = document.getElementById('fireBtn');
const panel    = document.getElementById('formPanel');
const redeemBtn= document.getElementById('redeem');

let renderer, scene, camera, clock;
const ROOM_HALF = 38;             // límites de la sala
const player = {
  pos: new THREE.Vector3(0, 1.6, 6),
  yaw: 0, pitch: 0,
  speed: 7,                       // velocidad máxima
  vel: new THREE.Vector3(),       // velocidad actual (suavizada)
  collected: 0, ammo: 999
};
let joystick, lookPointer=null, lastPt=null;
let enemies=[], enemyGroup, items=[], door, hasOpened=false, debugRay;

const ITEM_NAMES = [
  "Botella de aceite","Exfoliante Ayurveda","Dos toallas",
  "Bata para masaje","Altavoz","Cobija","Tapa ojos"
];

init();
animate();

function init(){
  // Escena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d0f);
  scene.fog = new THREE.Fog(0x0d0d0f, 40, 120);

  // Cámara
  camera = new THREE.PerspectiveCamera(60, 16/9, 0.1, 1000);
  camera.position.copy(player.pos);

  // Renderer + sombras
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  window.addEventListener('resize', resize);
  resize();

  clock = new THREE.Clock();

  // Luces
  const amb = new THREE.AmbientLight(0xffffff, 0.35); scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(10,16,6); dir.castShadow = true;
  dir.shadow.mapSize.set(1024,1024);
  dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 80;
  scene.add(dir);

  // Piso
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2*ROOM_HALF, 2*ROOM_HALF),
    new THREE.MeshStandardMaterial({ color:0x2e2e30, roughness:0.95 })
  );
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Paredes
  const wallMat = new THREE.MeshStandardMaterial({ color:0x1a1a1d, roughness:0.9, metalness:0.05 });
  addWall(2*ROOM_HALF, 6, 1,   0, 3, -ROOM_HALF);  // back
  addWall(1, 6, 2*ROOM_HALF,  -ROOM_HALF, 3, 0);   // left
  addWall(1, 6, 2*ROOM_HALF,   ROOM_HALF, 3, 0);   // right
  addWall(2*ROOM_HALF, 6, 1,   0, 3,  ROOM_HALF);  // front

  // Puerta (en el frente: z ~ ROOM_HALF)
  door = new THREE.Mesh(
    new THREE.BoxGeometry(6,6,1),
    new THREE.MeshStandardMaterial({ color:0x4952a6, metalness:0.2, roughness:0.4 })
  );
  door.position.set(0,3, ROOM_HALF - 0.5);
  door.castShadow = true; door.receiveShadow = true;
  scene.add(door);

  // Enemigos (cápsulas con brillo suave)
  enemyGroup = new THREE.Group(); scene.add(enemyGroup);
  const enemyMat = new THREE.MeshStandardMaterial({ color:0x9b2c2c, emissive:0x330909, emissiveIntensity:0.4, roughness:0.6, metalness:0.1 });
  for (let i=0;i<6;i++){
    const geo = new THREE.CapsuleGeometry(0.45, 0.8, 6, 12);
    const e = new THREE.Mesh(geo, enemyMat.clone());
    e.castShadow = true; e.receiveShadow = true;
    e.position.set(rand(-20,20), 0.9, rand(-20,20));
    enemyGroup.add(e); enemies.push(e);
  }

  // Ítems (cristales icosaédricos con emisión)
  const gemMat = new THREE.MeshStandardMaterial({ color:0x00ffaa, emissive:0x0a5b48, emissiveIntensity:1.2, roughness:0.3, metalness:0.1 });
  for (let i=0;i<ITEM_NAMES.length;i++){
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), gemMat.clone());
    s.position.set(rand(-ROOM_HALF+4, ROOM_HALF-4), 0.7, rand(-ROOM_HALF+4, ROOM_HALF-4));
    s.userData.name = ITEM_NAMES[i];
    s.castShadow = true; s.receiveShadow = true;
    scene.add(s); items.push(s);
  }

  // Ray de depuración del disparo
  const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0,0,-4)]);
  debugRay = new THREE.Line(rayGeom, new THREE.LineBasicMaterial({ color:0x00ffff }));
  camera.add(debugRay); debugRay.visible = false;
  scene.add(camera);

  // Controles
  joystick = createJoystick(document.getElementById('stick'), { dead:0.18, smooth:0.2 });
  fireBtn.addEventListener('click', shoot);
  window.addEventListener('keydown', e => { if (e.code === 'Space') shoot(); });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup',   onPointerUp);

  // Form
  redeemBtn.addEventListener('click', () => {
    const name = document.getElementById('name').value.trim();
    const mail = document.getElementById('mail').value.trim();
    if (!name || !mail) { alert('Completa al menos Nombre y Correo'); return; }
    alert('¡Cupón canjeado! (demo)'); panel.classList.add('hidden');
  });

  updateStatus();
  console.log('✅ Listo: joystick suave, límites y disparo activo.');
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());

  // Vector objetivo según joystick (en espacio del jugador)
  const j = joystick.value; // [-1..1]
  const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const desired = fwd.multiplyScalar(j.y).add(right.multiplyScalar(j.x)).multiplyScalar(player.speed);

  // Aceleración + freno (suavizado de movimiento)
  const accel = 18;                    // respuesta más firme
  player.vel.x += (desired.x - player.vel.x) * Math.min(1, accel*dt);
  player.vel.z += (desired.z - player.vel.z) * Math.min(1, accel*dt);

  // Integrar y aplicar límites
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y = 1.6; // pegado al suelo

  // Clamp dentro de la sala
  player.pos.x = clamp(player.pos.x, -ROOM_HALF+1.2, ROOM_HALF-1.2);
  player.pos.z = clamp(player.pos.z, -ROOM_HALF+1.2, ROOM_HALF-1.2);

  // Enemigos persiguen (suave)
  enemies.forEach(e=>{
    const dir = player.pos.clone().setY(0).sub(e.position.clone().setY(0));
    const d = dir.length();
    if (d>0.001){
      const speed = 1.4 + Math.min(1.2, d*0.06); // un poco más rápido si está lejos
      e.position.add(dir.normalize().multiplyScalar(speed * dt));
    }
    e.lookAt(player.pos.x, e.position.y, player.pos.z);
  });

  // Recoger ítems (radio 1.6)
  for (let i=items.length-1;i>=0;i--){
    if (items[i].position.distanceTo(player.pos) < 1.6){
      const name = items[i].userData.name;
      scene.remove(items[i]); items.splice(i,1);
      player.collected++; updateStatus(`Recogido: ${name}`);
    }
  }

  // Abrir puerta
  if (!hasOpened && player.collected >= ITEM_NAMES.length){
    hasOpened = true; // subir puerta
    const t0 = performance.now();
    const startY = door.position.y, targetY = 10;
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
  // mostrar el rayo un instante
  debugRay.visible = true; setTimeout(()=>debugRay.visible=false, 70);

  // raycast contra el grupo de enemigos
  const ray = new THREE.Raycaster(camera.position, getForward(), 0, 60);
  const hits = ray.intersectObjects(enemyGroup.children, false);
  if (hits.length){
    const e = hits[0].object;
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
  lastPt = {x:e.clientX,y:e.clientY};
  const sens = 0.0020;        // un pelín más firme
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
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
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
