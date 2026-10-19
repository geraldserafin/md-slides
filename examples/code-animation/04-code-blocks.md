## Several code blocks on one slide

Blocks without an `#id` are independent: each is its own animation, side by side or one below the other.

```ts
const a = 1;
```

Text can sit between the blocks.

```py
b = 2
```

+++

Blocks with the same `#id` are frames of one block. The second click morphs it:

```ts #fn
function f() { return 1; }
```

```ts #fn
function f() { return 2; }
```
