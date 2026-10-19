## Deck-wide defaults

`defaults` in `deck.json` is front matter applied to **every** slide; `columns` is the same for slides that show two columns and `textOnly` for slides without code. A slide's own front matter wins.

````jsonc
"defaults": {
  "justify": "true",
  "padding": "9vmin 12vmin",
  "heading-size": "56"
},
"columns": {
  "valign": "center"
},
"textOnly": {
  "halign": "center",
  "valign": "center"
}
````

Together with `themes`, `vars`, `header`/`footer` and `css` it is enough to build a house style once and
reuse it for every deck of a school or company.

<!-- Defaults accept any key a slide accepts: layout, theme, background, transition, --variables. -->
