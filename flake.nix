{
  description = "slideit: presentations with code transitions animated by an AST diff";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAll (pkgs: rec {
        slideit = pkgs.callPackage ./nix/package.nix { localSource = self; };
        default = slideit;
      });

      apps = forAll (pkgs: rec {
        slides = {
          type = "app";
          program = "${self.packages.${pkgs.system}.slideit}/bin/slides";
        };
        default = slides;
      });

      overlays.default = final: _: { slideit = final.callPackage ./nix/package.nix { localSource = self; }; };

      devShells = forAll (pkgs: {
        default = pkgs.mkShell { packages = [ pkgs.nodejs pkgs.chromium ]; };
      });
    };
}
