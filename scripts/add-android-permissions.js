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
// navigation — trackpad / pointing device on the cover
const extraConfigFlags = ['keyboard', 'keyboardHidden', 'navigation'];

// Flags that are no longer valid in newer compileSdk (35+)
const deprecatedFlags = ['locale', 'navigationHidden'];
const deprecatedReplacements = { locale: 'locales', navigationHidden: null };

if (manifest.includes('android:configChanges=')) {
    // First: fix deprecated flags (e.g. locale -> locales)
    manifest = manifest.replace(
        /android:configChanges="([^"]*)"/,
        (match, existing) => {
            let flags = existing.split('|').map(f => f.trim()).filter(Boolean);
            let replaced = false;
            for (const dep of deprecatedFlags) {
                const idx = flags.indexOf(dep);
                if (idx !== -1) {
                    const replacement = deprecatedReplacements[dep];
                    flags.splice(idx, 1);
                    if (replacement && !flags.includes(replacement)) {
                        flags.splice(idx, 0, replacement);
                    }
                    replaced = true;
                    console.log(`Replaced deprecated configChanges flag '${dep}' with '${replacement || '(removed)'}'.`);
                }
            }
            // Remove duplicates while preserving order
            flags = [...new Set(flags)];
            if (replaced) changed = true;
            return `android:configChanges="${flags.join('|')}"`;
        }
    );

    // Then: add missing extra flags
    const missing = extraConfigFlags.filter(f => {
        const re = new RegExp('android:configChanges="[^"]*(?:^"|\\|)' + f + '(?:\\||")');
        // Simple check: split the value and look for exact match
        const m = manifest.match(/android:configChanges="([^"]*)"/);
        if (!m) return true;
        const flags = m[1].split('|');
        return !flags.includes(f);
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
