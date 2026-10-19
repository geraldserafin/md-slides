// Płaska sekwencja kroków nawigacji + kanoniczne klucze tokenów śledzone przez
// CAŁĄ sekwencję (dzięki temu przejścia między sekcjami/slajdami animują się
// tym samym mechanizmem: stary kod zanika, nowy się pojawia, wspólne tokeny jadą).
import type { Deck, Section } from './deck';
import { match, type Matching, type Tree } from './gumtree';
import { layoutLeaves, type Placed } from './layout';
import { parseOne, type Lang } from './parse';

export interface Step {
  slide: number;
  section: Section;
  sectionIndex: number; // globalnie unikalny numer sekcji (do wykrywania zmiany tekstu)
  code: string;
  lang?: Lang;
  centered: boolean; // sekcja bez fence'a => blok na środku ekranu
  root?: Tree;
  layout: Placed[];
  keys: Map<number, string>; // treeId -> kanoniczny klucz
}

export async function buildSteps(deck: Deck): Promise<Step[]> {
  const steps: Step[] = [];
  let sectionIndex = 0;
  deck.slides.forEach((slide, si) => {
    for (const section of slide.sections) {
      const codes = section.codes.length ? section.codes : [''];
      for (const code of codes) {
        steps.push({
          slide: si, section, sectionIndex, code,
          lang: section.lang,
          centered: !section.hasFence,
          layout: [], keys: new Map(),
        });
      }
      sectionIndex++;
    }
  });

  for (const s of steps) {
    if (!s.lang) continue;
    s.root = await parseOne(s.lang, s.code);
    s.layout = layoutLeaves(s.code, s.root);
  }

  // matchings[i]: krok i -> i+1 (puste, jeśli któraś strona nie ma kodu albo języki różne)
  const matchings: Matching[] = steps.slice(0, -1).map((a, i) => {
    const b = steps[i + 1];
    return a.root && b.root && a.lang === b.lang ? match(a.root, b.root) : new Map();
  });

  // klucze liczone od końca: węzeł dziedziczy klucz swojego partnera z następnego kroku
  for (let i = steps.length - 1; i >= 0; i--) {
    const st = steps[i];
    if (!st.root) continue;
    const later = i < steps.length - 1 ? steps[i + 1].keys : undefined;
    const m = matchings[i];
    const collect = (t: Tree) => {
      const id2 = m?.get(t.id);
      st.keys.set(t.id, (id2 !== undefined && later?.get(id2)) || `k${i}_${t.id}`);
      t.children.forEach(collect);
    };
    collect(st.root);
  }
  return steps;
}
