export function createJoystick(rootEl) {
  const knob = rootEl.querySelector('.knob');
  const center = () => ({ x: rootEl.clientWidth/2, y: rootEl.clientHeight/2 });
  const radius = rootEl.clientWidth/2;
  let active = false, value = {x:0,y:0};

  const setKnob = (dx,dy) => {
    const len = Math.hypot(dx,dy);
    if (len > radius) { dx = dx/len*radius; dy = dy/len*radius; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    value.x = dx/radius; value.y = dy/radius;
  };

  const reset = () => { knob.style.transform = `translate(0,0)`; value = {x:0,y:0}; };

  const pos = (e) => {
    if (e.touches && e.touches[0]) return { x:e.touches[0].clientX, y:e.touches[0].clientY };
    return { x:e.clientX, y:e.clientY };
  };

  const onDown = (e)=>{ active = true; onMove(e); };
  const onMove = (e)=>{
    if (!active) return;
    const p = pos(e);
    const rect = rootEl.getBoundingClientRect();
    const c = { x: rect.left + center().x, y: rect.top + center().y };
    setKnob(p.x - c.x, p.y - c.y);
  };
  const onUp = ()=>{ active = false; reset(); };

  rootEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  // iOS passive scroll prevention
  rootEl.addEventListener('touchstart', e=>e.preventDefault(), {passive:false});
  rootEl.addEventListener('touchmove', e=>e.preventDefault(), {passive:false});

  return { get value(){ return {...value}; } };
}
