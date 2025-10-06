// joystick.js
export function createJoystick(rootEl, { dead = 0.15, smooth = 0.18 } = {}) {
  const knob = rootEl.querySelector('.knob');
  const radius = rootEl.clientWidth / 2;
  let active = false, raw = { x: 0, y: 0 }, out = { x: 0, y: 0 };

  const clampCircle = (dx, dy) => {
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx = dx / len * radius; dy = dy / len * radius; }
    return { dx, dy };
  };

  const setKnob = (dx, dy) => {
    const { dx: cx, dy: cy } = clampCircle(dx, dy);
    knob.style.transform = `translate(${cx}px,${cy}px)`;
    raw.x = cx / radius; raw.y = cy / radius;
  };

  const reset = () => { knob.style.transform = `translate(0,0)`; raw = { x: 0, y: 0 }; };

  const pos = (e) => e.touches?.[0]
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
    : { x: e.clientX, y: e.clientY };

  const onDown = (e) => { active = true; onMove(e); };
  const onMove = (e) => {
    if (!active) return;
    const p = pos(e), r = rootEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    setKnob(p.x - cx, p.y - cy);
  };
  const onUp = () => { active = false; reset(); };

  rootEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  rootEl.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  rootEl.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });

  // Suavizado + dead-zone
  function update() {
    // invertir Y (arriba positivo)
    const target = { x: raw.x, y: -raw.y };
    const mag = Math.hypot(target.x, target.y);
    const t = mag < dead ? { x: 0, y: 0 } : target; // deadzone
    out.x += (t.x - out.x) * smooth;
    out.y += (t.y - out.y) * smooth;
    requestAnimationFrame(update);
  }
  update();

  return { get value() { return { ...out }; } };
}
