# What the diff does

Six kinds of edit, one at a time. Each one is a section under this title: press → to play it, → again for the next.

## rename

Only the identifiers change; every other token stays exactly where it is.

```ts #r
function area(r: number) {
  return Math.PI * r * r;
}
```

```ts #r
function circleArea(radius: number) {
  return Math.PI * radius * radius;
}
```

## insert

New lines fade in; the lines below glide down to make room.

```ts #i
function greet(name: string) {
  return "Hello, " + name;
}
```

```ts #i
function greet(name: string) {
  if (!name) {
    throw new Error("name required");
  }
  return "Hello, " + name;
}
```

## delete

Removed lines fade out and the rest closes the gap. Going backwards turns deletion into insertion.

```ts #d
function connect(url: string) {
  console.log("connecting to", url);
  const socket = new WebSocket(url);
  console.log("socket created");
  return socket;
}
```

```ts #d
function connect(url: string) {
  const socket = new WebSocket(url);
  return socket;
}
```

## move

Statements swap places; every token glides to its new position instead of disappearing and reappearing.

```ts #m
function init() {
  connect();
  loadConfig();
  start();
}
```

```ts #m
function init() {
  loadConfig();
  connect();
  start();
}
```

## wrap

Wrapping code in a block re-indents it: the original tokens slide right and the wrapper fades in.

```ts #w
function save(data: Data) {
  write(data);
  log("saved");
}
```

```ts #w
function save(data: Data) {
  try {
    write(data);
    log("saved");
  } catch (err) {
    report(err);
  }
}
```

## extract

The moved lines keep their identity inside the new function.

```ts #e
function report(order: Order) {
  const total = order.items.reduce((s, i) => s + i.price, 0);
  console.log(order.id, total);
}
```

```ts #e
function sum(order: Order) {
  return order.items.reduce((s, i) => s + i.price, 0);
}

function report(order: Order) {
  const total = sum(order);
  console.log(order.id, total);
}
```
