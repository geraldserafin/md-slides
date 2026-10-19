## Alignment inside a column

By default this deck centers the two columns vertically (`columns` in `deck.json`). Here the code is pinned to the
top of its column with `valign=start` on the fence; a slide can do the same for everything with `valign: start`.

|||

```rust valign=start #g1
fn main() {
    let name = "slides";
    println!("hello, {name}");
}
```

```rust valign=start #g1
fn main() {
    let name = "slides";
    let count = 3;
    for i in 0..count {
        println!("{i}: hello, {name}");
    }
}
```
