#!/usr/bin/env node
/**
 * Compone custode/custode-completo.gs: logica (core.js) + collegamento a
 * Google (Code.gs) in un unico file, da incollare così com'è nell'editor di
 * Apps Script al posto di Code.gs.
 *
 *   node tools/componi-custode.js           scrive il file
 *   node tools/componi-custode.js --verifica  controlla che sia aggiornato (CI)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'custode');
const core = fs.readFileSync(path.join(dir, 'core.js'), 'utf8');
const code = fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8');
const testo =
`// ============================================================================
// Custode dell'edizione Centro TICE — FILE UNICO DA INCOLLARE IN APPS SCRIPT
// Generato da tools/componi-custode.js: non modificarlo a mano, modifica
// custode/core.js e custode/Code.gs e rigeneralo.
// ============================================================================

${code.trim()}

// ============================================================================
// Logica del custode (custode/core.js)
// ============================================================================

${core.trim()}
`;
const dest = path.join(dir, 'custode-completo.gs');
if (process.argv.includes('--verifica')) {
  const attuale = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  if (attuale !== testo) { console.error('custode/custode-completo.gs non è aggiornato: esegui node tools/componi-custode.js'); process.exit(1); }
  console.log('custode-completo.gs aggiornato');
} else {
  fs.writeFileSync(dest, testo);
  console.log('Scritto ' + path.relative(process.cwd(), dest) + ' (' + Math.round(testo.length / 1024) + ' KB)');
}
