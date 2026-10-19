## std::optional: błąd w typie, nie w out-param

<!-- Teraz błąd wraca jako wartość, nie jako referencja -- ale ręczne sprawdzanie zostaje -->

```cpp
std::optional<int> parseInt(const std::string& s) {
  try {
    return std::stoi(s);
  } catch (...) {
    return std::nullopt;
  }
}

std::optional<int> safeDivide(int a, int b) {
  if (b == 0) {
    return std::nullopt;
  }
  return a / b;
}

std::optional<int> process(const std::string& s, int divisor) {
  auto parsed = parseInt(s);
  if (!parsed) {
    return std::nullopt;
  }
  return safeDivide(*parsed, divisor);
}
```

## Refactor: and_then (monadyczne wiązanie)

<!-- To jest bind/flatMap z Haskella -- and_then jest w std::optional od C++23 -->
<!-- process() kurczy się z 5 linii do 1 wyrażenia -->

```cpp
std::optional<int> parseInt(const std::string& s) {
  try {
    return std::stoi(s);
  } catch (...) {
    return std::nullopt;
  }
}

std::optional<int> safeDivide(int a, int b) {
  if (b == 0) {
    return std::nullopt;
  }
  return a / b;
}

std::optional<int> process(const std::string& s, int divisor) {
  return parseInt(s).and_then([divisor](int parsed) {
    return safeDivide(parsed, divisor);
  });
}
```
