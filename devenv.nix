{ pkgs, ... }:

let
  # the editor with the slideit extension installed (VSCodium: free software, no allowUnfree needed;
  # for Microsoft's build set `allow_unfree: true` in devenv.yaml and use pkgs.vscode here)
  editor = pkgs.vscode-with-extensions.override {
    vscode = pkgs.vscodium;
    vscodeExtensions = [ (pkgs.callPackage ./nix/vscode-extension.nix { }) ];
  };
in
{
  # Node for the build, Chromium for the PDF target and screenshots, the editor with the extension.
  packages = [
    pkgs.nodejs
    pkgs.chromium
    editor
  ];

  # `slides` from this checkout (the extension starts the language server and the preview with it)
  scripts.slides.exec = ''
    exec node "$DEVENV_ROOT/cli/slideit.mjs" "$@"
  '';

  enterShell = ''
    echo "slides: this checkout's CLI · codium .: the editor with the slideit extension"
  '';
}
