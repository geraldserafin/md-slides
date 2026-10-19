## Frame transitions: `transition=`

<!-- Per frame option, written on the fence of the frame you are entering. Default is morph. -->

By default a frame **morphs** from the previous one. Put `transition=` on a frame's fence to change
how *that* frame is entered:

- `morph` (default) — the diff animation
- `fade` — no matching: the old code fades out, the new code fades in
- `none` — a hard cut, no animation at all

Frame 1 is the starting point; the next three use a different mode each.

```ts
function area(w: number, h: number) {
  return w * h;
}
```

```ts
function area(width: number, height: number) {
  return width * height;
}
```

```ts transition=fade
function area(width: number, height: number) {
  return width * height * 2;
}
```

```ts transition=none
function area(width: number, height: number) {
  return width * height * 3;
}
```

```ts
function area(width: number, height: number) {
  return width * height * 4;
}
```
