## Krok 3: styl funkcyjny

<!-- function declaration -> const arrow function -->

```ts
interface Item {
  price: number;
  qty: number;
}

const calculateTotal = (cartItems: Item[]): number => {
  if (cartItems.length === 0) {
    return 0;
  }

  let total = 0;
  for (const item of cartItems) {
    total += item.price * item.qty;
  }
  return total;
};
```

## Krok 4: Extract Method

<!-- dwa kroki: najpierw dodaj nową funkcję (zduplikowana logika), potem podmień call site -->
<!-- rozbite na dwa osobne kroki bo inaczej algorytm diffu gubi się na identycznej strukturze -->

```ts
interface Item {
  price: number;
  qty: number;
}

function itemTotal(item: Item): number {
  return item.price * item.qty;
}

const calculateTotal = (cartItems: Item[]): number => {
  if (cartItems.length === 0) {
    return 0;
  }

  let total = 0;
  for (const item of cartItems) {
    total += item.price * item.qty;
  }
  return total;
};
```

```ts
interface Item {
  price: number;
  qty: number;
}

function itemTotal(item: Item): number {
  return item.price * item.qty;
}

const calculateTotal = (cartItems: Item[]): number => {
  if (cartItems.length === 0) {
    return 0;
  }

  let total = 0;
  for (const item of cartItems) {
    total += itemTotal(item);
  }
  return total;
};
```

## Krok 5: .reduce i export

```ts
interface Item {
  price: number;
  qty: number;
}

function itemTotal(item: Item): number {
  return item.price * item.qty;
}

const calculateTotal = (cartItems: Item[]): number =>
  cartItems.reduce((total, item) => total + itemTotal(item), 0);
```

```ts
interface Item {
  price: number;
  qty: number;
}

export function itemTotal(item: Item): number {
  return item.price * item.qty;
}

export const calculateTotal = (cartItems: Item[]): number =>
  cartItems.reduce((total, item) => total + itemTotal(item), 0);
```

Koniec. Dzięki!

<!-- Podziękuj, zapytaj o pytania -->
