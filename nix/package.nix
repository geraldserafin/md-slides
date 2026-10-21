# slideit, written the way nixpkgs wants it (callPackage, finalAttrs). In nixpkgs only the fetchFromGitHub source is kept
# (the tag v${version} must exist) and `npmDepsHash` is refreshed with `nix-update slideit`. The flake passes the checkout
# as `localSource`, so it builds what you have on disk.
{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
  fetchFromGitHub,
  chromium,
  nix-update-script,
  withPdf ? true, # the pdf target prints with Chromium; without it `slides build -t pdf` needs CHROMIUM=/path set by hand
  localSource ? null,
}:

buildNpmPackage (finalAttrs: {
  pname = "slideit";
  version = "0.3.0";
  inherit nodejs;

  src =
    if localSource != null then
      localSource
    else
      fetchFromGitHub {
        owner = "geraldserafin";
        repo = "md-slides";
        tag = "v${finalAttrs.version}";
        hash = lib.fakeHash; # fill in when v0.1.0 is tagged
      };

  npmDepsHash = "sha256-eR0iEf/oOZ5WMSBxv1XConDlj1NQFj4GWT8xtuRyJt0=";

  nativeBuildInputs = [ makeWrapper ];

  # the plain-JS markup modules (lib/) and the prebuilt viewers (viewer/) that the package ships; `prepublishOnly` would also run the tests
  npmBuildScript = "build:package";

  # the tarball `npm pack` makes holds exactly `files` of package.json: the cli, lib and the viewers
  postInstall = lib.optionalString withPdf ''
    wrapProgram $out/bin/slides --set-default CHROMIUM ${lib.getExe chromium}
    wrapProgram $out/bin/slideit --set-default CHROMIUM ${lib.getExe chromium}
  '';

  passthru.updateScript = nix-update-script { };

  meta = {
    description = "Presentations written in a small language (KDL), with code transitions animated by an AST diff";
    homepage = "https://github.com/geraldserafin/md-slides";
    license = lib.licenses.bsd3;
    mainProgram = "slides";
    platforms = lib.platforms.unix;
    # maintainers = with lib.maintainers; [ ]; # nixpkgs: add yourself to maintainers/maintainer-list.nix first
  };
})
