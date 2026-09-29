/**
 * electron-builder, dopo l'impacchettamento (afterPack).
 *
 * macOS 26 (Tahoe) e successivi usano icone a livelli fatte con Icon Composer
 * (build/CentroTICE.icon): il sistema ne ricava le versioni chiara, scura,
 * trasparente ("clear") e colorata, con l'effetto vetro. Si compilano con
 * `actool` di Xcode 26+ in un Assets.car che va dentro l'app, indicato da
 * CFBundleIconName. L'icona classica (build/icon.icns, CFBundleIconFile) resta
 * per macOS 15 e precedenti.
 *
 * Se sul computer che crea l'installatore non c'è un actool che conosce il
 * formato .icon, si salta questo passo: l'app avrà l'icona classica.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NOME = 'CentroTICE';

exports.default = async function dopoImpacchettamento(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const sorgente = path.join(__dirname, NOME + '.icon');
  if (!fs.existsSync(sorgente)) return;
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  const uscita = fs.mkdtempSync(path.join(os.tmpdir(), 'icona-'));
  try {
    execFileSync('xcrun', [
      'actool', sorgente,
      '--compile', uscita,
      '--app-icon', NOME,
      '--include-all-app-icons',
      '--enable-on-demand-resources', 'NO',
      '--development-region', 'it',
      '--target-device', 'mac',
      '--platform', 'macosx',
      '--minimum-deployment-target', '11.0',
      '--output-partial-info-plist', path.join(uscita, 'parziale.plist'),
      '--output-format', 'human-readable-text', '--errors', '--warnings',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const car = path.join(uscita, 'Assets.car');
    if (!fs.existsSync(car)) throw new Error('actool non ha prodotto Assets.car');
    fs.copyFileSync(car, path.join(app, 'Contents', 'Resources', 'Assets.car'));
    execFileSync('plutil', ['-replace', 'CFBundleIconName', '-string', NOME, path.join(app, 'Contents', 'Info.plist')]);
    console.log('  • icona a livelli per macOS 26+ inclusa (' + NOME + '.icon → Assets.car)');
  } catch (e) {
    const msg = String((e.stderr && e.stderr.toString()) || e.message).trim().split('\n').slice(0, 3).join(' | ');
    console.log('  • icona a livelli per macOS 26+ non inclusa: ' + msg + ' — resta l\'icona classica');
  } finally {
    fs.rmSync(uscita, { recursive: true, force: true });
  }
};
