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

// Larger Java heap: helps transient allocations during native model load / NNAPI
// compilation (the ONNX weights themselves are mmapped off-heap by ORT).
if (!manifest.includes('android:largeHeap')) {
    manifest = manifest.replace(/<application\b/, '<application android:largeHeap="true"');
    changed = true;
    console.log('Enabled android:largeHeap on <application>.');
}

// Prevent Activity restart on external keyboard connect/disconnect (Smart Book Cover etc.)
// keyboard|keyboardHidden  — physical keyboard attached/detached
// navigation — trackpad / pointing device on the cover
const extraConfigFlags = ['keyboard', 'keyboardHidden', 'navigation'];

// Flags that are no longer valid in newer compileSdk (35+).
// NOTE: 'locale' IS valid for configChanges — there is no 'locales' value, so it
// must NOT be rewritten (doing so breaks the manifest/gradle build).
const deprecatedFlags = ['navigationHidden'];
const deprecatedReplacements = { navigationHidden: null };

if (manifest.includes('android:configChanges=')) {
    // First: fix deprecated flags (e.g. navigationHidden -> removed)
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

// --- Add intent-filter for receiving shared files (.tashare, .zip) ---
// This allows Nearby Share / Quick Share to open files directly in the app
const intentFilterBlock = `
                <!-- VIEW: file:// URIs with .tashare extension -->
                <intent-filter>
                    <action android:name="android.intent.action.VIEW" />
                    <category android:name="android.intent.category.DEFAULT" />
                    <category android:name="android.intent.category.BROWSABLE" />
                    <data android:scheme="file" />
                    <data android:host="*" />
                    <data android:mimeType="*/*" />
                    <data android:pathPattern=".*\\.tashare" />
                </intent-filter>
                <!-- VIEW: content:// URIs (Quick Share sends content URIs where pathPattern cannot match,
                     so we match on MIME types the OS assigns to our files) -->
                <intent-filter>
                    <action android:name="android.intent.action.VIEW" />
                    <category android:name="android.intent.category.DEFAULT" />
                    <category android:name="android.intent.category.BROWSABLE" />
                    <data android:scheme="content" />
                    <data android:mimeType="application/octet-stream" />
                </intent-filter>
                <intent-filter>
                    <action android:name="android.intent.action.VIEW" />
                    <category android:name="android.intent.category.DEFAULT" />
                    <category android:name="android.intent.category.BROWSABLE" />
                    <data android:scheme="content" />
                    <data android:mimeType="application/zip" />
                </intent-filter>
                <intent-filter>
                    <action android:name="android.intent.action.VIEW" />
                    <category android:name="android.intent.category.DEFAULT" />
                    <category android:name="android.intent.category.BROWSABLE" />
                    <data android:scheme="content" />
                    <data android:mimeType="application/x-zip-compressed" />
                </intent-filter>
                <!-- SEND: Nearby Share / Quick Share file receiving -->
                <intent-filter>
                    <action android:name="android.intent.action.SEND" />
                    <category android:name="android.intent.category.DEFAULT" />
                    <data android:mimeType="application/octet-stream" />
                </intent-filter>
                <intent-filter>
                    <action android:name="android.intent.action.SEND" />
                    <category android:name="android.intent.category.DEFAULT" />
                    <data android:mimeType="application/zip" />
                </intent-filter>
                <intent-filter>
                    <action android:name="android.intent.action.SEND" />
                    <category android:name="android.intent.category.DEFAULT" />
                    <data android:mimeType="application/x-zip-compressed" />
                </intent-filter>
                <intent-filter>
                    <action android:name="android.intent.action.SEND" />
                    <category android:name="android.intent.category.DEFAULT" />
                    <data android:mimeType="*/*" />
                </intent-filter>
`;

if (!manifest.includes('android.intent.action.SEND') || !manifest.includes('.tashare')) {
    // Insert intent-filters inside the main <activity> block, before </activity>
    if (manifest.includes('</activity>')) {
        manifest = manifest.replace(
            '</activity>',
            intentFilterBlock + '\n            </activity>'
        );
        changed = true;
        console.log('Added intent-filters for .tashare and .zip file receiving.');
    }
}

// --- Add FileProvider for content:// URI access ---
const fileProviderBlock = `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>`;

if (!manifest.includes('FileProvider') && !manifest.includes('fileprovider')) {
    if (manifest.includes('</application>')) {
        manifest = manifest.replace(
            '</application>',
            fileProviderBlock + '\n    </application>'
        );
        changed = true;
        console.log('Added FileProvider for content URI access.');
    }
}

// --- Create file_paths.xml for FileProvider ---
const xmlDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'xml');
const filePathsXml = path.join(xmlDir, 'file_paths.xml');
if (!fs.existsSync(filePathsXml)) {
    if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });
    fs.writeFileSync(filePathsXml, `<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="cache" path="." />
    <external-cache-path name="external_cache" path="." />
    <files-path name="files" path="." />
    <external-files-path name="external_files" path="." />
</paths>
`, 'utf8');
    console.log('Created file_paths.xml for FileProvider.');
}

if (changed) {
    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('AndroidManifest.xml updated.');
} else {
    console.log('All permissions and config already present.');
}
