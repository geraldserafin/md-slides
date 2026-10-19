## What the diff does: delete

<!-- Removed lines fade out and the rest closes the gap. Try going backwards: deletion becomes insertion. -->

```ts #g1
function connect(url: string) {
  console.log("connecting to", url);
  const socket = new WebSocket(url);
  console.log("socket created");
  return socket;
}
```

```ts #g1
function connect(url: string) {
  const socket = new WebSocket(url);
  return socket;
}
```

```ts #g1
const connect = (url: string) => new WebSocket(url);
```

## Remove a parameter

```ts #g2
function draw(ctx, x, y, color, debug) {
  ctx.fill(color);
  ctx.rect(x, y, 10, 10);
  if (debug) log(x, y);
}
```

```ts #g2
function draw(ctx, x, y, color) {
  ctx.fill(color);
  ctx.rect(x, y, 10, 10);
}
```
