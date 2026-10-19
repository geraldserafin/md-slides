## Step 3: functional style

<!-- function declaration -> const arrow function -->

```ts #calc
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

## Step 4: Extract Method

<!-- two steps: first add the new function (duplicated logic), then swap the call site -->
<!-- split in two because otherwise the diff gets lost on identical structure -->

```ts #calc
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

```ts #calc
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

## Step 5: .reduce and export

```ts #calc
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

```ts #calc
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

The end. Thanks!

<!-- Say thanks, ask for questions -->
