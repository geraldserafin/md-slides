## The problem with optional: you can't tell WHAT went wrong

`std::nullopt` carries no information -- a parse failure and a division by zero
look identical from the outside.

<!-- This is the motivation for expected: we want Either, not Maybe -->

## std::expected: Either for C++

```cpp #flow
std::expected<int, std::string> parseInt(const std::string& s) {
  try {
    return std::stoi(s);
  } catch (...) {
    return std::unexpected("invalid number");
  }
}

std::expected<int, std::string> safeDivide(int a, int b) {
  if (b == 0) {
    return std::unexpected("division by zero");
  }
  return a / b;
}

std::expected<int, std::string> process(const std::string& s, int divisor) {
  return parseInt(s).and_then([divisor](int parsed) {
    return safeDivide(parsed, divisor);
  });
}
```

## Adding a step: the chain grows linearly, it doesn't nest

<!-- The point of this deck: adding another step is one more .and_then, not another level of if -->

```cpp #flow
std::expected<int, std::string> parseInt(const std::string& s) {
  try {
    return std::stoi(s);
  } catch (...) {
    return std::unexpected("invalid number");
  }
}

std::expected<int, std::string> safeDivide(int a, int b) {
  if (b == 0) {
    return std::unexpected("division by zero");
  }
  return a / b;
}

std::expected<int, std::string> validateRange(int v) {
  if (v < 0 || v > 1000) {
    return std::unexpected("out of range");
  }
  return v;
}

std::expected<int, std::string> process(const std::string& s, int divisor) {
  return parseInt(s)
    .and_then([divisor](int parsed) { return safeDivide(parsed, divisor); })
    .and_then(validateRange);
}
```
