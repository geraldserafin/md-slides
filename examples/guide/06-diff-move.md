## What the diff does: move

<!-- Statements swap places; every token glides to its new position instead of disappearing and reappearing. -->

```ts
function init() {
  connect();
  loadConfig();
  start();
}
```

```ts
function init() {
  loadConfig();
  connect();
  start();
}
```

## What the diff does: wrap

<!-- Wrapping code in a block re-indents it; the original tokens slide right and the new wrapper fades in. -->

```ts
function save(data: Data) {
  write(data);
  log("saved");
}
```

```ts
function save(data: Data) {
  try {
    write(data);
    log("saved");
  } catch (err) {
    report(err);
  }
}
```

## What the diff does: extract

<!-- The moved lines keep their identity inside the new function. -->

```ts
function report(order: Order) {
  const total = order.items.reduce((s, i) => s + i.price, 0);
  console.log(order.id, total);
}
```

```ts
function sum(order: Order) {
  return order.items.reduce((s, i) => s + i.price, 0);
}

function report(order: Order) {
  const total = sum(order);
  console.log(order.id, total);
}
```
