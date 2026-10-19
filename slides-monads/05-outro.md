## Call site

```cpp
int main() {
  auto result = process("42", 2);

  if (result) {
    std::cout << "Wynik: " << *result << "\n";
  } else {
    std::cout << "Blad: " << result.error() << "\n";
  }

  return 0;
}
```

## Podsumowanie

`and_then` to `>>=` / `flatMap`. `transform` to `fmap`/`map`. `std::expected`
to `Either`, `std::optional` to `Maybe`. C++23 w końcu ma to, co Haskell
miał od zawsze -- tylko pod innymi nazwami.

Dzięki!

<!-- Zapytaj o pytania -->
<!-- Jak starczy czasu: wspomnij że monadyczne API jest tez w std::expected od razu, nie trzeba czekac na kolejny standard -->
