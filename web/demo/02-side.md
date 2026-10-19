---
layout: side
---

## Layout `side`

Tekst po lewej, kod po prawej. Kolejne bloki to klatki animacji.

```ts .left
function total(items: number[]) {
  let sum = 0;
  for (const x of items) sum += x;
  return sum;
}
```

```ts .left
function total(items: number[]) {
  return items.reduce((sum, x) => sum + x, 0);
}
```
