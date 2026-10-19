---
layout: side
---

## Layout `side`

Text on the left, code on the right. Consecutive blocks are animation frames.

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
