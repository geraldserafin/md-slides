## Languages

Fence tags map to [tree-sitter](https://tree-sitter.github.io/) grammars, loaded lazily and only
for the languages a deck uses. Every language animates the same way; here is Rust.

- **TypeScript / JavaScript:** `ts` `tsx` `js` `jsx`
- **C family:** `c` `cpp` (`cc` `cxx` `hpp` `h`)
- **JVM:** `java`
- **Systems:** `rs` / `rust` · `go`
- **Scripting:** `py` · `lua` · `sh` / `bash`
- **Web & data:** `html` `css` `json`
- anything else (`text`, `toml`, `yaml`, `markdown`, …) is a **static code block**; tabs become four spaces

<!-- Matching works across languages because it only sees a generic tree. New language: tags.json + main.ts. -->

```rust #g1
fn sum(xs: &[i32]) -> i32 {
    let mut total = 0;
    for x in xs {
        total += x;
    }
    total
}
```

```rust #g1
fn sum(xs: &[i32]) -> i32 {
    xs.iter().sum()
}
```
