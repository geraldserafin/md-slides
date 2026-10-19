// Slide drawer (`o` key or the corner button): a side panel with a live thumbnail of every slide, like
// PowerPoint's slide sorter pane. It pushes the slide aside and stays open while you present: the current
// slide is highlighted and clicking a thumbnail jumps there. Each thumbnail is a real Player in a full-size
// frame, scaled with a transform. The drawer is built once in the background (one thumbnail at a time while
// the browser is idle) and only slides in and out afterwards, so opening it never waits for anything.
import type { Deck } from './deck';
import { Player } from './player';
import type { Step } from './steps';

export interface Overview {
  open(): void;
  close(): void;
  toggle(): void;
  setCurrent(slide: number): void;
  destroy(): void;
  readonly isOpen: boolean;
}

const THUMB_W = 280;

export function createOverview(deck: Deck, steps: Step[], currentSlide: number, pick: (step: number) => void): Overview {
  const el = document.createElement('aside');
  el.className = 'drawer';
  const list = document.createElement('div');
  list.className = 'drawer-list';
  el.append(list);
  document.body.append(el);

  const players: Player[] = [];
  const cells: HTMLElement[] = [];
  let timer: number | undefined;
  let dead = false;
  let sel = -1;
  let isOpen = false;

  const build = () => {
    list.replaceChildren();
    cells.length = 0;
    players.splice(0).forEach((p) => p.destroy());
    const scale = THUMB_W / innerWidth;
    deck.slides.forEach((slide, si) => {
      const cell = document.createElement('button');
      cell.className = 'dcell';
      cell.title = slide.title;
      cell.innerHTML = `<span class="num">${si + 1}</span>
        <span class="thumb" style="width:${THUMB_W}px;height:${innerHeight * scale}px">
          <span class="frame" style="width:${innerWidth}px;height:${innerHeight}px;transform:scale(${scale})"></span>
        </span>`;
      cell.onclick = (e) => { e.stopPropagation(); pick(steps.findIndex((s) => s.slide === si)); };
      list.append(cell);
      cells.push(cell);
    });
    cells[sel]?.classList.add('sel');
    schedule();
  };

  // thumbnails are rendered one per idle slice, the current slide's neighbourhood first
  const order = () => {
    const n = deck.slides.length;
    return [...Array(n).keys()].sort((a, b) => Math.abs(a - sel) - Math.abs(b - sel));
  };
  let queue: number[] = [];
  const schedule = () => {
    queue = order();
    clearTimeout(timer);
    timer = window.setTimeout(step, 300);
  };
  const step = () => {
    if (dead) return;
    const si = queue.shift();
    if (si === undefined) return;
    const frame = cells[si]?.querySelector<HTMLElement>('.frame');
    if (frame && !frame.hasChildNodes()) {
      const last = steps.map((s, i) => ({ s, i })).filter((x) => x.s.slide === si).pop()!.i; // everything revealed
      const p = new Player(frame, deck, steps);
      players.push(p);
      void p.start(last);
    }
    timer = window.setTimeout(step, 60);
  };

  const setCurrent = (i: number) => {
    if (i === sel) return;
    cells[sel]?.classList.remove('sel');
    const first = sel < 0;
    sel = i;
    cells[sel]?.classList.add('sel');
    cells[sel]?.scrollIntoView({ block: first || !isOpen ? 'center' : 'nearest', behavior: first || !isOpen ? 'instant' : 'smooth' });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  addEventListener('keydown', onKey, true);
  el.addEventListener('click', (e) => e.stopPropagation());
  let rt: number | undefined;
  const onResize = () => { clearTimeout(rt); rt = window.setTimeout(build, 400); };
  addEventListener('resize', onResize);

  function open() {
    if (isOpen) return;
    isOpen = true;
    cells[sel]?.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.classList.add('open');
    document.body.classList.add('drawer-open');
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove('open');
    document.body.classList.remove('drawer-open');
  }
  function destroy() {
    dead = true;
    clearTimeout(timer);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    players.forEach((p) => p.destroy());
    el.remove();
  }

  sel = currentSlide;
  build();
  return { open, close, toggle: () => (isOpen ? close() : open()), setCurrent, destroy, get isOpen() { return isOpen; } };
}
