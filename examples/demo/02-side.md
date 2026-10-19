---
layout: side
---

## Layout `side`

Text on the left, code on the right. Consecutive blocks are animation frames.

<!-- Press the right arrow: the token `sum` and the loop body glide to their new places. -->

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

```ts .left
export const total = (items: number[]): number =>
  items.reduce((sum, x) => sum + x, 0);
```
