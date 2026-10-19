## Header, footer and logo

The bar at the bottom of this very slide is the deck's **footer**. Define a `header` and/or a
`footer` in `deck.json`: each has a `left`, `center` and `right` slot holding text, images, or a list of both.

````jsonc
"footer": {
  "left": ["logo.svg", "ACME Corp · Confidential"],
  "right": "{slide} / {slides}",
  "height": 42, "border": true,
  "background": "#0b1d2a", "color": "#9db4c0"
}
````

Text can use `{slide}` `{slides}` `{title}` `{slideTitle}` `{author}` `{date}`. A slot value that ends in
`.svg` `.png` `.jpg` `.webp` is an image, relative to the deck folder. Bars are hidden on `layout: cover`
slides unless you set `"cover": true`; any slide can opt out with `footer: off` or `header: off`.

<!-- Typical use: a school or company theme. Put the logo in the footer or header, add the name and the slide number. -->
