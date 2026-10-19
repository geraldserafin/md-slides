## Build a list: loop to comprehension

<!-- append in a loop -> list comprehension. Note how `if` moves inside. -->

```python
def squares_of_evens(numbers):
    result = []
    for n in numbers:
        if n % 2 == 0:
            result.append(n * n)
    return result
```

```python
def squares_of_evens(numbers):
    return [n * n for n in numbers if n % 2 == 0]
```

## Lazily: generator expression

```python
def total_of_squares(numbers):
    return sum([n * n for n in numbers if n % 2 == 0])
```

```python
def total_of_squares(numbers):
    return sum(n * n for n in numbers if n % 2 == 0)
```
