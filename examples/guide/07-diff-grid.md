## What the diff does

Six kinds of edit, one click: every code block takes its second frame at the same time (`@1`).

---

### rename

```ts #r
function area(r: number) {
  return Math.PI * r * r;
}
```

```ts #r @1
function circleArea(radius: number) {
  return Math.PI * radius * radius;
}
```

|||

### insert

```ts #i
function greet(name: string) {
  return "Hello, " + name;
}
```

```ts #i @1
function greet(name: string) {
  if (!name) throw new Error("name");
  return "Hello, " + name;
}
```

|||

### delete

```ts #d
function connect(url: string) {
  console.log("connecting", url);
  const socket = new WebSocket(url);
  return socket;
}
```

```ts #d @1
function connect(url: string) {
  const socket = new WebSocket(url);
  return socket;
}
```

---

### move

```ts #m
function init() {
  connect();
  loadConfig();
  start();
}
```

```ts #m @1
function init() {
  loadConfig();
  connect();
  start();
}
```

|||

### wrap

```ts #w
function save(data: Data) {
  write(data);
}
```

```ts #w @1
function save(data: Data) {
  try {
    write(data);
  } catch (err) {
    report(err);
  }
}
```

|||

### extract

```ts #e
function report(order: Order) {
  const total = order.items.reduce((s, i) => s + i.price, 0);
  console.log(total);
}
```

```ts #e @1
function sum(order: Order) {
  return order.items.reduce((s, i) => s + i.price, 0);
}

function report(order: Order) {
  console.log(sum(order));
}
```
