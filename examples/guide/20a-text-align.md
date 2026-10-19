---
align: justify
heading-align: left
---

## Text alignment: `align`

`align: justify` stretches every line of a paragraph to the full width, like in a printed document.
`heading-align: left` keeps the heading on the left while the body is justified. Both are plain
front matter keys, so any slide can pick its own, and `defaults` in `deck.json` sets them for the whole deck.

Values for `align` are `left`, `center`, `right` and `justify`. `heading-align` takes the first
three and defaults to the value of `align`. Lists, quotes and images follow `align` as well.

> A quote follows the alignment too.

<!-- Justify works best with long paragraphs and a wide column; hyphenation is switched on automatically. -->
