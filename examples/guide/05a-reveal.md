## Reveal: add content on a click

A line with three plus signs, `+++`, hides everything after it until the next click. Nothing moves when it appears:
the space is reserved.

+++

This text appeared on the first click.

+++

- and a list
- on the second

+++

```ts
const clicks = 3; // the code block came last
```

<!-- Works for text, lists, images, video and code blocks. Frames of a code group count as clicks too. -->
