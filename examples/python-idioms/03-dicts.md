## Counting words

<!-- The manual version first, then the standard library does it for us. -->

```python
def word_counts(text):
    counts = {}
    for word in text.split():
        if word in counts:
            counts[word] += 1
        else:
            counts[word] = 1
    return counts
```

```python
def word_counts(text):
    counts = {}
    for word in text.split():
        counts[word] = counts.get(word, 0) + 1
    return counts
```

```python
from collections import Counter


def word_counts(text):
    return Counter(text.split())
```

```python
from collections import Counter


def top_words(text, n=3):
    return Counter(text.lower().split()).most_common(n)
```
