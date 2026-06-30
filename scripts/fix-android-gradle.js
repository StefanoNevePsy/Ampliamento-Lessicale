/**
 * Post-sync: make the Android build survive large model assets.
 *  - Raise the Gradle JVM heap (default OOMs on big assets).
 *  - Skip compression of .onnx/.onnx_data (AAPT compressing 100s of MB is what
 *    actually runs out of memory) and let them be served/stored uncompressed.
 *
 * Idempotent; no-ops if android/ is missing.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const androidDir = path.join(root, 'android');
if (!fs.existsSync(androidDir)) {
    console.log('[gradle] android/ not found — skipping.');
    process.exit(0);
}

// 1) Gradle JVM heap in android/gradle.properties
const gpPath = path.join(androidDir, 'gradle.properties');
const WANT_XMX = 6144; // MB
try {
    let gp = fs.existsSync(gpPath) ? fs.readFileSync(gpPath, 'utf8') : '';
    const desired = `org.gradle.jvmargs=-Xmx${WANT_XMX}m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8`;
    if (/^org\.gradle\.jvmargs=.*$/m.test(gp)) {
        const cur = gp.match(/^org\.gradle\.jvmargs=.*-Xmx(\d+)m.*$/m);
        const curXmx = cur ? parseInt(cur[1]) : 0;
        if (curXmx < WANT_XMX) {
            gp = gp.replace(/^org\.gradle\.jvmargs=.*$/m, desired);
            fs.writeFileSync(gpPath, gp, 'utf8');
            console.log(`[gradle] Raised JVM heap to ${WANT_XMX}m.`);
        } else {
            console.log('[gradle] JVM heap already sufficient.');
        }
    } else {
        gp += (gp.endsWith('\n') || gp === '' ? '' : '\n') + desired + '\n';
        fs.writeFileSync(gpPath, gp, 'utf8');
        console.log(`[gradle] Set JVM heap to ${WANT_XMX}m.`);
    }
} catch (e) { console.log('[gradle] Could not update gradle.properties:', e.message); }

// 2) noCompress for model files in app/build.gradle
const bgPath = path.join(androidDir, 'app', 'build.gradle');
try {
    if (fs.existsSync(bgPath)) {
        let bg = fs.readFileSync(bgPath, 'utf8');
        if (!bg.includes('androidResources') || !/noCompress/.test(bg)) {
            // Insert an androidResources block right after "android {"
            bg = bg.replace(/android\s*\{/, m =>
                `${m}\n    androidResources {\n        noCompress += ['onnx', 'onnx_data', 'tflite', 'bin']\n    }`);
            fs.writeFileSync(bgPath, bg, 'utf8');
            console.log('[gradle] Added noCompress for model assets.');
        } else {
            console.log('[gradle] noCompress already present.');
        }
    }
} catch (e) { console.log('[gradle] Could not update app/build.gradle:', e.message); }

console.log('[gradle] Done.');
