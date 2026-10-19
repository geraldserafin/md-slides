// Tryb do druku / eksportu PDF (?print=slides|steps): jedna strona 1280x720 na
// slajd (stan końcowy) albo na krok. Drukuj z przeglądarki albo `npm run pdf`.
import type { Deck } from './deck';
import { Player } from './player';
import type { Step } from './steps';

export async function startPrintView(root: HTMLElement, deck: Deck, steps: Step[], mode: string) {
  document.body.classList.add('print-mode');
  root.innerHTML = '<div class="print-bar"><button id="do-print">Drukuj / zapisz PDF</button></div>';
  const indices = mode === 'steps'
    ? steps.map((_, i) => i)
    : deck.slides.map((_, si) => {
        const own = steps.map((s, i) => ({ s, i })).filter((x) => x.s.slide === si);
        return (own.filter((x) => x.s.root).pop() ?? own[own.length - 1]).i;
      });
  const players: Promise<void>[] = [];
  for (const i of indices) {
    const page = document.createElement('div');
    page.className = 'print-page';
    root.append(page);
    players.push(new Player(page, deck, steps).start(i));
  }
  await Promise.all(players);
  // obrazki mogą się jeszcze ładować
  await Promise.all([...document.images].map((im) => im.decode().catch(() => undefined)));
  await new Promise((r) => setTimeout(r, 200));
  root.querySelector<HTMLButtonElement>('#do-print')!.onclick = () => print();
  (window as unknown as { __printReady?: boolean }).__printReady = true;
}
