## Fit: code scales to the available space

<!-- The largest frame of a section decides the scale, so the font size is constant across frames. -->

Code is scaled to fit the slide (between half and 1.6x). The **largest** frame of a section decides,
so the first frame below looks small: the next one is 16 lines long. Press → and it stays the same size.

```ts
const a = 1;
```

```ts
const a = 1;
const b = 2;
const c = a + b;
const d = c * 2;
const e = d - a;
const f = e / b;
const g = f % 3;
const h = g ** 2;
const i = h + 1;
const j = i + 2;
const k = j + 3;
const l = k + 4;
const m = l + 5;
const n = m + 6;
const o = n + 7;
const p = o + 8;
```

## `size=` fixes the font size

Two frames, `size=30`: the code is big and stays big.

```ts size=30
const big = "size=30";
```

```ts size=30
const big = "size=30";
const bigger = big + "!";
```

## `fit=none`

No automatic scaling at all (scale 1). Use it with a fixed `size` when you control the content.

```ts fit=none
const plain = "scale 1, no fit";
```
