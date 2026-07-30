/**
 * Post-sync injector for the native NPU cutout plugin.
 *
 * Idempotent. Safe to run on every sync — it no-ops if the Android project is
 * missing and skips anything already in place. It:
 *   1) copies native/android/NpuCutoutPlugin.java into the app package
 *   2) registers the plugin in MainActivity (.java or .kt)
 *   3) adds the ONNX Runtime (NNAPI) dependency to app/build.gradle
 *   4) copies any model files from native-models/ into android assets
 *
 * Run: node scripts/add-native-npu.js
 * See NATIVE_NPU.md for model preparation and the NeuroPilot upgrade path.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const androidDir = path.join(root, 'android');
if (!fs.existsSync(androidDir)) {
    console.log('[npu] android/ not found — run "npx cap add android" first. Skipping.');
    process.exit(0);
}

// Resolve the app package from capacitor.config.json (appId)
let appId = 'com.stimolatore.clinico';
try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
    if (cfg.appId) appId = cfg.appId;
} catch (e) { /* default */ }
const pkgPath = appId.split('.').join('/');
const javaBase = path.join(androidDir, 'app', 'src', 'main', 'java', pkgPath);

let changed = false;

// 1) Copy the plugin source into the app package
const pluginSrc = path.join(root, 'native', 'plugin', 'NpuCutoutPlugin.java');
if (fs.existsSync(pluginSrc) && fs.existsSync(javaBase)) {
    let code = fs.readFileSync(pluginSrc, 'utf8');
    // keep the package line in sync with the actual appId
    code = code.replace(/^package\s+[^;]+;/m, `package ${appId};`);
    const dest = path.join(javaBase, 'NpuCutoutPlugin.java');
    const prev = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
    if (prev !== code) {
        fs.writeFileSync(dest, code, 'utf8');
        console.log('[npu] Wrote NpuCutoutPlugin.java');
        changed = true;
    }
} else {
    console.log('[npu] plugin source or java package dir missing — skipping plugin copy.');
}

// 2) Register the plugin in MainActivity (handle Java and Kotlin templates)
function patchMainActivity() {
    const javaMain = path.join(javaBase, 'MainActivity.java');
    const ktMain = path.join(javaBase, 'MainActivity.kt');
    if (fs.existsSync(javaMain)) {
        let m = fs.readFileSync(javaMain, 'utf8');
        if (m.includes('NpuCutoutPlugin')) return false;
        if (!m.includes('import android.os.Bundle;')) {
            m = m.replace(/(package[^;]+;\s*)/, `$1\nimport android.os.Bundle;\n`);
        }
        // Insert an onCreate that registers the plugin before super.onCreate
        m = m.replace(
            /public class MainActivity extends BridgeActivity\s*\{/,
            `public class MainActivity extends BridgeActivity {\n` +
            `    @Override\n` +
            `    public void onCreate(Bundle savedInstanceState) {\n` +
            `        registerPlugin(NpuCutoutPlugin.class);\n` +
            `        super.onCreate(savedInstanceState);\n` +
            `    }\n`
        );
        fs.writeFileSync(javaMain, m, 'utf8');
        console.log('[npu] Registered plugin in MainActivity.java');
        return true;
    } else if (fs.existsSync(ktMain)) {
        let m = fs.readFileSync(ktMain, 'utf8');
        if (m.includes('NpuCutoutPlugin')) return false;
        if (!m.includes('import android.os.Bundle')) {
            m = m.replace(/(package[^\n]+\n)/, `$1import android.os.Bundle\n`);
        }
        if (/class MainActivity\s*:\s*BridgeActivity\s*\(\s*\)\s*$/m.test(m) ||
            /class MainActivity\s*:\s*BridgeActivity\s*\(\s*\)\s*\{?\s*\}?/.test(m)) {
            m = m.replace(
                /class MainActivity\s*:\s*BridgeActivity\s*\(\s*\)\s*\{?\s*\}?/,
                `class MainActivity : BridgeActivity() {\n` +
                `    override fun onCreate(savedInstanceState: Bundle?) {\n` +
                `        registerPlugin(NpuCutoutPlugin::class.java)\n` +
                `        super.onCreate(savedInstanceState)\n` +
                `    }\n}`
            );
            fs.writeFileSync(ktMain, m, 'utf8');
            console.log('[npu] Registered plugin in MainActivity.kt');
            return true;
        }
        console.log('[npu] MainActivity.kt present but pattern not matched — register the plugin manually.');
        return false;
    }
    console.log('[npu] MainActivity not found — register the plugin manually.');
    return false;
}
if (patchMainActivity()) changed = true;

// 3) Add the ONNX Runtime (NNAPI) dependency to app/build.gradle
const ORT_VERSION = '1.19.2';
const gradlePath = path.join(androidDir, 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
    let g = fs.readFileSync(gradlePath, 'utf8');
    if (!g.includes('onnxruntime-android') || !g.includes('subject-segmentation')) {
        let dep = '';
        if (!g.includes('onnxruntime-android')) {
            dep += `    // Native NPU/GPU background removal (ONNX Runtime + NNAPI)\n` +
                   `    implementation "com.microsoft.onnxruntime:onnxruntime-android:${ORT_VERSION}"\n`;
        }
        if (!g.includes('subject-segmentation')) {
            dep += `    // ML Kit on-device subject segmentation (GPU/NPU, distinguishes subjects)\n` +
                   `    implementation "com.google.mlkit:subject-segmentation:16.0.0-beta1"\n`;
        }
        if (/dependencies\s*\{/.test(g)) {
            g = g.replace(/dependencies\s*\{/, m => `${m}\n${dep}`);
            fs.writeFileSync(gradlePath, g, 'utf8');
            console.log(`[npu] Added native deps (ORT ${ORT_VERSION} + ML Kit subject-segmentation) to app/build.gradle`);
            changed = true;
        } else {
            console.log('[npu] Could not find dependencies{} in app/build.gradle — add deps manually.');
        }
    }
} else {
    console.log('[npu] app/build.gradle not found — skipping ORT dependency.');
}

// 4) Copy model files from native-models/ into android assets
const modelsSrc = path.join(root, 'native-models');
const assetsDir = path.join(androidDir, 'app', 'src', 'main', 'assets');
if (fs.existsSync(modelsSrc)) {
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    let copied = 0;
    for (const f of fs.readdirSync(modelsSrc)) {
        if (!f.endsWith('.onnx')) continue;
        const dst = path.join(assetsDir, f);
        const sSize = fs.statSync(path.join(modelsSrc, f)).size;
        if (!fs.existsSync(dst) || fs.statSync(dst).size !== sSize) {
            fs.copyFileSync(path.join(modelsSrc, f), dst);
            console.log(`[npu] Bundled model asset: ${f} (${(sSize / 1048576).toFixed(1)} MB)`);
            copied++;
        }
    }
    if (copied > 0) changed = true;
    if (copied === 0) console.log('[npu] No new model files to bundle (place *.onnx in native-models/).');
} else {
    console.log('[npu] native-models/ not found — create it and add rmbg-2.0.onnx / rmbg-1.4.onnx to enable native NPU.');
}

console.log(changed ? '[npu] Native NPU plugin wiring updated.' : '[npu] Native NPU plugin already up to date.');
