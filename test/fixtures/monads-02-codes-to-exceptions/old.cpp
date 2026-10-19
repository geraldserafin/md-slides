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
