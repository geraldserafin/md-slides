## What the diff does: rename

<!-- Only the identifier changes. Every other token stays exactly where it is. -->

```ts #g1
function area(r: number) {
  return Math.PI * r * r;
}
```

```ts #g1
function circleArea(radius: number) {
  return Math.PI * radius * radius;
}
```

## What the diff does: insert

<!-- New lines fade in; the lines below them glide down to make room. -->

```ts #g2
function greet(name: string) {
  return "Hello, " + name;
}
```

```ts #g2
function greet(name: string) {
  if (!name) {
    throw new Error("name required");
  }
  return "Hello, " + name;
}
```
