## Focus lines

`focus=2-4` keeps those lines bright and dims the rest. Set it **per frame** — here the code
never changes, only the focus does, so the lines fade smoothly.

<!-- Syntax: ```ts focus=2-4,7  (1-based, ranges and comma lists). Great for "now look at this part". -->

```ts focus=1 #g1
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  charge(user, final);
  return receipt(cart, final);
}
```

```ts focus=2 #g1
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  charge(user, final);
  return receipt(cart, final);
}
```

```ts focus=2-4 #g1
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  charge(user, final);
  return receipt(cart, final);
}
```

```ts focus=5-6 #g1
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  charge(user, final);
  return receipt(cart, final);
}
```

```ts focus=5 #g1
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  await charge(user, final);
  return receipt(cart, final);
}
```

```ts #g1
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  await charge(user, final);
  return receipt(cart, final);
}
```
