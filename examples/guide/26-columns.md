## Two columns with `---`

Text on the left, code on the right. The code is centered vertically in its column; the text starts at the top.

---

```go
func Sum(xs []int) int {
	total := 0
	for _, x := range xs {
		total += x
	}
	return total
}
```

```go
func Sum[T int | float64](xs []T) T {
	var total T
	for _, x := range xs {
		total += x
	}
	return total
}
```
