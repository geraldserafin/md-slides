---
justify: true
---

## Alignment: everything starts at the top left

Every box starts at the **start**, both ways: text at the left edge, at the top. Say otherwise with
`halign` and `valign`, each `start`, `center` or `end`. They work in the front matter of a slide,
in `defaults` in `deck.json`, and on a code fence (`halign=center`, `valign=end`).

`justify: true` stretches every line of a paragraph to the full column width, like in a printed document; the last line stays at the start.
This slide uses it. `defaults` in `deck.json` can switch it on for a whole deck.

For slides that really show **two columns** (text next to code), `columns` in `deck.json` sets defaults of its own,
for example `{"valign": "center"}`. Every other layout stays at the start unless a slide says otherwise.

<!-- start/center/end are also accepted as left/right/top/middle/bottom. -->
