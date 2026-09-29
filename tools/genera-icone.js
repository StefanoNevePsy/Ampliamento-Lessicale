#!/usr/bin/env node
/**
 * Logo e icone dell'edizione Centro TICE, tutti da un'unica geometria.
 *
 *   npm install --no-save sharp   (se non c'è già)
 *   node tools/genera-icone.js
 *
 * Il logo è ridisegnato con forme esatte a partire dal tracciato fornito dal
 * centro (img/tice/logo-tracciato-originale.svg): stesse proporzioni, bordi
 * puliti a qualunque dimensione. Colori del centro: antracite, con il punto
 * della "i" arancio come unico accento.
 *
 * Produce:
 *   img/tice/logo*.svg|png        logo per l'app (chiaro, scuro, monocromatico)
 *   img/tice/icona*.png, favicon  icone della PWA (any, maskable, Apple, favicon)
 *   build/icon*.svg, icon.png     sorgenti per i workflow di GitHub (macOS, Windows, Android)
 *   build/icon.ico, icon.icns     Windows e macOS fino alla 15
 *   build/CentroTICE.icon/        icona a livelli per macOS 26+ (Icon Composer):
 *                                 chiara, scura, trasparente e colorata dal sistema
 *   resources/*.png               sorgenti per @capacitor/assets
 * Le icone adattive Android (sfondo, primo piano, monocromatica per Material You)
 * vengono dagli SVG in build/ tramite scripts/fix-adaptive-icons.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const R = path.join(__dirname, '..');
const scrivi = (rel, dati) => { const f = path.join(R, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, dati); };

// ---------------------------------------------------------------------------
// Colori e geometria (riquadro 514 × 514, come il tracciato originale)
// ---------------------------------------------------------------------------
const COL = { antracite: '#363a43', antraciteAlto: '#41464f', antraciteBasso: '#2c2f36', scuro: '#1d2025', acqua: '#39b2ad', arancio: '#fb8e28', bianco: '#ffffff', chiaro: '#eceef1' };
const LATO = 514;
const FORME = {
  // T: barra 254 × 62, gamba larga 20
  t: 'M0 0H254V62H142V252H122V62H0Z',
  // E con la gamba della "i" che la raggiunge dall'alto
  e: 'M262 260H375V112H400V260H514V287H323V371H514V392H323V442H514V514H262Z',
  // C: falce tra due cerchi (r 124,4 e 117), stimati dal tracciato
  c: 'M112.8 253.1A124.4 124.4 0 1 0 245.7 431A117 117 0 1 1 112.8 253.1Z',
};
const PUNTO = { cx: 384.4, cy: 36.3, r: 31.3 };

/** Il marchio in un riquadro di lato `lato`, con il vertice in alto a sinistra in (x, y). */
function marchio({ lato, x, y, colore, punto }) {
  const s = (lato / LATO).toFixed(5);
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s})">` +
    `<path fill="${colore}" d="${FORME.t}"/><path fill="${colore}" d="${FORME.e}"/><path fill="${colore}" d="${FORME.c}"/>` +
    `<circle fill="${punto || colore}" cx="${PUNTO.cx}" cy="${PUNTO.cy}" r="${PUNTO.r}"/></g>`;
}
const centrato = (canvas, frazione, colore, punto) => {
  const lato = canvas * frazione;
  return marchio({ lato, x: (canvas - lato) / 2, y: (canvas - lato) / 2, colore, punto });
};
const svg = (w, h, corpo, extra) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${extra || ''}>${corpo}</svg>\n`;
const sfumatura = (id, alto, basso) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${alto}"/><stop offset="1" stop-color="${basso}"/></linearGradient></defs>`;

// ---------------------------------------------------------------------------
// Sorgenti SVG
// ---------------------------------------------------------------------------
const S = {};
// Logo per l'app, senza margini
S['img/tice/logo-scuro.svg'] = svg(LATO, LATO, marchio({ lato: LATO, x: 0, y: 0, colore: COL.antracite, punto: COL.arancio }));   // su sfondi chiari
S['img/tice/logo-bianco.svg'] = svg(LATO, LATO, marchio({ lato: LATO, x: 0, y: 0, colore: COL.bianco, punto: COL.arancio }));    // su sfondi scuri
S['img/tice/logo.svg'] = svg(LATO, LATO, marchio({ lato: LATO, x: 0, y: 0, colore: 'currentColor' }));                           // monocromatico

