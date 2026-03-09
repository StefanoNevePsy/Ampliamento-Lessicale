/**
 * Post-sync script: adds required permissions to Android manifest.
 * Run after `npx cap add android` or `npx cap sync`.
 *
 * Usage: node scripts/add-android-permissions.js
 */
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
    console.log('AndroidManifest.xml not found — skipping permission injection.');
    process.exit(0);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

const permissions = [
    'android.permission.CAMERA',
];

let changed = false;
for (const perm of permissions) {
    if (!manifest.includes(perm)) {
        // Insert before the <application tag
        manifest = manifest.replace(
            '<application',
            `<uses-permission android:name="${perm}" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n\n    <application`
        );
        changed = true;
        console.log(`Added permission: ${perm}`);
    }
}

if (changed) {
    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('AndroidManifest.xml updated with camera permissions.');
} else {
    console.log('All permissions already present.');
}
