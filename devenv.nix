{ pkgs, ... }:

{
  languages.haskell = {
    enable = true;
  };

  # SDL2 + SDL2_ttf (fonty) -- jedna przenośna biblioteka C, naprawdę
  # cross-platform (Linux/macOS/Windows), w przeciwieństwie do GTK (odrzucone,
  # GObject-Introspection to w praktyce Linux-only). pkg-config potrzebny
  # przez bindingsy 'sdl2'/'sdl2-ttf'.
  packages = with pkgs; [
    ghcid
    pkg-config
    SDL2
    SDL2_ttf
    SDL2_image
    libtiff
    harfbuzz
    freetype
    glib
    libsysprof-capture
    pcre2
  ];
}
