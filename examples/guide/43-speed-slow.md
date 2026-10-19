---
--move-dur: 1.6s
--fade-dur: 0.9s
---

## Slow motion

Every animation knob is a CSS variable, so a slide can override it:
`--move-dur: 1.6s` and `--fade-dur: 0.9s` in the front matter.

<!-- Perfect for a slide where the transition IS the point. -->

```ts
function area(w: number, h: number) {
  const result = w * h;
  return result;
}
```

```ts
function area(h: number, w: number) {
  return h * w;
}
```

```ts
const area = (h: number, w: number) => h * w;
```
