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
