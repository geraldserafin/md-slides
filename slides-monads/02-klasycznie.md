## Klasyczne podejście: kody błędów

<!-- Pokaż ból: trzeba sprawdzać każdy return osobno, out-param zamiast return value -->

```cpp
bool parseInt(const std::string& s, int& out) {
  try {
    out = std::stoi(s);
    return true;
  } catch (...) {
    return false;
  }
}

bool safeDivide(int a, int b, int& out) {
  if (b == 0) {
    return false;
  }
  out = a / b;
  return true;
}

bool process(const std::string& s, int divisor, int& result) {
  int parsed;
  if (!parseInt(s, parsed)) {
    return false;
  }
  int divided;
  if (!safeDivide(parsed, divisor, divided)) {
    return false;
  }
  result = divided;
  return true;
}
```

## Albo: wyjątki

<!-- Problem inny: brak błędu w sygnaturze, call site musi zgadywać co może rzucić -->

```cpp
int parseInt(const std::string& s) {
  return std::stoi(s);
}

int safeDivide(int a, int b) {
  if (b == 0) {
    throw std::runtime_error("division by zero");
  }
  return a / b;
}

int process(const std::string& s, int divisor) {
  int parsed = parseInt(s);
  int divided = safeDivide(parsed, divisor);
  return divided;
}
```
