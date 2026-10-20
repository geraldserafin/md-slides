# The VS Code extension of editors/vscode, as a nixpkgs vscode extension (for vscode-with-extensions, home-manager, devenv).
{
  lib,
  buildNpmPackage,
  vscode-utils,
}:

let
  manifest = lib.importJSON ../editors/vscode/package.json;
  # the extension folder with its node_modules (vscode-languageclient); there is nothing to compile
  src = buildNpmPackage {
    pname = "slideit-vscode-files";
    inherit (manifest) version;
    src = lib.cleanSourceWith {
      src = ../editors/vscode;
      filter = name: _: !(lib.hasSuffix ".vsix" name) && baseNameOf name != "node_modules";
    };
    npmDepsHash = "sha256-ySY0PCMRRbeieTZKvMqxTjeTJmW/MrEAW5WxygNSVRc=";
    dontNpmBuild = true;
    npmFlags = [
      "--omit=dev"
      "--ignore-scripts"
    ];
    installPhase = ''
      runHook preInstall
      mkdir -p $out
      cp -r . $out
      rm -rf $out/node_modules/.bin
      runHook postInstall
    '';
  };
in
vscode-utils.buildVscodeExtension {
  pname = "slideit-vscode";
  inherit (manifest) version;
  vscodeExtPublisher = manifest.publisher;
  vscodeExtName = manifest.name;
  vscodeExtUniqueId = "${manifest.publisher}.${manifest.name}";
  inherit src;
  sourceRoot = "source";
  unpackPhase = ''
    runHook preUnpack
    mkdir -p source
    cp -r ${src}/. source/
    chmod -R u+w source
    runHook postUnpack
  '';
  meta = {
    description = "slideit: highlighting, diagnostics, completion and live preview for .slide presentations";
    license = lib.licenses.bsd3;
  };
}
