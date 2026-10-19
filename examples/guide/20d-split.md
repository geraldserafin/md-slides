---
layout: side
split: 52%
heading-align: left
---

## Wider text column: `split`

In the `side` and `side-right` layouts the text takes 36% of the width by default.
`split: 52%` gives it more room, here for a longer explanation next to a short snippet.

```ts
const columns = { text: "52%", code: "the rest" };
```

```ts
const columns = { text: "52%", code: "the rest", gap: "4vmin" };
```
