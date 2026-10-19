## A longer story: growing a class

<!-- Eight frames, one idea each. Walk through them slowly: this is how a real refactoring talk reads. -->

```python
class Stack:
    pass
```

```python
class Stack:
    def __init__(self):
        self.items = []
```

```python
class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)
```

```python
class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        return self.items.pop()
```

```python
class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        if not self.items:
            raise IndexError("empty")
        return self.items.pop()
```

```python
class Stack:
    def __init__(self):
        self._items = []

    def push(self, item):
        self._items.append(item)

    def pop(self):
        if not self._items:
            raise IndexError("empty")
        return self._items.pop()
```

```python
class Stack:
    def __init__(self):
        self._items = []

    def push(self, item):
        self._items.append(item)

    def pop(self):
        if not self._items:
            raise IndexError("empty")
        return self._items.pop()

    def __len__(self):
        return len(self._items)
```

```python
class Stack:
    def __init__(self):
        self._items = []

    def push(self, item):
        self._items.append(item)

    def pop(self):
        if not self:
            raise IndexError("empty")
        return self._items.pop()

    def __len__(self):
        return len(self._items)
```
