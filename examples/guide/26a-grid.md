## A grid: two rows, two cells

---

### Top left

A cell can hold text and code. Each cell is aligned on its own (`valign`, `halign`).

```ts
const a = 1;
```

|||

### Top right

```py #p
x = 1
```

```py #p @1
x = 2   # on the first click
```

---

### Bottom left

+++

Appears on the first click.

|||

### Bottom right

Rows take the height of their content; `rows: auto 1fr` and `cols: 1fr 2fr` change that.