// Icona piena (quadrato: la forma la dà il sistema)
S['img/tice/icona.svg'] = svg(1024, 1024, sfumatura('f', COL.antraciteAlto, COL.antraciteBasso) + '<rect width="1024" height="1024" fill="url(#f)"/>' + centrato(1024, 0.6, COL.bianco, COL.arancio));
// Maskable: il marchio sta nella zona sicura (cerchio dell'80%)
S['img/tice/icona-maskable.svg'] = svg(1024, 1024, `<rect width="1024" height="1024" fill="${COL.antracite}"/>` + centrato(1024, 0.5, COL.bianco, COL.arancio));
// Quadrato arrotondato: PWA "any" su desktop, Windows, favicon
const arrotondata = (frazione) => svg(1024, 1024, sfumatura('f', COL.antraciteAlto, COL.antraciteBasso) +
  '<rect width="1024" height="1024" rx="225" fill="url(#f)"/>' + centrato(1024, frazione, COL.bianco, COL.arancio));
S['img/tice/icona-arrotondata.svg'] = arrotondata(0.62);
S['img/tice/favicon.svg'] = svg(64, 64, `<rect width="64" height="64" rx="14" fill="${COL.antracite}"/>` + centrato(64, 0.7, COL.bianco, COL.arancio));

// macOS fino alla 15: quadrato arrotondato 824 su tela 1024, con ombra leggera
const ombra = '<filter id="o" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="14"/></filter>';
const mac = (alto, basso, colore, punto) => svg(1024, 1024,
  `<defs>${ombra}<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${alto}"/><stop offset="1" stop-color="${basso}"/></linearGradient></defs>` +
  '<rect x="100" y="112" width="824" height="824" rx="185" fill="#000" opacity=".28" filter="url(#o)"/>' +
  '<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#f)"/>' +
  marchio({ lato: 470, x: 277, y: 277, colore, punto }));
S['build/icon.svg'] = mac(COL.antraciteAlto, COL.antraciteBasso, COL.bianco, COL.arancio);
S['build/icon-dark.svg'] = mac('#272a30', '#15171a', COL.chiaro, COL.arancio);
// Colorata dal sistema (macOS "tinted"): solo la forma, bianca su trasparente
S['build/icon-tinted.svg'] = svg(1024, 1024, marchio({ lato: 470, x: 277, y: 277, colore: COL.bianco }));

// Android adattiva: tela 108 dp, zona sicura cerchio di 66 dp → marchio di 44 dp
S['build/icon-foreground.svg'] = svg(108, 108, centrato(108, 44 / 108, COL.bianco, COL.arancio));
S['build/icon-monochrome.svg'] = svg(108, 108, centrato(108, 44 / 108, COL.bianco));
S['build/icon-background.svg'] = svg(108, 108, `<rect width="108" height="108" fill="${COL.antracite}"/>`);

// macOS 26+ (Icon Composer): livelli separati su tela 1024; sfondo, ombre,
// vetro e varianti chiara/scura/colorata le applica il sistema.
const livello = (corpo) => svg(1024, 1024, corpo);
S['build/CentroTICE.icon/Assets/tice.svg'] = livello(marchio({ lato: 560, x: 232, y: 232, colore: COL.bianco, punto: 'none' }).replace(/<circle[^>]*\/>/, ''));
S['build/CentroTICE.icon/Assets/punto.svg'] = livello(`<g transform="translate(232 232) scale(${(560 / LATO).toFixed(5)})"><circle fill="${COL.arancio}" cx="${PUNTO.cx}" cy="${PUNTO.cy}" r="${PUNTO.r}"/></g>`);
const srgb = (hex) => 'srgb:' + [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(5)).join(',') + ',1.00000';
const iconJson = {
  fill: { 'linear-gradient': [srgb(COL.antraciteAlto), srgb(COL.antraciteBasso)], orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 0.7 } } },
  'fill-specializations': [{ appearance: 'dark', value: { 'linear-gradient': [srgb('#272a30'), srgb('#15171a')], orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 0.7 } } } }],
  groups: [
    {
      name: 'marchio',
      layers: [
        { name: 'punto', 'image-name': 'punto.svg', glass: true },
        { name: 'tice', 'image-name': 'tice.svg', glass: true },
      ],
      shadow: { kind: 'neutral', opacity: 0.5 },
      translucency: { enabled: true, value: 0.4 },
      specular: true,
    },
  ],
  'supported-platforms': { squares: 'shared' },
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const png = (svgTesto, lato) => sharp(Buffer.from(svgTesto), { density: 72 * Math.max(1, lato / 128) }).resize(lato, lato).png({ compressionLevel: 9 }).toBuffer();

