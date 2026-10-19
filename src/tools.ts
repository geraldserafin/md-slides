// Presenter tools: a laser pointer (l), drawing on the slide (d, c clears, Esc leaves), a magnifier (z) and
// autoplay (a, or `autoplay` in deck.json / the URL). They live in the viewer only; nothing of them is in the slides.

/** the laser: a glowing dot on the pointer with a short, fading tail */
export function toggleLaser(): boolean {
  const on = document.body.classList.toggle('laser');
  if (!on) { laser?.stop(); laser = undefined; return false; }
  laser = startLaser();
  return true;
}
let laser: { stop(): void } | undefined;

function startLaser() {
  const dots = Array.from({ length: 7 }, (_, i) => {
    const d = document.createElement('div');
    d.className = 'laser-dot';
    d.style.opacity = String(1 - i * 0.13);
    d.style.scale = String(1 - i * 0.1);
    document.body.append(d);
    return { el: d, x: -100, y: -100 };
  });
  let tx = -100;
  let ty = -100;
  let raf = 0;
  const move = (e: PointerEvent) => { tx = e.clientX; ty = e.clientY; };
  const tick = () => {
    dots.forEach((d, i) => {
      const [px, py] = i === 0 ? [tx, ty] : [dots[i - 1].x, dots[i - 1].y];
      d.x += (px - d.x) * (i === 0 ? 0.6 : 0.4);
      d.y += (py - d.y) * (i === 0 ? 0.6 : 0.4);
      d.el.style.transform = `translate(${d.x}px, ${d.y}px) translate(-50%, -50%)`;
    });
    raf = requestAnimationFrame(tick);
  };
  addEventListener('pointermove', move);
  tick();
  return { stop() { cancelAnimationFrame(raf); removeEventListener('pointermove', move); dots.forEach((d) => d.el.remove()); } };
}

/** freehand drawing over the slide; returns the controller (null while off) */
let draw: { clear(): void; stop(): void } | undefined;
export const drawing = () => !!draw;

export function toggleDraw(): boolean {
  if (draw) { draw.stop(); draw = undefined; return false; }
  const cv = document.createElement('canvas');
  cv.className = 'draw-layer';
  const fit = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; };
  fit();
  document.body.append(cv);
  document.body.classList.add('drawing');
  const ctx = cv.getContext('2d')!;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let last: { x: number; y: number } | undefined;
  const pos = (e: PointerEvent) => ({ x: e.clientX * devicePixelRatio, y: e.clientY * devicePixelRatio });
  cv.onpointerdown = (e) => { e.stopPropagation(); cv.setPointerCapture(e.pointerId); last = pos(e); };
  cv.onpointermove = (e) => {
    if (!last) return;
    const p = pos(e);
    ctx.strokeStyle = '#ff4d4f';
    ctx.lineWidth = 4 * devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  };
  cv.onpointerup = (e) => { e.stopPropagation(); last = undefined; };
  cv.onclick = (e) => e.stopPropagation();
  addEventListener('resize', fit);
  draw = {
    clear: () => ctx.clearRect(0, 0, cv.width, cv.height),
    stop() { removeEventListener('resize', fit); cv.remove(); document.body.classList.remove('drawing'); },
  };
  return true;
}
export const clearDrawing = () => draw?.clear();

/** the magnifier: the slide at 2x around the pointer */
export function toggleZoom(app: HTMLElement): boolean {
  if (zoomOff) { zoomOff(); return false; }
  const move = (e: PointerEvent) => { app.style.transformOrigin = `${e.clientX}px ${e.clientY}px`; };
  app.style.transition = 'none';
  app.style.transform = 'scale(2)';
  app.style.transformOrigin = '50% 50%';
  addEventListener('pointermove', move);
  document.body.classList.add('zoomed');
  zoomOff = () => {
    removeEventListener('pointermove', move);
    app.style.transform = '';
    app.style.transformOrigin = '';
    app.style.transition = '';
    document.body.classList.remove('zoomed');
    zoomOff = undefined;
  };
  return true;
}
let zoomOff: (() => void) | undefined;

/** advance by itself every `seconds` (a step per tick); any key or click from the presenter stops it. Returns a stop function. */
export function startAutoplay(next: () => boolean, seconds: () => number): () => void {
  let timer: number | undefined;
  let alive = true;
  const tick = () => {
    if (!alive) return;
    if (next()) timer = window.setTimeout(tick, seconds() * 1000);
  };
  timer = window.setTimeout(tick, seconds() * 1000);
  return () => { alive = false; clearTimeout(timer); };
}
