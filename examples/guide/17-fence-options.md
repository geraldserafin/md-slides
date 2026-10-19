## Fence options: alignment

<!-- Options go after the language in the fence: ```ts .left size=18 -->

Alignment: `halign=` and `valign=` (`start` | `center` | `end`), or the classes `.left` `.center` `.right` and `.top` `.middle` `.bottom`.
Without them the code follows its slide: `start`, unless the slide says otherwise.
Other options: `size=`, `fit=none`, `focus=`, `transition=` (see the next slides).

```ts .left
const where = "left";
```

```ts .left
const where = "still left, now longer";
```

## Fence options: size

`size=14` fixes the font size in pixels. Without it the code is scaled to fit,
using the largest frame of the section, so the size never jumps between frames.

```ts size=14
const small = "size=14";
```

```ts size=14
const small = "size=14, and the same font size in every frame";
```

## Fence options: `.right`, `.top`

<!-- Next: focus=, fit and size in detail. -->

```ts .right .top
const corner = "top right";
```
