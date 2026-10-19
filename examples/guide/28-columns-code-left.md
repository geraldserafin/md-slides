```python #g1
def mean(xs):
    return sum(xs) / len(xs)
```

```python #g1
def mean(xs):
    if not xs:
        raise ValueError("empty")
    return sum(xs) / len(xs)
```

|||

## Code on the left

Put the code first and the text after the `|||`: the mirror image.
