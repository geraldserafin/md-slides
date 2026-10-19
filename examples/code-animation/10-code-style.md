## Code style: panel, line numbers, title

Per block: classes `.panel` (a background box), `.lines` (line numbers) and options `start=10`, `title="cart.ts"`,
`bg=#16213e`, `radius=14`, `pad="1em 1.4em"`. Deck-wide defaults live under `code` in `deck.json`.

```ts .panel .lines title="cart.ts" start=10
export function total(items: Item[]): number {
  let sum = 0;
  for (const item of items) sum += item.price;
  return sum;
}
```

```ts .panel bg=#fff1cf title="no numbers, own color"
const rate = 0.23;
```
