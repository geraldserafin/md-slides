---
transition: slide-right
---

# Across languages

<!-- Matching needs two trees of the same language. Between languages the old code fades out and the new one fades in. -->

The same function in three languages, one section each under this title, sliding in from the left (`transition: slide-right`). The diff can't match different
grammars, so moving from one to the next is a plain cross-fade.

## TypeScript

```ts
function clamp(x: number, lo: number, hi: number) {
  return Math.min(Math.max(x, lo), hi);
}
```

## Python

```python
def clamp(x, lo, hi):
    return min(max(x, lo), hi)
```

## Go

```go
func Clamp(x, lo, hi int) int {
	return min(max(x, lo), hi)
}
```
