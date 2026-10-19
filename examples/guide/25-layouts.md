## Columns

A slide is one column by default: **title, text, code**, top left. A line with three dashes splits it into
two columns, 50 / 50. Each side can hold text, images, code or all of them; code on either side is animated.

````markdown
## Code that moves

The text goes in the left column.

---

```ts
let a = 1;
```
````

Leave a blank line before `---` (right after a line of text it would turn that line into a heading).
The next slides show it live: text left with code right, code left with text right, and the `split:` option.

<!-- Front matter: layout: cover for a title slide. The older `layout: side` / `side-right` still work: they put the text left and the code right (or the other way round). -->
