## Deck-wide defaults

`defaults` in `deck.json` is front matter applied to **every** slide; `columns` is the same for slides that show two columns. A slide's own front matter wins.

````jsonc
"defaults": {
  "layout": "side",
  "justify": "true",
  "heading-size": "56"
},
"columns": {
  "valign": "center"
}
````

Together with `themes`, `vars`, `header`/`footer` and `css` it is enough to build a house style once and
reuse it for every deck of a school or company.

<!-- Defaults accept any key a slide accepts: layout, theme, background, transition, --variables. -->
