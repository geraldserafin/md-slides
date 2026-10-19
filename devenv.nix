{ pkgs, ... }:

{
  # Node for the build, Chromium for the PDF target and screenshots.
  packages = with pkgs; [
    nodejs
    chromium
  ];
}
