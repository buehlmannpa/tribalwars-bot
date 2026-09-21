'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

// Auf Apple Silicon verweigert macOS den Start von Programmen ohne jede
// Signatur. Eine Beglaubigung bei Apple kostet ein Entwicklerkonto, eine
// Signatur ohne Zertifikat genuegt aber, damit das Programm ueberhaupt
// startet. Genau die wird hier nach dem Verpacken gesetzt.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--verbose=2', appPath], { stdio: 'inherit' });
  console.log(`  • Signatur ohne Zertifikat gesetzt  app=${appName}`);
};
