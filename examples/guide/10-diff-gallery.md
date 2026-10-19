## Small edits, one at a time

<!-- Each edit changes exactly one token or a tiny region; everything else must stay still. -->

```ts
if (count > 10) {
  alert("too many items: " + count);
}
```

```ts
if (count >= 10) {
  alert("too many items: " + count);
}
```

```ts
if (count >= limit) {
  alert("too many items: " + count);
}
```

```ts
if (count >= limit) {
  alert(`too many items: ${count}`);
}
```

```ts
if (count >= limit) {
  notify(`too many items: ${count}`);
}
```

## Reorder arguments

```ts
const point = makePoint(y, x, label, color);
```

```ts
const point = makePoint(x, y, label, color);
```

```ts
const point = makePoint(x, y, color, label);
```

## if / else to a ternary

```ts
let label;
if (count === 1) {
  label = "item";
} else {
  label = "items";
}
```

```ts
const label = count === 1 ? "item" : "items";
```

## Loop to method chain

```ts
const names = [];
for (const user of users) {
  if (user.active) {
    names.push(user.name);
  }
}
```

```ts
const names = users
  .filter((user) => user.active)
  .map((user) => user.name);
```
