---
--move-dur: 0.8s
--ease: cubic-bezier(0.34, 1.56, 0.64, 1)
---

## Bouncy

`--ease: cubic-bezier(0.34, 1.56, 0.64, 1)` overshoots a little before settling.

```ts
function greet(name: string) {
  return "Hello, " + name;
}
```

```ts
function greet(name: string, punctuation = "!") {
  const message = "Hello, " + name + punctuation;
  return message;
}
```

```ts
const greet = (name: string, p = "!") =>
  `Hello, ${name}${p}`;
```
