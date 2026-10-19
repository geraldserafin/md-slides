// Slide drawer (`o` key or the corner button): a side panel with a live thumbnail of every slide, like
// PowerPoint's slide sorter pane. It stays open while you present: the current slide is highlighted
// and clicking a thumbnail jumps there. Each thumbnail is a real Player in a full-size frame,
// scaled with a transform and created lazily when it scrolls into view.
import type { Deck } from './deck';
import { Player } from './player';
import type { Step } from './steps';

export interface Overview {
  close(): void;
  setCurrent(slide: number): void;
  readonly closed: boolean;
}

const THUMB_W = 176;

export function openOverview(deck: Deck, steps: Step[], currentSlide: number, pick: (step: number) => void): Overview {
  const el = document.createElement('aside');
  el.className = 'drawer';
  el.innerHTML = `<div class="drawer-head"><span>Slides</span><button class="drawer-close" title="Close (o)">✕</button></div><div class="drawer-list"></div>`;
  const list = el.querySelector<HTMLElement>('.drawer-list')!;
  document.body.append(el);

  const scale = THUMB_W / innerWidth;
  const players = new Map<number, Player>();
  const cells: HTMLElement[] = [];

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const si = cells.indexOf(e.target as HTMLElement);
      if (si < 0 || players.has(si)) continue;
      const own = steps.map((s, i) => ({ s, i })).filter((x) => x.s.slide === si);
      const last = (own.filter((x) => x.s.root).pop() ?? own[own.length - 1]).i;
      const frame = e.target.querySelector<HTMLElement>('.frame')!;
      const p = new Player(frame, deck, steps);
      players.set(si, p);
      void p.start(last);
    }
  }, { root: list, rootMargin: '200px' });

  deck.slides.forEach((slide, si) => {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.title = slide.title;
    cell.innerHTML = `<span class="num">${si + 1}</span>
      <span class="thumb" style="width:${THUMB_W}px;height:${innerHeight * scale}px">
        <span class="frame" style="width:${innerWidth}px;height:${innerHeight}px;transform:scale(${scale})"></span>
      </span>`;
    const first = steps.findIndex((s) => s.slide === si);
    cell.onclick = (e) => { e.stopPropagation(); pick(first); };
    list.append(cell);
    cells.push(cell);
    io.observe(cell);
  });

  let sel = -1;
  const setCurrent = (i: number) => {
    if (i === sel) return;
    sel = i;
    cells.forEach((c, k) => c.classList.toggle('sel', k === sel));
    cells[sel]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  setCurrent(currentSlide);

  let closed = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  addEventListener('keydown', onKey, true);
  el.addEventListener('click', (e) => e.stopPropagation());
  el.querySelector<HTMLElement>('.drawer-close')!.onclick = () => close();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));

  function close() {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', onKey, true);
    io.disconnect();
    el.classList.remove('open');
    setTimeout(() => {
      players.forEach((p) => p.destroy());
      el.remove();
    }, 300);
  }
  return { close, setCurrent, get closed() { return closed; } };
}
