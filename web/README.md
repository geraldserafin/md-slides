# slides (web)

Przeglądarkowy viewer z animacją przejść kodu opartą o GumTree (diff AST).
Działa lokalnie i na GitHub Pages (`base: './'`). Dekki to foldery `.md` (jeden plik = jeden slajd).

```sh
cd web
npm install
npm run dev        # kopiuje ../slides i ../slides-monads do public/decks i startuje vite
npm run build      # statyczny build w dist/ (np. GitHub Pages; workflow w .github/workflows)
npm test           # fixture'y regresyjne (te same co test/ w Haskellu) + parity z Haskellem, jeśli jest /tmp/states
node scripts/prepare-decks.mjs ../moj-deck   # własne dekki zamiast domyślnych
```

URL: `?deck=<nazwa>`, `#<krok>` (deep link), `?theme=dark|light|paper`. Klawisze: strzałki/spacja,
`Home`/`End`, `f` pełny ekran, `t` motyw, `p` okno prezentera (notatki, timer, następny slajd), `h` pomoc.

## Markdown

- Nagłówki, akapity, listy, cytaty, `inline code` — normalny markdown.
- `<!-- komentarz -->` → notatki prezentera.
- ` ```cpp ` / `ts` / `py` / `rs` / `go` / `java` / `c` / `js` / `bash` … → animowany kod (gramatyka tree-sitter, ładowana leniwie).
  Kolejne bloki tego samego języka pod rząd = kolejne klatki animacji. Inne języki → statyczny blok.
- Opcje fence'a: ` ```cpp .left size=18 fit=none ` — `.left`/`.center`/`.right` (wyrównanie), `size=` (px, stała skala), `fit=none` (bez auto-skalowania).
- Sekcja bez kodu → tekst wyśrodkowany na ekranie (slajd tytułowy).
- Obrazek/wideo samotne w akapicie: `![alt](img.png){.left width=50%}`, `![](clip.mp4){autoplay loop muted}` (ścieżki względem pliku `.md`).

## Wygląd

Motywy to zmienne CSS (`src/style.css`: `--bg`, `--fg`, `--tok-*`, `--font-*`, `--text-size`, `--move-dur`…).
Własny wygląd decku: `deck.json` w folderze decku:

```json
{ "title": "Moja prezentacja", "theme": "light", "css": "deck.css" }
```

`deck.css` może nadpisać dowolną zmienną (`:root { --accent: #f00; }`) i dodać własne style.

## Nowy język

Dopisz tag w `TAGS` (`src/parse.ts`) i nazwę gramatyki do listy w `src/main.ts` (pliki `.wasm` z pakietu `tree-sitter-wasms`).
