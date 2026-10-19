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
  const cv = document.createElement('canvas');
  cv.className = 'laser-layer';
  const dot = document.createElement('div');
  dot.className = 'laser-dot';
  document.body.append(cv, dot);
  const ctx = cv.getContext('2d')!;
  const fit = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; };
  fit();
  const TAIL_MS = 380;
  let pts: { x: number; y: number; t: number }[] = [];
  let raf = 0;
  const move = (e: PointerEvent) => {
    pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    dot.style.opacity = '1';
  };
  const leave = () => { dot.style.opacity = '0'; };
  const tick = (now: number) => {
    pts = pts.filter((p) => now - p.t < TAIL_MS);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ff3b30';
    ctx.shadowBlur = 10 * devicePixelRatio;
    for (let i = 1; i < pts.length; i++) {
      const life = 1 - (now - pts[i].t) / TAIL_MS;
      ctx.strokeStyle = `rgba(255, 59, 48, ${0.75 * life})`;
      ctx.lineWidth = 9 * life * devicePixelRatio;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x * devicePixelRatio, pts[i - 1].y * devicePixelRatio);
      ctx.lineTo(pts[i].x * devicePixelRatio, pts[i].y * devicePixelRatio);
      ctx.stroke();
    }
    raf = requestAnimationFrame(tick);
  };
  addEventListener('pointermove', move);
  addEventListener('resize', fit);
  document.documentElement.addEventListener('pointerleave', leave);
  raf = requestAnimationFrame(tick);
  return {
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move);
      removeEventListener('resize', fit);
      document.documentElement.removeEventListener('pointerleave', leave);
      cv.remove();
      dot.remove();
    },
  };
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
