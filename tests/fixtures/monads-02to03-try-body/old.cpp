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
