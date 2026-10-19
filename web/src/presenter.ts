// Widok prezentera (osobne okno: ?presenter=1): notatki, następny slajd, timer.
// Synchronizacja z oknem prezentacji przez BroadcastChannel.
import type { PlayerState } from './player';

export const CHANNEL = 'slides-sync';

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

export function startPresenterView(root: HTMLElement) {
  const ch = new BroadcastChannel(CHANNEL);
  const t0 = Date.now();
  root.innerHTML = `
    <div class="presenter">
      <header><span id="pos"></span><span id="timer">00:00</span></header>
      <section><h2 id="title"></h2><div id="notes" class="notes"></div></section>
      <section class="next"><h3>Następny</h3><div id="next-title"></div><div id="next-notes" class="notes"></div></section>
      <footer><button id="prev">←</button><button id="nextbtn">→</button></footer>
    </div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>('#' + id)!;
  let cur = 0;
  const render = (s: PlayerState) => {
    cur = s.step;
    $('pos').textContent = `slajd ${s.slide + 1}/${s.slides} · krok ${s.stepInSlide + 1}/${s.stepsInSlide}`;
    $('title').textContent = s.title;
    $('notes').innerHTML = s.notes.length ? s.notes.map((n) => `<p>${esc(n)}</p>`).join('') : '<p class="dim">(brak notatek)</p>';
    $('next-title').textContent = s.nextTitle ?? '(koniec)';
    $('next-notes').innerHTML = s.nextNotes.map((n) => `<p>${esc(n)}</p>`).join('');
  };
  ch.onmessage = (e) => e.data?.type === 'state' && render(e.data.state);
  const cmd = (step: number) => ch.postMessage({ type: 'cmd', step });
  $('prev').onclick = () => cmd(cur - 1);
  $('nextbtn').onclick = () => cmd(cur + 1);
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') cmd(cur + 1);
    if (e.key === 'ArrowLeft') cmd(cur - 1);
  });
  setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    $('timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
  ch.postMessage({ type: 'hello' });
}
