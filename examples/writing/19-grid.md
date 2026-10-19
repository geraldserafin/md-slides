---
grid: 3
---

## Grids: `grid: 3`

With `grid: 3` in the front matter you only write the cells: three to a row, then it wraps. Options go after the bars:
`||| span=2`, `||| valign=center halign=end`.

---

### One

Plain text.

|||

### Two

```py #p
x = 1
```

```py #p @1
x = 2   # on the first click
```

|||

### Three

Nothing special.

||| halign=end

### Four

Right-aligned with `||| halign=end`, and in the next row.

||| span=2

### Five (span=2)

This cell is twice as wide as a normal one.
