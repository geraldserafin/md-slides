## A slide with three sections

This single slide has three sections. Each one is a heading plus code. Moving between sections
fades the text and morphs the code, the same way frames do.

<!-- This file is ONE slide but several steps. The progress counter stays at the same slide number. -->

```ts
const cart = [];
```

```ts
const cart = [];
cart.push({ sku: "A1", qty: 2 });
```

## Section two: more state

Same slide, new heading. The old text fades out, the new one fades in, the code keeps morphing.

```ts
const cart: Item[] = [];
cart.push({ sku: "A1", qty: 2 });
cart.push({ sku: "B7", qty: 1 });
```

## Section three: derive a value

The last section computes something from the state above.

```ts
const cart: Item[] = [];
cart.push({ sku: "A1", qty: 2 });
cart.push({ sku: "B7", qty: 1 });

const count = cart.reduce((n, item) => n + item.qty, 0);
```

```ts
const cart: Item[] = [];
cart.push({ sku: "A1", qty: 2 });
cart.push({ sku: "B7", qty: 1 });

const count = cart.reduce((n, item) => n + item.qty, 0);
console.log(`${count} items`);
```
