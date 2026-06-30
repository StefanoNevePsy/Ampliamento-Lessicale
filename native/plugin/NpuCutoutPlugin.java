package com.stimolatore.clinico;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * NpuCutoutPlugin — native subject segmentation accelerated on the device's
 * NPU/GPU via ONNX Runtime + NNAPI (which dispatches supported ops to the
 * MediaTek APU on the Galaxy Tab S11). Returns a grayscale alpha mask; the web
 * layer composites it (cutout or highlight), reusing the existing mask editor.
 *
 * This is a SCAFFOLD: it compiles against onnxruntime-android but must be built
 * and tested on the device. See NATIVE_NPU.md for the NeuroPilot upgrade path.
 *
 * Models are loaded from android assets by name (e.g. "rmbg-2.0.onnx",
 * "rmbg-1.4.onnx"); both can be bundled so the app can fall back between them.
 */
@CapacitorPlugin(name = "NpuCutout")
public class NpuCutoutPlugin extends Plugin {

    private OrtEnvironment env;
    private final HashMap<String, OrtSession> sessions = new HashMap<>();
    private final HashMap<String, Boolean> nnapiUsed = new HashMap<>();
    // Single background thread: keeps heavy model load/inference OFF the UI
    // thread and serializes calls so the model is loaded once and reused
    // (ideal for bulk processing).
    private final ExecutorService exec = Executors.newSingleThreadExecutor();

    private OrtEnvironment env() {
        if (env == null) env = OrtEnvironment.getEnvironment();
        return env;
    }

    // Reusable direct input buffer (reallocated only if a larger size is needed)
    private FloatBuffer reusableInput;
    private int reusableInputCap = -1;
    private FloatBuffer inputBuffer(int floats) {
        if (reusableInput == null || reusableInputCap < floats) {
            reusableInput = ByteBuffer.allocateDirect(floats * 4)
                .order(ByteOrder.nativeOrder()).asFloatBuffer();
            reusableInputCap = floats;
        }
        return reusableInput;
    }

    private OrtSession session(String assetName) throws Exception {
        OrtSession s = sessions.get(assetName);
        if (s != null) return s;
        // Load from a real file path so ORT memory-maps the weights OFF the Java
        // heap. Reading the whole model into a byte[] would OOM the ~256MB heap.
        String modelPath = ensureModelFile(assetName);

        // Try NNAPI (NPU/GPU via the MediaTek APU driver). If session creation
        // fails — e.g. NNAPI's NHWC layout transform needs op kernels the model's
        // opset doesn't provide (the "MaxPool(11)" error on RMBG-1.4) — fall back
        // to a plain CPU session, which keeps the original NCHW graph.
        try {
            OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
            opts.addNnapi();
            s = env().createSession(modelPath, opts);
            sessions.put(assetName, s);
            nnapiUsed.put(assetName, true);
            return s;
        } catch (Throwable nnapiErr) {
            OrtSession.SessionOptions cpuOpts = new OrtSession.SessionOptions();
            s = env().createSession(modelPath, cpuOpts);
            sessions.put(assetName, s);
            nnapiUsed.put(assetName, false);
            return s;
        }
    }

