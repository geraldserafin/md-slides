# Nix

`nix run github:geraldserafin/md-slides -- new my-talk` runs slideit from this repository; `nix build` builds it
(`flake.nix` → `nix/package.nix`). The package is `buildNpmPackage` over the npm package: it builds `lib/` and the prebuilt
viewers (`npm run build:package`) and wraps `slides` / `slideit` with `CHROMIUM` set for the pdf target
(`withPdf = false` leaves Chromium out).

## Getting it into nixpkgs

`nix/package.nix` is written for nixpkgs (callPackage, `finalAttrs`, `nix-update-script`). To submit it:

1. Tag a release (`git tag v0.1.0 && git push --tags`); the package version must match the tag.
2. In a nixpkgs checkout, copy it to `pkgs/by-name/sl/slideit/package.nix`. Drop the `localSource` argument and keep the
   `fetchFromGitHub` source; get its hash with `nix-prefetch-github geraldserafin md-slides --rev v0.1.0` (or build once with
   `lib.fakeHash` and copy the hash from the error).
3. Add yourself to `maintainers/maintainer-list.nix` and to `meta.maintainers`.
4. `nix-build -A slideit`, then run `result/bin/slides new /tmp/x && result/bin/slides build /tmp/x -o /tmp/x-site`.
   `nixpkgs-review wip` checks the dependents.
5. Commit as `slideit: init at 0.1.0` and open the pull request. Later versions: `nix-update slideit`
   (it updates `version`, `hash` and `npmDepsHash`).

`npmDepsHash` here is for this repository's `package-lock.json`; refresh it with
`nix run nixpkgs#prefetch-npm-deps -- package-lock.json` whenever the lock file changes.
