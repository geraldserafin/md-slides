---
layout: side
---

## Checking errors

Compare with `errors.Is`, extract with `errors.As`, never with `==` or string matching.

<!-- Walk through: == breaks as soon as someone wraps the error. -->

```go .left
u, err := find(id)
if err == ErrNotFound {
	return create(id)
}
if err != nil {
	return nil, err
}
```

```go .left
u, err := find(id)
if errors.Is(err, ErrNotFound) {
	return create(id)
}
if err != nil {
	return nil, err
}
```

```go .left
u, err := find(id)
var verr *ValidationError
switch {
case errors.Is(err, ErrNotFound):
	return create(id)
case errors.As(err, &verr):
	return nil, verr
case err != nil:
	return nil, err
}
```
