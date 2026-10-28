// On-screen controls for phones and tablets: a left/right joystick (like A / D: walk around
// your slice of the rim) and a fart button. Each control follows its own finger, so you can
// walk and fart at the same time. Anything that interrupts a touch releases everything,
// otherwise a lost finger could keep farting forever.

export function createTouchControls(input) {
  const touch = { walk: 0, fart: false }; // walk: -1 (screen left) .. 1 (screen right)
  input.state.touch = touch;

  const root = document.createElement('div');
  root.className = 'touch-controls';
  root.innerHTML = `
    <div class="stick" aria-label="Walk left or right"><div class="stick-track"></div><div class="knob"></div></div>
    <button class="fart-btn" aria-label="Fart">FART</button>`;
  document.getElementById('hud').append(root);
  const stick = root.querySelector('.stick');
  const knob = root.querySelector('.knob');
  const fartBtn = root.querySelector('.fart-btn');

  // --- joystick: only the horizontal part matters
  let stickId = null;
  let centreX = 0;
  const RANGE = 44; // px of travel for full speed

  function stickTo(clientX) {
    const dx = Math.max(-RANGE, Math.min(RANGE, clientX - centreX));
    knob.style.transform = `translateX(${dx}px)`;
    const v = dx / RANGE;
    // left on the stick walks you left on screen, like A / the left arrow
    touch.walk = Math.abs(v) < 0.25 ? 0 : v;
  }
  function stickRelease() {
    stickId = null;
    touch.walk = 0;
    knob.style.transform = '';
    stick.classList.remove('held');
  }
  // capture keeps the finger's moves coming to us even off the control; it's a nicety, so
  // never let a failed capture stop the control from working
  const capture = (el, id) => {
    try {
      el.setPointerCapture(id);
    } catch {}
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stickId = e.pointerId;
    capture(stick, e.pointerId);
    const r = stick.getBoundingClientRect();
    centreX = r.left + r.width / 2;
    stick.classList.add('held');
    stickTo(e.clientX);
  });
  stick.addEventListener('pointermove', (e) => e.pointerId === stickId && stickTo(e.clientX));
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(ev, (e) => e.pointerId === stickId && stickRelease());
  }

  // --- fart button
  let fartId = null;
  function fartRelease() {
    fartId = null;
    touch.fart = false;
    fartBtn.classList.remove('held');
  }
  fartBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fartId = e.pointerId;
    capture(fartBtn, e.pointerId);
    touch.fart = true;
    fartBtn.classList.add('held');
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    fartBtn.addEventListener(ev, (e) => e.pointerId === fartId && fartRelease());
  }
  fartBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  // app switch, notification shade, a call coming in: let go of everything
  const releaseAll = () => {
    stickRelease();
    fartRelease();
  };
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => document.hidden && releaseAll());

  return { releaseAll };
}
