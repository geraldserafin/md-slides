---
layout: side
---

## `side`

Text left, code right. The code is centered vertically in its column.

```go .left
func Sum(xs []int) int {
	total := 0
	for _, x := range xs {
		total += x
	}
	return total
}
```

```go .left
func Sum[T int | float64](xs []T) T {
	var total T
	for _, x := range xs {
		total += x
	}
	return total
}
```
