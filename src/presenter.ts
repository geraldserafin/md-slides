// Presenter view (a separate window: ?presenter=1&deck=name): the current slide and the next step as live previews,
// the notes in a big readable size, a clock and a stopwatch. The previews are the viewer itself in small iframes
// (?embed=1), so they look exactly like the audience window; the window is kept in sync with the presentation
// through a BroadcastChannel, and either window can drive.
import type { PlayerState } from './player';

export const CHANNEL = 'slides-sync';
const FRAME_W = 1600;
const FRAME_H = 900;

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

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

export function startPresenterView(root: HTMLElement, deck: string) {
  const ch = new BroadcastChannel(CHANNEL);
  root.innerHTML = `
    <div class="presenter">
      <header class="pv-top">
        <div class="pv-deck"><strong></strong><span id="pos"></span></div>
        <div class="pv-time">
          <span id="clock" title="Time of day"></span>
          <span class="pv-sep"></span>
          <button id="tpause" title="Pause / resume the stopwatch">❚❚</button>
          <span id="timer" title="Stopwatch">00:00</span>
          <button id="treset" title="Reset the stopwatch">↺</button>
        </div>
      </header>
      <main class="pv-main">
        <section class="pv-now">
          <div class="pv-screen" id="now"></div>
          <div class="pv-ctl">
            <button id="prev" title="Previous (←)">←</button>
            <span id="steps"></span>
            <button id="nextbtn" title="Next (→, space)">→</button>
          </div>
        </section>
        <aside class="pv-side">
          <div class="pv-next">
            <h3>Next</h3>
            <div class="pv-screen small" id="next"></div>
            <div class="pv-next-title" id="next-title"></div>
          </div>
          <div class="pv-notes">
            <div class="pv-notes-head"><h3>Notes</h3><span><button id="fsm" title="Smaller text">A−</button><button id="fsp" title="Larger text">A+</button></span></div>
            <div id="notes" class="notes"></div>
          </div>
        </aside>
      </main>
    </div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>('#' + id)!;
  root.querySelector('.pv-deck strong')!.textContent = deck;

  const now = preview($('now'), deck, 0);
  const next = preview($('next'), deck, 1);
  let cur = 0;
  let total = 1;
  let first = true;
  const render = (s: PlayerState) => {
    cur = s.step;
    total = s.steps;
    $('pos').textContent = `slide ${s.slide + 1} / ${s.slides}`;
    $('steps').textContent = `step ${s.stepInSlide + 1} / ${s.stepsInSlide}`;
    now.go(s.step, first);
    const last = s.step >= s.steps - 1;
    $('next').classList.toggle('end', last);
    if (!last) next.go(s.step + 1, first);
    $('next-title').textContent = last ? 'End of the presentation' : s.stepInSlide + 1 < s.stepsInSlide ? 'Next click on this slide' : s.nextTitle ?? '';
    $('notes').innerHTML = s.notes.length ? s.notes.map((n) => `<p>${esc(n)}</p>`).join('') : '<p class="dim">No notes for this slide.</p>';
    $('notes').scrollTop = 0;
    first = false;
    if (!running && elapsed === 0) toggleTimer(); // the stopwatch starts with the first state
  };
  ch.onmessage = (e) => e.data?.type === 'state' && render(e.data.state);
  const cmd = (step: number) => ch.postMessage({ type: 'cmd', step: Math.max(0, Math.min(total - 1, step)) });
  $('prev').onclick = () => cmd(cur - 1);
  $('nextbtn').onclick = () => cmd(cur + 1);
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

  // clock and stopwatch
  let elapsed = 0;
  let running = false;
  const tick = () => {
    if (running) elapsed++;
    $('timer').textContent = mmss(elapsed);
    $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const toggleTimer = () => {
    running = !running;
    $('tpause').textContent = running ? '❚❚' : '▶';
    $('timer').classList.toggle('paused', !running);
  };
  $('tpause').onclick = toggleTimer;
  $('treset').onclick = () => { elapsed = 0; tick(); };
  setInterval(tick, 1000);
  tick();
  $('tpause').textContent = '▶';
  ch.postMessage({ type: 'hello' });
}
