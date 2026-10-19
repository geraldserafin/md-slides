## Python

```python
def evens(xs):
    out = []
    for x in xs:
        if x % 2 == 0:
            out.append(x)
    return out
```

```python
def evens(xs):
    return [x for x in xs if x % 2 == 0]
```

## JavaScript

```js
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}
```

```js
const debounce = (fn, ms) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};
```

## Lua

```lua
local function map(t, f)
  local out = {}
  for i, v in ipairs(t) do
    out[i] = f(v)
  end
  return out
end
```

```lua
local function map(t, f)
  local out = {}
  for i = 1, #t do
    out[#out + 1] = f(t[i])
  end
  return out
end
```

## Bash

```bash
for f in *.txt; do
  echo "processing $f"
  wc -l "$f"
done
```

```bash
for f in *.txt; do
  [ -s "$f" ] || continue
  echo "processing $f"
  wc -l < "$f"
done
```
