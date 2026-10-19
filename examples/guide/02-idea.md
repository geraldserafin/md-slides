## Code that moves

Write the *before* and the *after* as two code blocks.
`slides` parses both, matches the syntax trees and animates the difference:
unchanged tokens stay, moved tokens glide, new ones fade in.

<!-- Press the right arrow slowly and watch `total`, `items` and `return` keep their identity. -->

```ts #g1
function total(items: number[]) {
  let sum = 0;
  for (const x of items) {
    sum += x;
  }
  return sum;
}
```

```ts #g1
function total(items: number[]) {
  const sum = items.reduce(
    (acc, x) => acc + x,
    0,
  );
  return sum;
}
```

```ts #g1
const total = (items: number[]) =>
  items.reduce((acc, x) => acc + x, 0);
```
