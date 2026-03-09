/**
 * Post-asset-generation script: patches Android adaptive icon XMLs
 * to include monochrome layer for Material You / Monet theming (API 33+),
 * and generates monochrome PNGs from build/icon-monochrome.svg.
 *
 * Run after `npx capacitor-assets generate --android` or `npx cap sync`.
 *
 * Usage: node scripts/fix-adaptive-icons.js
 */
const fs = require('fs');
const path = require('path');

const androidRes = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(androidRes)) {
    console.log('android/app/src/main/res not found — skipping icon patching.');
    process.exit(0);
}

// ---- 1. Patch adaptive icon XMLs to add <monochrome> ----

const iconXmlDir = path.join(androidRes, 'mipmap-anydpi-v26');
const xmlFiles = ['ic_launcher.xml', 'ic_launcher_round.xml'];

for (const file of xmlFiles) {
    const xmlPath = path.join(iconXmlDir, file);
    if (!fs.existsSync(xmlPath)) continue;

    let xml = fs.readFileSync(xmlPath, 'utf8');

    if (xml.includes('monochrome')) {
        console.log(`${file}: monochrome layer already present.`);
        continue;
    }

    // Insert <monochrome> before closing </adaptive-icon>
    xml = xml.replace(
        '</adaptive-icon>',
        '    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>\n</adaptive-icon>'
    );

    fs.writeFileSync(xmlPath, xml, 'utf8');
    console.log(`${file}: added monochrome layer.`);
}

// ---- 2. Create themed icon XML (uses monochrome for both fg and mono) ----

const themedXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_monochrome"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;

if (fs.existsSync(iconXmlDir)) {
    fs.writeFileSync(path.join(iconXmlDir, 'ic_launcher_themed.xml'), themedXml, 'utf8');
    console.log('ic_launcher_themed.xml: created.');
}

// ---- 3. Generate monochrome PNGs from SVG using sharp library ----

const monoSvg = path.join(__dirname, '..', 'build', 'icon-monochrome.svg');
if (!fs.existsSync(monoSvg)) {
    console.log('build/icon-monochrome.svg not found — skipping monochrome PNG generation.');
    console.log('Monochrome PNGs must be placed manually in drawable-*/ic_launcher_monochrome.png');
    process.exit(0);
}

let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.warn('Warning: sharp is not installed. Skipping monochrome PNG generation.');
    console.warn('Run "npm install --save-dev sharp" to enable monochrome icon generation.');
    console.log('\nDone! Adaptive icons patched for Material You / Monet support.');
    process.exit(0);
}

const densities = [
    { size: 108, dpi: 'mdpi' },
    { size: 162, dpi: 'hdpi' },
    { size: 216, dpi: 'xhdpi' },
    { size: 324, dpi: 'xxhdpi' },
    { size: 432, dpi: 'xxxhdpi' },
];

(async () => {
    const svgBuffer = fs.readFileSync(monoSvg);
    for (const { size, dpi } of densities) {
        const outDir = path.join(androidRes, `drawable-${dpi}`);
        fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, 'ic_launcher_monochrome.png');
        try {
            await sharp(svgBuffer)
                .resize(size, size)
                .png()
                .toFile(outFile);
            console.log(`drawable-${dpi}/ic_launcher_monochrome.png: generated (${size}x${size}).`);
        } catch (e) {
            console.warn(`Warning: could not generate ${dpi} monochrome PNG: ${e.message}`);
        }
    }
    console.log('\nDone! Adaptive icons patched for Material You / Monet support.');
})();