// ICO (Windows) e ICNS (macOS) con immagini PNG dentro: formati semplici, scritti a mano
function ico(pngs) {
  const n = pngs.length, testa = Buffer.alloc(6 + 16 * n);
  testa.writeUInt16LE(0, 0); testa.writeUInt16LE(1, 2); testa.writeUInt16LE(n, 4);
  let off = testa.length;
  pngs.forEach(({ lato, buf }, i) => {
    const d = 6 + 16 * i;
    testa.writeUInt8(lato >= 256 ? 0 : lato, d); testa.writeUInt8(lato >= 256 ? 0 : lato, d + 1);
    testa.writeUInt16LE(1, d + 4); testa.writeUInt16LE(32, d + 6);
    testa.writeUInt32LE(buf.length, d + 8); testa.writeUInt32LE(off, d + 12);
    off += buf.length;
  });
  return Buffer.concat([testa, ...pngs.map((p) => p.buf)]);
}
function icns(voci) {
  const pezzi = voci.map(({ tipo, buf }) => { const h = Buffer.alloc(8); h.write(tipo, 0, 'ascii'); h.writeUInt32BE(buf.length + 8, 4); return Buffer.concat([h, buf]); });
  const tot = pezzi.reduce((n, b) => n + b.length, 8), h = Buffer.alloc(8);
  h.write('icns', 0, 'ascii'); h.writeUInt32BE(tot, 4);
  return Buffer.concat([h, ...pezzi]);
}

(async () => {
  for (const [f, t] of Object.entries(S)) scrivi(f, t);
  scrivi('build/CentroTICE.icon/icon.json', JSON.stringify(iconJson, null, 2) + '\n');

  const out = [
    ['img/tice/logo-scuro.png', S['img/tice/logo-scuro.svg'], 512],
    ['img/tice/logo-bianco.png', S['img/tice/logo-bianco.svg'], 512],
    ['img/tice/icona-192.png', S['img/tice/icona-arrotondata.svg'], 192],
    ['img/tice/icona-512.png', S['img/tice/icona-arrotondata.svg'], 512],
    ['img/tice/icona-maskable-512.png', S['img/tice/icona-maskable.svg'], 512],
    ['img/tice/apple-touch-icon.png', S['img/tice/icona.svg'], 180],
    ['img/tice/favicon.png', S['img/tice/favicon.svg'], 48],
    ['build/icon.png', S['build/icon.svg'], 1024],
    ['resources/icon.png', S['img/tice/icona.svg'], 1024],
    ['resources/icon-foreground.png', svg(1024, 1024, centrato(1024, 44 / 108, COL.bianco, COL.arancio)), 1024],
    ['resources/icon-background.png', svg(1024, 1024, `<rect width="1024" height="1024" fill="${COL.antracite}"/>`), 1024],
  ];
  for (const [f, s, lato] of out) scrivi(f, await png(s, lato));

  const win = [];
  for (const lato of [16, 24, 32, 48, 64, 128, 256]) win.push({ lato, buf: await png(S['img/tice/icona-arrotondata.svg'], lato) });
  scrivi('build/icon.ico', ico(win));

  const tipi = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024], ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]];
  const cache = {};
  const voci = [];
  for (const [tipo, lato] of tipi) { cache[lato] = cache[lato] || await png(S['build/icon.svg'], lato); voci.push({ tipo, buf: cache[lato] }); }
  scrivi('build/icon.icns', icns(voci));

  console.log(`Generati ${Object.keys(S).length} SVG, ${out.length} PNG, icon.ico, icon.icns e CentroTICE.icon.`);
})().catch((e) => { console.error(e); process.exit(1); });
