## Krok 1: typy i podstawy

<!-- Zacznij od gołej pętli, pokaż że działa, potem dodawaj typy stopniowo -->
<!-- var->let, potem interface, potem adnotacje typów, potem for-of, potem += -->

```ts
function calc(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].qty;
  }
  return total;
}
```

```ts
function calc(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].qty;
  }
  return total;
}
```

```ts
interface Item {
  price: number;
  qty: number;
}

function calc(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].qty;
  }
  return total;
}
```

```ts
interface Item {
  price: number;
  qty: number;
}

function calc(items: Item[]): number {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].qty;
  }
  return total;
}
```

```ts
interface Item {
  price: number;
  qty: number;
}

function calc(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    total = total + item.price * item.qty;
  }
  return total;
}
```

```ts
interface Item {
  price: number;
  qty: number;
}

function calc(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price * item.qty;
  }
  return total;
}
```

## Krok 2: nazewnictwo i guard clause

<!-- rename calc->calculateTotal, items->cartItems, dodaj guard na pusty koszyk -->

```ts
interface Item {
  price: number;
  qty: number;
}

function calculateTotal(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price * item.qty;
  }
  return total;
}
```

```ts
interface Item {
  price: number;
  qty: number;
}

function calculateTotal(cartItems: Item[]): number {
  let total = 0;
  for (const item of cartItems) {
    total += item.price * item.qty;
  }
  return total;
}
```

```ts
interface Item {
  price: number;
  qty: number;
}

function calculateTotal(cartItems: Item[]): number {
  if (cartItems.length === 0) {
    return 0;
  }

  let total = 0;
  for (const item of cartItems) {
    total += item.price * item.qty;
  }
  return total;
}
```
