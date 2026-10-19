## Problem z optional: nie wiadomo CO poszło nie tak

`std::nullopt` nie niesie informacji -- parsowanie i dzielenie przez zero
wyglądają identycznie z zewnątrz.

<!-- To jest motywacja do expected: chcemy Either, nie Maybe -->

## std::expected: Either dla C++

```cpp
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

## Dokładamy krok: łańcuch rośnie liniowo, nie zagnieżdża się

<!-- To jest clue tej prezentacji: dodanie kolejnego kroku to jeden .and_then, nie kolejny poziom if -->

```cpp
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
