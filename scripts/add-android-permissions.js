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
// Add keyboard|keyboardHidden to configChanges on the main Activity
if (manifest.includes('android:configChanges=') && !manifest.includes('keyboard|keyboardHidden')) {
    manifest = manifest.replace(
        /android:configChanges="([^"]*)"/,
        (match, existing) => `android:configChanges="${existing}|keyboard|keyboardHidden"`
    );
    changed = true;
    console.log('Added keyboard|keyboardHidden to configChanges.');
} else if (!manifest.includes('android:configChanges=') && manifest.includes('<activity')) {
    manifest = manifest.replace(
        '<activity',
        '<activity android:configChanges="keyboard|keyboardHidden"'
    );
    changed = true;
    console.log('Added configChanges with keyboard|keyboardHidden to activity.');
} else if (manifest.includes('keyboard|keyboardHidden')) {
    console.log('configChanges already includes keyboard|keyboardHidden.');
}

if (changed) {
    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('AndroidManifest.xml updated.');
} else {
    console.log('All permissions and config already present.');
}
