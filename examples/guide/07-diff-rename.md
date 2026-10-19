## What the diff does: rename

<!-- Only the identifier changes. Every other token stays exactly where it is. -->

```ts
function area(r: number) {
  return Math.PI * r * r;
}
```

```ts
function circleArea(radius: number) {
  return Math.PI * radius * radius;
}
```

## What the diff does: insert

<!-- New lines fade in; the lines below them glide down to make room. -->

```ts
function greet(name: string) {
  return "Hello, " + name;
}
```

```ts
function greet(name: string) {
  if (!name) {
    throw new Error("name required");
  }
  return "Hello, " + name;
}
```
