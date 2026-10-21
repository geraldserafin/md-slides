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
        vscode-extension = pkgs.callPackage ./nix/vscode-extension.nix { };
        # editors/vim as a Vim/Neovim plugin: filetype, syntax, tree-sitter registration and the language server (`slides lsp`)
        vim-plugin = pkgs.vimUtils.buildVimPlugin {
          pname = "slideit-nvim";
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
          src = ./editors/vim;
        };
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
