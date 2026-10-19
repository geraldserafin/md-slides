## Focus lines

`focus=2-4` keeps those lines bright and dims the rest. Set it **per frame** — here the code
never changes, only the focus does, so the lines fade smoothly.

---

<!-- Syntax: ```ts focus=2-4,7  (1-based, ranges and comma lists). Great for "now look at this part". -->

```ts focus=1
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  charge(user, final);
  return receipt(cart, final);
}
```

```ts focus=2
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  charge(user, final);
  return receipt(cart, final);
}
```

```ts focus=2-4
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  charge(user, final);
  return receipt(cart, final);
}
```

```ts focus=5-6
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  charge(user, final);
  return receipt(cart, final);
}
```

```ts focus=5
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  await charge(user, final);
  return receipt(cart, final);
}
```

```ts
function checkout(cart: Cart, user: User) {
  const total = price(cart);
  const discount = loyalty(user);
  const final = total - discount;
  await charge(user, final);
  return receipt(cart, final);
}
```
