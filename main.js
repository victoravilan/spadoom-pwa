import { createJoystick } from './joystick.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const fireBtn = document.getElementById('fireBtn');
const panel = document.getElementById('formPanel');
const redeemBtn = document.getElementById('redeem');

let scene, camera, renderer, clock;
let player = { pos:new THREE.Vector3(0,1.6,6), yaw:0, pitch:0, speed:6, collected:0, ammo:999 };
let joystick, lookTouchId = null, lastTouch = null;
let enemies = [], items = [], door, hasOpened = false;

const ITEM_NAMES = [
  "Botella de aceite","Exfoliante Ayurveda","Dos toallas",
  "Bata para masaje","Altavoz","Cobija","Tapa ojos"
];

init(); animate();

function init(){
  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  resize(); window.addEventListener('resize', resize);

  // Scene & Camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  camera = new THREE.PerspectiveCamera(60, canvas.clientWidth/canvas.clientHeight, 0.1, 1000);
  camera.position.copy(player.pos);

  clock = new THREE.Clock();

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(5,8,3); scene.add(dir);

  // Floor (big)
  const floorGeo = new THREE.PlaneGeometry(80,80);
  const floorMat = new THREE.MeshStandardMaterial({ color:0x303030, roughness:1, metalness:0 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI/2;
  scene.add(floor);

  // Walls (simple box room)
  const wallMat = new THREE.MeshStandardMaterial({ color:0x222222 });
  const makeWall = (w,h,d,x,y,z)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), wallMat); m.position.set(x,y,z); scene.add(m); return m; };
  makeWall(80,6,1, 0,3,-40); // back
  makeWall(80,6,1, 0,3, 40); // front (door gap later)
  makeWall(1,6,80, -40,3,0); // left
  makeWall(1,6,80, 40,3,0); // right

  // Door (front center)
  door = new THREE.Mesh(new THREE.BoxGeometry(6,6,1), new THREE.MeshStandardMaterial({color:0x444488}));
  door.position.set(0,3,39.5); scene.add(door);

  // Enemies (red cubes)
  const enemyMat = new THREE.MeshStandardMaterial({ color:0xaa3333 });
  for (let i=0;i<5;i++){
    const e = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), enemyMat);
    e.position.set(rand(-20,20), 0.5, rand(-20,20));
    scene.add(e); enemies.push(e);
  }

  // Items (glowing spheres)
  const itemMat = new THREE.MeshStandardMaterial({ color:0x00ffaa, emissive:0x004433, emissiveIntensity:1 });
  for (let i=0;i<ITEM_NAMES.length;i++){
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), itemMat.clone());
    s.position.set(rand(-30,30), 0.5, rand(-25,25));
    s.userData.name = ITEM_NAMES[i];
    scene.add(s); items.push(s);
  }

  // Controls
  joystick = createJoystick(document.getElementById('stick'));
  fireBtn.addEventListener('click', () => shoot());
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);

  // Form
  redeemBtn.addEventListener('click', () => {
    const name = document.getElementById('name').value.trim();
    const mail = document.getElementById('mail').value.trim();
    if(!name || !mail){ alert('Completa al menos Nombre y Correo'); return; }
    alert('¡Cupón canjeado! (demo)');
    panel.classList.add('hidden');
  });

  updateStatus();
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());

  // Move player (joystick)
  const j = joystick.value; // x(-1..1), y(-1..1)
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw) );
  const right   = new THREE.Vector3(Math.cos(player.yaw), 0,-Math.sin(player.yaw) );
  const vel = forward.clone().multiplyScalar(j.y).add(right.clone().multiplyScalar(j.x)).multiplyScalar(player.speed*dt);
  player.pos.add(vel);

  // Simple enemy chase
  enemies.forEach(e=>{
    const dir = player.pos.clone().setY(0).sub(e.position.clone().setY(0));
    if (dir.length()>0.001) e.position.add(dir.normalize().multiplyScalar(1.5*dt));
  });

  // Collect items
  for (let i=items.length-1;i>=0;i--){
    if (items[i].position.distanceTo(player.pos) < 1.2){
      const name = items[i].userData.name;
      scene.remove(items[i]); items.splice(i,1);
      player.collected++; updateStatus(`Recogido: ${name}`);
    }
  }

  // Open door when all collected
  if (!hasOpened && player.collected >= ITEM_NAMES.length){
    hasOpened = true;
    // "abre" moviendo puerta hacia arriba
    door.position.y = 9;
    setTimeout(()=> panel.classList.remove('hidden'), 600); // muestra formulario
  }

  // Camera
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0, 'ZYX');

  renderer.render(scene, camera);
}

function shoot(){
  if (player.ammo<=0) return;
  // Raycast from camera
  const ray = new THREE.Raycaster(camera.position, getForward(), 0, 40);
  const hits = ray.intersectObjects(enemies);
  if (hits.length){
    const e = hits[0].object;
    scene.remove(e);
    enemies = enemies.filter(x=>x!==e);
  }
  player.ammo--;
}

function getForward(){
  const f = new THREE.Vector3(0,0,-1);
  f.applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'ZYX')).normalize();
  return f;
}

function onPointerDown(e){
  // mirar con arrastre en la mitad derecha
  if (e.clientX > window.innerWidth*0.35){
    lookTouchId = e.pointerId; lastTouch = {x:e.clientX,y:e.clientY};
  }
}
function onPointerMove(e){
  if (e.pointerId !== lookTouchId) return;
  const dx = e.clientX - lastTouch.x;
  const dy = e.clientY - lastTouch.y;
  lastTouch = {x:e.clientX,y:e.clientY};
  const sens = 0.0022;
  player.yaw   -= dx * sens;
  player.pitch -= dy * sens;
  const lim = 1.3; // ~75°
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
}
function onPointerUp(e){
  if (e.pointerId === lookTouchId) lookTouchId = null;
}

function updateStatus(extra){
  statusEl.textContent = `Objetos: ${player.collected} / ${ITEM_NAMES.length}` + (extra?` — ${extra}`:'');
}

function resize(){
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w,h,false);
  if (camera){ camera.aspect = w/h; camera.updateProjectionMatrix(); }
}

function rand(a,b){ return a + Math.random()*(b-a); }
