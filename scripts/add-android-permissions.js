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

// Prevent Activity restart on external keyboard connect/disconnect (Smart Book Cover etc.)
// keyboard|keyboardHidden  — physical keyboard attached/detached
// navigation|navigationHidden — trackpad / pointing device on the cover
const extraConfigFlags = ['keyboard', 'keyboardHidden', 'navigation', 'navigationHidden'];

if (manifest.includes('android:configChanges=')) {
    const missing = extraConfigFlags.filter(f => {
        // Match the flag as a whole word inside the configChanges attribute value
        const re = new RegExp('android:configChanges="[^"]*(?:^|\\|)' + f + '(?:\\||")');
        return !re.test(manifest);
    });
    if (missing.length > 0) {
        manifest = manifest.replace(
            /android:configChanges="([^"]*)"/,
            (match, existing) => `android:configChanges="${existing}|${missing.join('|')}"`
        );
        changed = true;
        console.log('Added ' + missing.join('|') + ' to configChanges.');
    } else {
        console.log('configChanges already includes all keyboard/navigation flags.');
    }
} else if (manifest.includes('<activity')) {
    manifest = manifest.replace(
        '<activity',
        `<activity android:configChanges="${extraConfigFlags.join('|')}"`
    );
    changed = true;
    console.log('Added configChanges with ' + extraConfigFlags.join('|') + ' to activity.');
}

if (changed) {
    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('AndroidManifest.xml updated.');
} else {
    console.log('All permissions and config already present.');
}
