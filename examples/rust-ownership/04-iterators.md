## Loops to iterator chains

<!-- Same shape as the Python deck: loop with accumulator -> chain. -->

```rust
fn sum_of_even_squares(numbers: &[i32]) -> i32 {
    let mut total = 0;
    for n in numbers {
        if n % 2 == 0 {
            total += n * n;
        }
    }
    total
}
```

```rust
fn sum_of_even_squares(numbers: &[i32]) -> i32 {
    numbers
        .iter()
        .filter(|n| *n % 2 == 0)
        .map(|n| n * n)
        .sum()
}
```

## Handling errors with `?`

```rust
fn read_number(path: &str) -> Result<i32, String> {
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) => return Err(e.to_string()),
    };
    match text.trim().parse::<i32>() {
        Ok(n) => Ok(n),
        Err(e) => Err(e.to_string()),
    }
}
```

```rust
fn read_number(path: &str) -> Result<i32, Box<dyn std::error::Error>> {
    let text = std::fs::read_to_string(path)?;
    Ok(text.trim().parse::<i32>()?)
}
```
