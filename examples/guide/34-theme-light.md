---
theme: light
---

## Built-in `light`

Crisp on projectors. Per-slide, so you can mix themes inside one deck.

```py #g1
def total(prices, tax=0.2):
    return sum(prices) * (1 + tax)
```

```py #g1
def total(prices, tax=0.2):
    net = sum(prices)
    return round(net * (1 + tax), 2)
```
