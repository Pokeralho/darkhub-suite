// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();

const LIBREOFFICE_MSI = '480FECF759FC6393BD614FBF43753EB95A8198FC1A065D41B727E3B664CD1E59';
const TEXCONV = 'DCFDEC10244E02CF5037FBA089C55FB7E1326B1C8181742D77D15FA5CB5EEF06';
const LIBRAW_ZIP = '1B65EE99C70BA5DDA40D17CE534EDDC6977E09A9D8763AF1E5A75DF541FCF0D8';

describe('converter third-party tools', () => {
  it('fetch scripts pin the reviewed downloads by SHA-256', () => {
    const lo = read('scripts/fetch-libreoffice.ps1');
    expect(lo).toContain(`$Sha256 = '${LIBREOFFICE_MSI}'`);
    expect(lo).toMatch(/\$Url = "https:\/\/downloadarchive\.documentfoundation\.org\//);
    const img = read('scripts/fetch-imagetools.ps1');
    expect(img).toContain(`$TexconvSha256 = '${TEXCONV}'`);
    expect(img).toContain(`$LibRawSha256 = '${LIBRAW_ZIP}'`);
  });

  it('the installer ships them and the release build fetches them', () => {
    const pkg = JSON.parse(read('package.json'));
    const extra = pkg.build.extraResources.map((e: any) => `${e.from}->${e.to}`);
    expect(extra).toContain('vendor/libreoffice->libreoffice');
    expect(extra).toContain('vendor/imagetools->imagetools');
    expect(pkg.scripts.build).toContain('npm run build:libreoffice');
    expect(pkg.scripts.build).toContain('npm run build:imagetools');
    expect(read('.gitignore')).toMatch(/vendor\/libreoffice\//);
  });

  it('the vendored binaries, when present, are the pinned ones', () => {
    const tex = path.join(root, 'vendor', 'imagetools', 'texconv.exe');
    if (fs.existsSync(tex)) expect(sha(tex)).toBe(TEXCONV);
    const lo = path.join(root, 'vendor', 'libreoffice', 'DARKHUB-VERSION.txt');
    if (fs.existsSync(lo)) expect(fs.readFileSync(lo, 'utf8')).toContain(LIBREOFFICE_MSI);
  });
});
