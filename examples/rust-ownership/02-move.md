## Moves: the value is gone after the call

<!-- The first version does not compile: `name` is moved into `greet`. -->

```rust
fn greet(name: String) -> String {
    format!("Hello, {name}!")
}

fn main() {
    let name = String::from("Ferris");
    let a = greet(name);
    let b = greet(name);
    println!("{a} {b}");
}
```

## Fix 1: clone (works, but allocates)

```rust
fn greet(name: String) -> String {
    format!("Hello, {name}!")
}

fn main() {
    let name = String::from("Ferris");
    let a = greet(name.clone());
    let b = greet(name);
    println!("{a} {b}");
}
```

## Fix 2: borrow instead of own

<!-- `&` in the signature and at the call sites. Nothing is copied. -->

```rust
fn greet(name: &String) -> String {
    format!("Hello, {name}!")
}

fn main() {
    let name = String::from("Ferris");
    let a = greet(&name);
    let b = greet(&name);
    println!("{a} {b}");
}
```

```rust
fn greet(name: &str) -> String {
    format!("Hello, {name}!")
}

fn main() {
    let name = String::from("Ferris");
    let a = greet(&name);
    let b = greet("Crab");
    println!("{a} {b}");
}
```
