const { createHash } = require('crypto');
const { readFileSync, writeFileSync, statSync } = require('fs');
const path = require('path');

const exePath = path.join(__dirname, 'dist', 'LevelUpTeacherWidgetSetup.exe');
const pkg = require('./package.json');

const buf = readFileSync(exePath);
const sha512 = createHash('sha512').update(buf).digest('base64');
const size = statSync(exePath).size;

const yml = `version: ${pkg.version}
files:
  - url: LevelUpTeacherWidgetSetup.exe
    sha512: ${sha512}
    size: ${size}
path: LevelUpTeacherWidgetSetup.exe
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;

writeFileSync(path.join(__dirname, 'dist', 'latest.yml'), yml);
console.log(`Generated dist/latest.yml for v${pkg.version}`);
