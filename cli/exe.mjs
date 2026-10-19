// dist/ -> standalone executable (Node SEA: the node binary + embedded files).
// Produces a binary for the CURRENT platform; build for others on those platforms (e.g. a CI matrix).
import { copyFileSync, chmodSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inject } from 'postject';

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

export async function buildExe(dist, outFile) {
  const tmp = mkdtempSync(join(tmpdir(), 'slides-sea-'));
  const assets = {};
  for (const p of walk(dist)) assets[relative(dist, p).split(sep).join('/')] = resolve(p);
  const blob = join(tmp, 'sea.blob');
  const cfg = join(tmp, 'sea-config.json');
  writeFileSync(cfg, JSON.stringify({
    main: join(dirname(fileURLToPath(import.meta.url)), 'exe-server.cjs'),
    output: blob, disableExperimentalSEAWarning: true, assets,
  }));
  execFileSync(process.execPath, ['--experimental-sea-config', cfg], { stdio: 'inherit' });

  const exe = process.platform === 'win32' && !outFile.endsWith('.exe') ? `${outFile}.exe` : outFile;
  copyFileSync(process.execPath, exe);
  chmodSync(exe, 0o755);
  const { readFileSync } = await import('node:fs');
  await inject(exe, 'NODE_SEA_BLOB', readFileSync(blob), {
    sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
  });
  return exe;
}
