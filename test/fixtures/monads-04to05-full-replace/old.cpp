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
