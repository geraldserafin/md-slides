## A class that is just data

<!-- ~15 lines of boilerplate shrink to a decorator and annotated fields. -->

```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):
        return f"Point(x={self.x!r}, y={self.y!r})"

    def __eq__(self, other):
        return isinstance(other, Point) and self.x == other.x and self.y == other.y
```

```python
from dataclasses import dataclass


@dataclass
class Point:
    x: float
    y: float
```

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class Point:
    x: float
    y: float

    def distance_to(self, other: "Point") -> float:
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5
```

## Resource handling

```python
def read_first_line(path):
    f = open(path)
    try:
        return f.readline()
    finally:
        f.close()
```

```python
def read_first_line(path):
    with open(path) as f:
        return f.readline()
```
