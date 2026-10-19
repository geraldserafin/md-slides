int main() {
  auto result = process("42", 2);

  if (result) {
    std::cout << "Wynik: " << *result << "\n";
  } else {
    std::cout << "Blad: " << result.error() << "\n";
  }

  return 0;
}
