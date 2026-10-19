---
layout: side
---

## `side` + `.top`

By default code is vertically centered next to the text. `.top` pins it to the top
edge; `.middle` is the default.

```rust .left .top
fn main() {
    let name = "slides";
    println!("hello, {name}");
}
```

```rust .left .top
fn main() {
    let name = "slides";
    let count = 3;
    for i in 0..count {
        println!("{i}: hello, {name}");
    }
}
```