    /**
     * Copy a model from APK assets to a cache file (streamed, small buffer) and
     * return its path. Cached between runs; re-copied only if missing/empty.
     */
    private String ensureModelFile(String assetName) throws Exception {
        File dir = new File(getContext().getCacheDir(), "onnx-models");
        if (!dir.exists()) dir.mkdirs();
        File out = new File(dir, assetName);
        if (out.exists() && out.length() > 0) return out.getAbsolutePath();

        File tmp = new File(dir, assetName + ".tmp");
        InputStream is = getContext().getAssets().open(assetName);
        OutputStream os = new FileOutputStream(tmp);
        try {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = is.read(buf)) != -1) os.write(buf, 0, n);
            os.flush();
        } finally {
            try { is.close(); } catch (Exception ignored) {}
            try { os.close(); } catch (Exception ignored) {}
        }
        if (!tmp.renameTo(out)) {
            // rename can fail across some FS states; fall back to using the tmp file
            return tmp.getAbsolutePath();
        }
        return out.getAbsolutePath();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    /** Load (and cache) a model asset to verify it is bundled and whether NNAPI engaged. */
    @PluginMethod
    public void prepare(PluginCall call) {
        exec.execute(() -> {
            try {
                String assetName = call.getString("assetName", "rmbg-2.0.onnx");
                session(assetName); // throws if the asset is missing or fails to load
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("asset", assetName);
                ret.put("accelerator", Boolean.TRUE.equals(nnapiUsed.get(assetName)) ? "nnapi" : "cpu");
                call.resolve(ret);
            } catch (Throwable e) {
                call.reject("prepare failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void removeBackground(PluginCall call) {
      exec.execute(() -> {
        try {
            String dataUrl = call.getString("image");
            if (dataUrl == null) { call.reject("missing image"); return; }
            String assetName = call.getString("assetName", "rmbg-2.0.onnx");
            int size = call.getInt("size", 1024);
            int outW = call.getInt("width", size);
            int outH = call.getInt("height", size);
            boolean sigmoid = call.getBoolean("sigmoid", true);

            float[] mean = readVec3(call.getArray("mean"), 0.485f, 0.456f, 0.406f);
            float[] std = readVec3(call.getArray("std"), 0.229f, 0.224f, 0.225f);

            // Decode the incoming data URL
            int comma = dataUrl.indexOf(',');
            String b64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
            byte[] imgBytes = Base64.decode(b64, Base64.DEFAULT);
            Bitmap src = BitmapFactory.decodeByteArray(imgBytes, 0, imgBytes.length);
            if (src == null) { call.reject("image decode failed"); return; }
            Bitmap scaled = Bitmap.createScaledBitmap(src, size, size, true);

            // Preprocess: NCHW float, normalized
            int plane = size * size;
            int[] px = new int[plane];
            scaled.getPixels(px, 0, size, 0, 0, size, size);
            // The input bitmaps are no longer needed — free their native memory now.
            if (scaled != src) scaled.recycle();
            src.recycle();

            float[] data = new float[3 * plane];
            for (int i = 0; i < plane; i++) {
                int p = px[i];
                float r = ((p >> 16) & 0xFF) / 255f;
                float g = ((p >> 8) & 0xFF) / 255f;
                float b = (p & 0xFF) / 255f;
                data[i] = (r - mean[0]) / std[0];
                data[plane + i] = (g - mean[1]) / std[1];
                data[2 * plane + i] = (b - mean[2]) / std[2];
            }

            OrtSession sess = session(assetName);
            String inputName = sess.getInputNames().iterator().next();
            // Reuse ONE direct buffer across calls. ORT needs a DIRECT buffer, and
            // allocating a new ~12MB direct buffer per image leaks off-heap memory
            // (GC frees direct buffers lazily) -> eventual native OOM crash.
            FloatBuffer fb = inputBuffer(data.length);
            fb.clear();
            fb.put(data);
            fb.flip(); // limit = data.length, position = 0 (exact slice even if buffer is larger)
            OnnxTensor input = OnnxTensor.createTensor(
                env(), fb, new long[]{1, 3, size, size});
            OrtSession.Result results = sess.run(Collections.singletonMap(inputName, input));
            float[] flat = flatten(results.get(0).getValue(), plane);
            input.close();
            results.close();

            // Auto-detect whether the output needs a sigmoid: if values already
            // sit in [0,1] the model emitted probabilities (apply none); if it
            // emits logits (values outside [0,1]) apply sigmoid. This makes the
            // 'sigmoid' hint robust across RMBG-1.4 (probabilities) and 2.0.
            float mn = Float.POSITIVE_INFINITY, mx = Float.NEGATIVE_INFINITY;
            for (int i = 0; i < plane; i++) { float v = flat[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
            boolean applySig = (mx > 1.0001f || mn < -0.0001f);

            // Build grayscale mask, scale to requested output size
            int[] maskPx = new int[plane];
            for (int i = 0; i < plane; i++) {
                float v = flat[i];
                if (applySig) v = (float) (1.0 / (1.0 + Math.exp(-v)));
                int a = Math.round(v * 255f);
                if (a < 0) a = 0; if (a > 255) a = 255;
                maskPx[i] = (0xFF << 24) | (a << 16) | (a << 8) | a;
            }
            Bitmap maskBmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            maskBmp.setPixels(maskPx, 0, size, 0, 0, size, size);
            Bitmap outBmp = (outW != size || outH != size)
                ? Bitmap.createScaledBitmap(maskBmp, outW, outH, true) : maskBmp;

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            outBmp.compress(Bitmap.CompressFormat.PNG, 100, bos);
            String outB64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
            // Free the mask bitmaps' native memory immediately.
            if (outBmp != maskBmp) outBmp.recycle();
            maskBmp.recycle();

            JSObject ret = new JSObject();
            ret.put("mask", "data:image/png;base64," + outB64);
            ret.put("accelerator", Boolean.TRUE.equals(nnapiUsed.get(assetName)) ? "nnapi" : "cpu");
            call.resolve(ret);
        } catch (Throwable e) {
            // PluginCall.reject has no (String, Throwable) overload; pass the message only.
            call.reject("npu cutout failed: " + e.getMessage());
        }
      });
    }

    private float[] readVec3(JSArray a, float d0, float d1, float d2) {
        try {
            if (a != null && a.length() >= 3) {
                return new float[]{
                    (float) a.getDouble(0), (float) a.getDouble(1), (float) a.getDouble(2)
                };
            }
        } catch (Exception ignored) {}
        return new float[]{d0, d1, d2};
    }

    // ORT may return nested float[1][1][H][W]; flatten to a flat array.
    private float[] flatten(Object value, int expected) {
        float[] out = new float[expected];
        int[] idx = {0};
        flattenInto(value, out, idx);
        return out;
    }
    private void flattenInto(Object v, float[] out, int[] idx) {
        if (v instanceof float[]) {
            for (float f : (float[]) v) { if (idx[0] < out.length) out[idx[0]++] = f; }
        } else if (v instanceof Object[]) {
            for (Object e : (Object[]) v) flattenInto(e, out, idx);
        }
    }
}
