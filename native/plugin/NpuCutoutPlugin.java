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
import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.HashMap;

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

    private OrtEnvironment env() {
        if (env == null) env = OrtEnvironment.getEnvironment();
        return env;
    }

    private OrtSession session(String assetName) throws Exception {
        OrtSession s = sessions.get(assetName);
        if (s != null) return s;
        byte[] bytes = readAsset(assetName);
        OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
        boolean nnapi = false;
        try {
            // NNAPI EP -> routes supported ops to the NPU/GPU (MediaTek APU driver)
            opts.addNnapi();
            nnapi = true;
        } catch (Throwable t) {
            // NNAPI unavailable on this device/build: fall back to CPU (XNNPACK)
        }
        s = env().createSession(bytes, opts);
        sessions.put(assetName, s);
        nnapiUsed.put(assetName, nnapi);
        return s;
    }

    private byte[] readAsset(String name) throws Exception {
        java.io.InputStream is = getContext().getAssets().open(name);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
        is.close();
        return bos.toByteArray();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void removeBackground(PluginCall call) {
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
            OnnxTensor input = OnnxTensor.createTensor(
                env(), FloatBuffer.wrap(data), new long[]{1, 3, size, size});
            OrtSession.Result results = sess.run(Collections.singletonMap(inputName, input));
            float[] flat = flatten(results.get(0).getValue(), plane);
            input.close();
            results.close();

            // Build grayscale mask, scale to requested output size
            int[] maskPx = new int[plane];
            for (int i = 0; i < plane; i++) {
                float v = flat[i];
                if (sigmoid) v = (float) (1.0 / (1.0 + Math.exp(-v)));
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

            JSObject ret = new JSObject();
            ret.put("mask", "data:image/png;base64," + outB64);
            ret.put("accelerator", Boolean.TRUE.equals(nnapiUsed.get(assetName)) ? "nnapi" : "cpu");
            call.resolve(ret);
        } catch (Throwable e) {
            call.reject("npu cutout failed: " + e.getMessage(), e);
        }
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
