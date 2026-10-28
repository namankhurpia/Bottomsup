// F1-style start lights for the race countdown: 3 -> red, 2 -> red, 1 -> orange, GO -> all green.
// Each step beeps; GO plays a higher, longer tone. Driven by the countdown number (3, 2, 1, 0).

const STEPS = { 3: ['red', 'off', 'off'], 2: ['red', 'red', 'off'], 1: ['red', 'red', 'orange'], 0: ['green', 'green', 'green'] };

export function createStartLights({ audio }) {
  const el = document.createElement('div');
  el.className = 'start-lights';
  el.setAttribute('aria-hidden', 'true');
  const pods = [0, 1, 2].map(() => {
    const pod = document.createElement('div');
    pod.className = 'pod';
    // two lamps per pod, like the real gantry
    pod.innerHTML = '<i></i><i></i>';
    el.append(pod);
    return pod;
  });
  const count = document.createElement('div');
  count.className = 'count';
  el.append(count);
  document.getElementById('hud').append(el);

  let shown = null;
  let hideTimer = 0;

  // n = 3, 2, 1 (counting down) or 0 (GO)
  function set(n) {
    if (n === shown) return;
    shown = n;
    clearTimeout(hideTimer);
    el.classList.add('show');
    el.classList.toggle('go', n === 0);
    STEPS[n].forEach((state, i) => (pods[i].dataset.state = state));
    count.textContent = n === 0 ? 'GO!' : String(n);
    if (n === 0) {
      audio.startGo();
      hideTimer = setTimeout(hide, 1100);
    } else {
      audio.startBeep();
    }
  }

  function hide() {
    clearTimeout(hideTimer);
    shown = null;
    el.classList.remove('show', 'go');
  }

  return { set, hide };
}
