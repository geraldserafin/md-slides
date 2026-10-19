## Deck-wide defaults

`defaults` in `deck.json` is front matter applied to **every** slide. A slide's own front matter wins.

````jsonc
"defaults": {
  "align": "left",
  "heading-align": "left",
  "heading-size": "56",
  "spacing": "18"
}
````

Together with `themes`, `vars`, `header`/`footer` and `css` it is enough to build a house style once and
reuse it for every deck of a school or company.

<!-- Defaults accept any key a slide accepts: layout, theme, background, transition, --variables. -->
