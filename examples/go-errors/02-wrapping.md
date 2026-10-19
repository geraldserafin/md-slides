## Bare errors lose context

```go
func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
```

## Wrap with %w

<!-- fmt.Errorf with %w keeps the original error available to errors.Is/As. -->

```go
func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %q: %w", path, err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %q: %w", path, err)
	}
	return &cfg, nil
}
```

## Sentinel and typed errors

```go
var ErrNotFound = errors.New("not found")

func find(id int) (*User, error) {
	u, ok := users[id]
	if !ok {
		return nil, ErrNotFound
	}
	return u, nil
}
```

```go
var ErrNotFound = errors.New("not found")

type ValidationError struct {
	Field string
}

func (e *ValidationError) Error() string { return "invalid " + e.Field }

func find(id int) (*User, error) {
	if id <= 0 {
		return nil, &ValidationError{Field: "id"}
	}
	u, ok := users[id]
	if !ok {
		return nil, fmt.Errorf("user %d: %w", id, ErrNotFound)
	}
	return u, nil
}
```
