/**
 * Post-asset-generation script: fixes Android adaptive icon configuration.
 *
 * Fixes applied after `npx capacitor-assets generate --android`:
 * 1. Rewrites adaptive icon XMLs to use @color/ic_launcher_background (red)
 *    instead of a drawable PNG, and adds monochrome layer for Material You.
 * 2. Sets the background color resource to #E53935 (red).
 * 3. Creates themed icon XML for Material You / Monet theming (API 33+).
 * 4. Regenerates foreground PNGs from build/icon-foreground.svg with correct
 *    adaptive icon padding (108dp canvas, brain in 72dp safe zone), overwriting
 *    the tightly-cropped versions that capacitor-assets may generate.
 * 5. Generates monochrome PNGs from build/icon-monochrome.svg.
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

// ---- 1. Rewrite adaptive icon XMLs with correct layers ----
// capacitor-assets may generate foreground PNGs that are tightly cropped (no padding),
// and background as a drawable PNG instead of our red color resource.
// We overwrite the XMLs to ensure correct references.

const iconXmlDir = path.join(androidRes, 'mipmap-anydpi-v26');
const xmlFiles = ['ic_launcher.xml', 'ic_launcher_round.xml'];

const correctAdaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;

for (const file of xmlFiles) {
    const xmlPath = path.join(iconXmlDir, file);
    if (!fs.existsSync(xmlPath)) continue;

    fs.writeFileSync(xmlPath, correctAdaptiveXml, 'utf8');
    console.log(`${file}: rewritten with correct background color and monochrome layer.`);
}

// ---- 1b. Ensure adaptive icon background color is red ----

const valuesDir = path.join(androidRes, 'values');
fs.mkdirSync(valuesDir, { recursive: true });
const colorsXmlPath = path.join(valuesDir, 'ic_launcher_background.xml');
const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#E53935</color>
</resources>
`;
fs.writeFileSync(colorsXmlPath, colorsXml, 'utf8');
console.log('ic_launcher_background color set to #E53935 (red).');

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

// ---- 3. Generate PNGs from SVG sources using sharp library ----

const monoSvg = path.join(__dirname, '..', 'build', 'icon-monochrome.svg');
const fgSvg = path.join(__dirname, '..', 'build', 'icon-foreground.svg');

let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.warn('Warning: sharp is not installed. Skipping PNG generation from SVGs.');
    console.warn('Run "npm install --save-dev sharp" to enable icon generation.');
    console.log('\nDone! Adaptive icons patched (XML only).');
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
    // ---- 3a. Regenerate foreground PNGs from icon-foreground.svg ----
    // This overwrites the foreground PNGs that capacitor-assets may have generated
    // incorrectly (tightly cropped brain without proper adaptive icon padding).
    if (fs.existsSync(fgSvg)) {
        const fgBuffer = fs.readFileSync(fgSvg);
        for (const { size, dpi } of densities) {
            const outDir = path.join(androidRes, `drawable-${dpi}`);
            fs.mkdirSync(outDir, { recursive: true });
            const outFile = path.join(outDir, 'ic_launcher_foreground.png');
            try {
                await sharp(fgBuffer)
                    .resize(size, size)
                    .png()
                    .toFile(outFile);
                console.log(`drawable-${dpi}/ic_launcher_foreground.png: regenerated (${size}x${size}).`);
            } catch (e) {
                console.warn(`Warning: could not generate ${dpi} foreground PNG: ${e.message}`);
            }
        }
    } else {
        console.log('build/icon-foreground.svg not found — skipping foreground PNG regeneration.');
    }

    // ---- 3b. Generate monochrome PNGs from icon-monochrome.svg ----
    if (fs.existsSync(monoSvg)) {
        const monoBuffer = fs.readFileSync(monoSvg);
        for (const { size, dpi } of densities) {
            const outDir = path.join(androidRes, `drawable-${dpi}`);
            fs.mkdirSync(outDir, { recursive: true });
            const outFile = path.join(outDir, 'ic_launcher_monochrome.png');
            try {
                await sharp(monoBuffer)
                    .resize(size, size)
                    .png()
                    .toFile(outFile);
                console.log(`drawable-${dpi}/ic_launcher_monochrome.png: generated (${size}x${size}).`);
            } catch (e) {
                console.warn(`Warning: could not generate ${dpi} monochrome PNG: ${e.message}`);
            }
        }
    } else {
        console.log('build/icon-monochrome.svg not found — skipping monochrome PNG generation.');
    }

    console.log('\nDone! Adaptive icons patched for Material You / Monet support.');
})();
