---
--tok-keyword: #ff5d8f
--tok-ident: #ffe66d
--tok-type: #4ecdc4
--tok-builtin: #ff9f1c
--tok-punct: #8d99ae
--accent: #4ecdc4
layout: side
---

## Recolor syntax per slide

The front matter of this slide sets `--tok-keyword`, `--tok-ident`, `--tok-type`,
`--tok-builtin` and `--tok-punct`. No theme needed.

```ts .left
interface Point { x: number; y: number }

function norm(p: Point): number {
  return Math.sqrt(p.x ** 2 + p.y ** 2);
}
```

```ts .left
interface Point { x: number; y: number }

function norm({ x, y }: Point): number {
  return Math.hypot(x, y);
}
```
