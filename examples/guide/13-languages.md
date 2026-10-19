## Languages

Fence tags map to [tree-sitter](https://tree-sitter.github.io/) grammars, loaded lazily and only
for the languages a deck uses.

- `ts` `tsx` `js` `jsx` &nbsp;·&nbsp; `c` `cpp` &nbsp;·&nbsp; `py` `rs` `go` `java` `lua`
- `sh`/`bash` &nbsp;·&nbsp; `json` `html` `css`
- the next three slides show a live transition in **every** one of them
- anything else (`text`, `toml`, `markdown`, …) is shown as a **static code block**
- tabs are expanded to four spaces

<!-- Matching works across any language because it only sees a generic tree. New language: tags.json + main.ts. -->

```toml
# a language without a grammar: static, not animated
[package]
name = "slides"
```
