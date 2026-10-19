```python
def mean(xs):
    return sum(xs) / len(xs)
```

```python
def mean(xs):
    if not xs:
        raise ValueError("empty")
    return sum(xs) / len(xs)
```

---

## Code on the left

Put the code first and the text after the `---`: the mirror image. Whatever comes after the line, up to the next heading, belongs to the right column.
