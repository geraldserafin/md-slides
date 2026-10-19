// Przegląd slajdów (klawisz `o`): siatka miniatur. Każda miniatura to prawdziwy
// Player w pełnowymiarowej ramce, przeskalowany transformem (stan końcowy slajdu).
import type { Deck } from './deck';
import { Player } from './player';
import type { Step } from './steps';

export interface Overview {
  close(): void;
  readonly closed: boolean;
}

export function openOverview(deck: Deck, steps: Step[], currentSlide: number, pick: (step: number) => void): Overview {
  const el = document.createElement('div');
  el.className = 'overview';
  const grid = document.createElement('div');
  grid.className = 'overview-grid';
  el.append(grid);
  document.body.append(el);

  const THUMB_W = 300;
  const scale = THUMB_W / innerWidth;
  const players: Player[] = [];
  const cells: HTMLElement[] = [];

  deck.slides.forEach((slide, si) => {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.title = slide.title;
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.style.cssText = `width:${THUMB_W}px;height:${innerHeight * scale}px`;
    const frame = document.createElement('div');
    frame.className = 'frame';
    frame.style.cssText = `width:${innerWidth}px;height:${innerHeight}px;transform:scale(${scale})`;
    thumb.append(frame);
    const label = document.createElement('span');
    label.textContent = `${si + 1}. ${slide.title}`;
    cell.append(thumb, label);
    const first = steps.findIndex((s) => s.slide === si);
    const own = steps.map((s, i) => ({ s, i })).filter((x) => x.s.slide === si);
    const last = (own.filter((x) => x.s.root).pop() ?? own[own.length - 1]).i;
    cell.onclick = (e) => { e.stopPropagation(); close(); pick(first); };
    grid.append(cell);
    cells.push(cell);
    const p = new Player(frame, deck, steps);
    players.push(p);
    void p.start(last);
  });

  let sel = currentSlide;
  const mark = () => {
    cells.forEach((c, i) => c.classList.toggle('sel', i === sel));
    cells[sel]?.scrollIntoView({ block: 'nearest' });
  };
  mark();

  const cols = () => getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const onKey = (e: KeyboardEvent) => {
    const move = (d: number) => { sel = Math.max(0, Math.min(cells.length - 1, sel + d)); mark(); };
    switch (e.key) {
      case 'ArrowRight': move(1); break;
      case 'ArrowLeft': move(-1); break;
      case 'ArrowDown': move(cols()); break;
      case 'ArrowUp': move(-cols()); break;
      case 'Enter': cells[sel].click(); break;
      case 'Escape': case 'o': close(); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  addEventListener('keydown', onKey, true);

  let closed = false;
  el.onclick = (e) => { e.stopPropagation(); close(); };

  function close() {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', onKey, true);
    players.forEach((p) => p.destroy());
    el.remove();
  }
  return { close, get closed() { return closed; } };
}
