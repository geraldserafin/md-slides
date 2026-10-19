---
layout: side
---

## Mutable borrows

One `&mut` at a time, or any number of `&`.

<!-- The borrow checker in one slide. -->

```rust .left
fn push_twice(items: &mut Vec<i32>, x: i32) {
    items.push(x);
    items.push(x);
}
```

```rust .left
fn push_twice(items: &mut Vec<i32>, x: i32) {
    for _ in 0..2 {
        items.push(x);
    }
}
```

```rust .left
fn push_n(items: &mut Vec<i32>, x: i32, n: usize) {
    items.extend(std::iter::repeat(x).take(n));
}
```
