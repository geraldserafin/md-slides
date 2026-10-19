// ```mermaid fences: diagrams drawn by Mermaid, loaded on first use (and left out of builds whose decks
// do not use it: `__USE_MERMAID__`, set by the CLI). Colors come from the slide's theme variables, and the
// diagrams are redrawn when the theme changes.
declare const __USE_MERMAID__: boolean;

interface Live { box: HTMLElement; text: string; done: () => void }

let mermaid: Promise<typeof import('mermaid').default> | undefined;
let counter = 0;
const live = new Set<Live>();

const load = () => (mermaid ??= import('mermaid').then((m) => m.default));

function variables(box: HTMLElement) {
  const cs = getComputedStyle(box);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const fg = v('--fg', '#333');
  const bg = v('--bg', '#fff');
  const accent = v('--accent', '#4078f2');
  const panel = v('--code-bg', '#f0f0f0');
  return {
    background: bg, mainBkg: panel, primaryColor: panel, primaryTextColor: fg, primaryBorderColor: accent,
    secondaryColor: panel, tertiaryColor: bg, lineColor: v('--muted', fg), textColor: fg, nodeTextColor: fg,
    edgeLabelBackground: bg, clusterBkg: bg, clusterBorder: v('--muted', fg), titleColor: fg,
    fontFamily: cs.fontFamily, fontSize: '16px', dropShadow: 'none',
  };
}

async function draw({ box, text, done }: Live) {
  try {
    const m = await load();
    m.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'strict', look: 'classic', htmlLabels: false, flowchart: { htmlLabels: false }, fontFamily: getComputedStyle(box).fontFamily, themeVariables: variables(box) });
    const { svg } = await m.render(`diagram-${++counter}`, text);
    box.innerHTML = svg;
    box.classList.remove('diagram-error');
  } catch (e) {
    box.classList.add('diagram-error');
    box.textContent = String((e as Error).message ?? e);
  }
  done();
}

/** draw `text` into `box`; `done` runs when the size of the box is final (to re-layout the slide) */
export function renderDiagram(box: HTMLElement, text: string, done: () => void) {
  if (!__USE_MERMAID__) {
    box.classList.add('diagram-error');
    box.textContent = 'Diagrams are not included in this build.';
    return;
  }
  const l = { box, text, done };
  live.add(l);
  void draw(l);
}

if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && __USE_MERMAID__) {
  new MutationObserver(() => {
    for (const l of [...live]) {
      if (!l.box.isConnected) live.delete(l);
      else void draw(l);
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
