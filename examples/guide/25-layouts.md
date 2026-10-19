## Rows and columns

A slide is one column by default: **title, text, code**, top left. Two kinds of separator turn it into a grid. A line of three
dashes, `---`, starts a new **row**; a line of three bars, `|||`, starts a new **cell** in the same row. Any combination works:
a title row, then two cells, then three; a 2 × 2 grid; a single wide cell.

````markdown
## Title             <- row 1, one cell

---

left                 <- row 2 ...
|||
right

---

a  |||  b  |||  c    <- row 3: three cells (each on its own lines)
````

Every cell holds text, images and code blocks. Leave a blank line around `---` and `|||`.
Sizes: `split: 35%` (two cells), `cols: 1fr 2fr 1fr` (every row), `rows: auto 1fr` (heights).

<!-- Front matter: layout: cover for a title slide. The older `layout: side` / `side-right` still work: they put the text left and the code right (or the other way round). -->
