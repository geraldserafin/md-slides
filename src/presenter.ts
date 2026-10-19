// Presenter view (a separate window: ?presenter=1&deck=name), laid out like PowerPoint's: a strip with the timer,
// slide counter, clock and "End show" on top; the current slide big on the left with the ← → arrows under it; on
// the right the next slide and the notes with A− A+. The previews are the viewer itself in iframes (?embed=1), so they
// look exactly like the audience window. It talks to the presentation window through a BroadcastChannel; either window
// can drive.
import type { PlayerState } from './player';

export const CHANNEL = 'slides-sync';
const FRAME_W = 1600;
const FRAME_H = 900;

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const svg = (d: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

/** a live preview: the viewer in a 1600x900 iframe, scaled to the width of its box */
function preview(box: HTMLElement, deck: string, step: number) {
  const frame = document.createElement('iframe');
  frame.src = `?deck=${encodeURIComponent(deck)}&embed=1#${step + 1}`;
  frame.style.cssText = `width:${FRAME_W}px;height:${FRAME_H}px`;
  frame.setAttribute('tabindex', '-1');
  box.append(frame);
  new ResizeObserver(() => { frame.style.transform = `scale(${box.clientWidth / FRAME_W})`; }).observe(box);
  let ready = false;
  let pending: { step: number; instant: boolean } | undefined;
  frame.onload = () => {
    ready = true;
    if (pending) frame.contentWindow?.postMessage({ type: 'go', ...pending }, '*');
  };
  return {
    go(s: number, instant: boolean) {
      pending = { step: s, instant };
      if (ready) frame.contentWindow?.postMessage({ type: 'go', ...pending }, '*');
    },
  };
}

/** size `box` as the largest 16:9 rectangle that fits its parent's free space (width: cap, optional) */
function fit16x9(box: HTMLElement, holder: HTMLElement, byHeight = true, cap = Infinity) {
  const set = () => {
    const w = Math.min(holder.clientWidth, byHeight ? holder.clientHeight * (FRAME_W / FRAME_H) : Infinity, cap);
    box.style.width = `${Math.max(0, Math.floor(w))}px`;
  };
  new ResizeObserver(set).observe(holder);
  set();
}

export function startPresenterView(root: HTMLElement, deck: string) {
  const ch = new BroadcastChannel(CHANNEL);
  root.innerHTML = `
    <div class="presenter">
      <header class="pv-top">
        <div class="pv-timer">
          <span id="timer" title="Time since the start">0:00:00</span>
          <button id="tpause" title="Pause / resume">${svg('<path d="M8 5v14M16 5v14"/>')}</button>
          <button id="treset" title="Restart the timer">${svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4.5h4.5"/>')}</button>
        </div>
        <div class="pv-where"><span id="pos"></span></div>
        <div class="pv-right"><span id="clock" title="Time of day"></span><button id="end" class="pv-end">End show</button></div>
      </header>
      <main class="pv-main">
        <section class="pv-left">
          <div class="pv-now-holder" id="now-holder"><div class="pv-screen" id="now"></div></div>
          <div class="pv-bar">
            <div class="pv-nav">
              <button id="prev" title="Previous (←)">${svg('<path d="M15 5l-7 7 7 7"/>')}</button>
              <span id="steps"></span>
              <button id="nextbtn" title="Next (→, space)">${svg('<path d="M9 5l7 7-7 7"/>')}</button>
            </div>
          </div>
        </section>
        <aside class="pv-side">
          <div class="pv-next">
            <h3>Next slide</h3>
            <div class="pv-next-holder" id="next-holder"><div class="pv-screen" id="next"></div></div>
            <div class="pv-next-title" id="next-title"></div>
          </div>
          <div class="pv-notes">
            <h3>Notes</h3>
            <div id="notes" class="notes"></div>
            <div class="pv-notes-foot"><button id="fsm" title="Smaller text">${svg('<path d="M5 17l4-10 4 10M6.4 13.5h5.2M16 12h5"/>')}</button><button id="fsp" title="Larger text">${svg('<path d="M5 17l4-10 4 10M6.4 13.5h5.2M18.5 9.5v5M16 12h5"/>')}</button></div>
          </div>
        </aside>
      </main>
    </div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>('#' + id)!;

  const now = preview($('now'), deck, 0);
  const next = preview($('next'), deck, 1);
  fit16x9($('now'), $('now-holder'));
  fit16x9($('next'), $('next-holder'), false, 460);

  let cur = 0;
  let total = 1;
  let first = true;
  const render = (s: PlayerState) => {
    cur = s.step;
    total = s.steps;
    $('pos').textContent = `Slide ${s.slide + 1} of ${s.slides}`;
    $('steps').textContent = `Slide ${s.slide + 1} of ${s.slides}${s.stepsInSlide > 1 ? ` · click ${s.stepInSlide + 1}/${s.stepsInSlide}` : ''}`;
    now.go(s.step, first);
    const last = s.step >= s.steps - 1;
    $('next').classList.toggle('end', last);
    if (!last) next.go(s.step + 1, first);
    $('next-title').textContent = last ? 'End of the presentation' : s.stepInSlide + 1 < s.stepsInSlide ? 'The next click on this slide' : s.nextTitle ?? '';
    $('notes').innerHTML = s.notes.length ? s.notes.map((n) => `<p>${esc(n)}</p>`).join('') : '<p class="dim">No notes for this slide.</p>';
    $('notes').scrollTop = 0;
    first = false;
    if (!running && elapsed === 0) toggleTimer(); // the timer starts with the first state
  };
  ch.onmessage = (e) => e.data?.type === 'state' && render(e.data.state);
  const cmd = (step: number) => ch.postMessage({ type: 'cmd', step: Math.max(0, Math.min(total - 1, step)) });
  $('prev').onclick = () => cmd(cur - 1);
  $('nextbtn').onclick = () => cmd(cur + 1);

  $('end').onclick = () => { ch.postMessage({ type: 'end' }); window.close(); };

  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') { e.preventDefault(); cmd(cur + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') { e.preventDefault(); cmd(cur - 1); }
    else if (e.key === 'Home') cmd(0);
    else if (e.key === 'End') cmd(total - 1);
    else if (e.key === '+' || e.key === '=') size(1);
    else if (e.key === '-') size(-1);
  });

  // notes size
  let fs = Number(localStorage.getItem('slides-notes-size')) || 22;
  const size = (d: number) => {
    fs = Math.min(48, Math.max(14, fs + d * 2));
    $('notes').style.fontSize = `${fs}px`;
    try { localStorage.setItem('slides-notes-size', String(fs)); } catch { /* ignore */ }
  };
  size(0);
  $('fsm').onclick = () => size(-1);
  $('fsp').onclick = () => size(1);

  // clock and timer
  let elapsed = 0;
  let running = false;
  const tick = () => {
    if (running) elapsed++;
    $('timer').textContent = hms(elapsed);
    $('clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  const toggleTimer = () => {
    running = !running;
    $('tpause').innerHTML = running ? svg('<path d="M8 5v14M16 5v14"/>') : svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>');
    $('timer').classList.toggle('paused', !running);
  };
  $('tpause').onclick = toggleTimer;
  $('treset').onclick = () => { elapsed = 0; tick(); };
  setInterval(tick, 1000);
  tick();
  $('tpause').innerHTML = svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>');
  ch.postMessage({ type: 'hello' });
}
