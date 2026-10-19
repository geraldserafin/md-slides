## C

<!-- Every language below uses the same engine; only the grammar differs. -->

```c
int sum(int *xs, int n) {
  int total = 0;
  for (int i = 0; i < n; i++) {
    total += xs[i];
  }
  return total;
}
```

```c
long sum(const int *xs, size_t n) {
  long total = 0;
  for (size_t i = 0; i < n; i++)
    total += xs[i];
  return total;
}
```

## C++

```cpp
int sum(const std::vector<int>& xs) {
  int total = 0;
  for (int x : xs) {
    total += x;
  }
  return total;
}
```

```cpp
template <typename Range>
auto sum(const Range& xs) {
  return std::accumulate(xs.begin(), xs.end(), 0);
}
```

## Rust

```rust
fn sum(xs: &[i32]) -> i32 {
    let mut total = 0;
    for x in xs {
        total += x;
    }
    total
}
```

```rust
fn sum(xs: &[i32]) -> i32 {
    xs.iter().sum()
}
```

## Go

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
func Sum[T constraints.Integer](xs []T) (total T) {
	for _, x := range xs {
		total += x
	}
	return
}
```

## Java

```java
static int sum(List<Integer> xs) {
    int total = 0;
    for (int x : xs) {
        total += x;
    }
    return total;
}
```

```java
static int sum(List<Integer> xs) {
    return xs.stream().mapToInt(Integer::intValue).sum();
}
```
