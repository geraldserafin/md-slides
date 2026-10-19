## Across languages

<!-- Matching needs two trees of the same language. Between languages the old code fades out and the new one fades in. -->

The same function in TypeScript, then in Python. The diff can't match different grammars,
so this is a plain cross-fade.

```ts
function clamp(x: number, lo: number, hi: number) {
  return Math.min(Math.max(x, lo), hi);
}
```

## ...and in Python

```python
def clamp(x, lo, hi):
    return min(max(x, lo), hi)
```

## ...and in Go

```go
func Clamp(x, lo, hi int) int {
	return min(max(x, lo), hi)
}
```
