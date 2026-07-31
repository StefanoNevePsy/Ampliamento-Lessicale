"""
Server locale di scontorno per Terapia Attiva — RMBG-2.0 sulla GPU del PC.

Stessa identica logica del tuo script batch (preprocess 1024x1024, sigmoide,
interpolazione del tensore a piena risoluzione, normalizzazione min-max), ma
esposta come endpoint HTTP: l'app manda l'immagine, il PC restituisce la
maschera, e l'app la applica con la sua sfumatura dei bordi.

Cosa cambia rispetto allo script a cartelle:
  - niente copia manuale di file in input/ e output/
  - funziona anche sullo scontorno in blocco di un intero set, dal tablet
  - il modello resta caricato in VRAM tra una richiesta e l'altra

USO
  pip install flask flask-cors torch torchvision transformers pillow
  set HF_TOKEN=hf_...            (Windows CMD)     — MAI dentro il file
  $env:HF_TOKEN="hf_..."         (PowerShell)
  python rmbg_server.py

  Poi in Impostazioni > Immagini > "Scontorno sul PC" incolla l'indirizzo che
  il server stampa all'avvio.

Il token serve solo la prima volta, per scaricare i pesi; dopo restano in cache.
"""

import io
import os
import base64

import torch
import torch.nn.functional as F
from torchvision import transforms
from transformers import AutoModelForImageSegmentation
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

MODEL_ID = os.environ.get("RMBG_MODEL", "briaai/RMBG-2.0")
HF_TOKEN = os.environ.get("HF_TOKEN") or None
PORT = int(os.environ.get("RMBG_PORT", "7865"))

app = Flask(__name__)
CORS(app)  # l'app gira su un'altra origine (file://, https://localhost, LAN)

_model = None
_device = None


def load_model():
    global _model, _device
    if _model is not None:
        return _model
    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[rmbg] dispositivo: {_device}"
          + (f" ({torch.cuda.get_device_name(0)})" if _device.type == "cuda" else ""))
    print(f"[rmbg] carico {MODEL_ID}...")
    _model = AutoModelForImageSegmentation.from_pretrained(
        MODEL_ID, trust_remote_code=True, token=HF_TOKEN
    )
    _model.to(_device)
    _model.eval()
    if _device.type == "cuda":
        _model.half()  # meta' VRAM, stessa qualita' visibile sulle maschere
    print("[rmbg] pronto.")
    return _model


def preprocess_image(im: Image.Image) -> torch.Tensor:
    if len(im.mode) < 3:
        im = im.convert("RGB")
    transform = transforms.Compose([
        transforms.Resize((1024, 1024), interpolation=transforms.InterpolationMode.BILINEAR),
        transforms.ToTensor(),
        transforms.Normalize([0.5, 0.5, 0.5], [1.0, 1.0, 1.0]),
    ])
    return transform(im).unsqueeze(0)


def postprocess_image(result: torch.Tensor, original_size_hw: tuple) -> Image.Image:
    """Logica Ma-Mi ufficiale: sigmoide, resize del tensore, min-max stretch."""
    result = torch.sigmoid(result.float())
    result = F.interpolate(result, size=original_size_hw, mode="bilinear", align_corners=False)
    ma, mi = torch.max(result), torch.min(result)
    if (ma - mi) > 0:
        result = (result - mi) / (ma - mi)
    arr = (result.squeeze() * 255).cpu().numpy().astype("uint8")
    return Image.fromarray(arr, mode="L")


def _decode(data_url: str) -> Image.Image:
    raw = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    return Image.open(io.BytesIO(base64.b64decode(raw)))


def _encode_png(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


@app.get("/health")
def health():
    """L'app chiama questo per dire 'PC collegato' senza caricare il modello."""
    return jsonify(ok=True, model=MODEL_ID, loaded=_model is not None,
                   device=("cuda" if torch.cuda.is_available() else "cpu"))


@app.post("/mask")
def mask():
    """Restituisce la sola maschera in scala di grigi (255 = soggetto).

    E' l'endpoint che usa l'app: la sfumatura dei bordi e la composizione
    restano all'app, cosi' il risultato e' identico agli altri motori.
    """
    payload = request.get_json(silent=True) or {}
    if not payload.get("image"):
        return jsonify(error="manca 'image'"), 400
    model = load_model()
    im = _decode(payload["image"])
    size_hw = (im.height, im.width)
    with torch.no_grad():
        x = preprocess_image(im).to(_device)
        if _device.type == "cuda":
            x = x.half()
        preds = model(x)
        result = (preds[-1] if len(preds) > 1 else preds[0]) if isinstance(preds, (list, tuple)) else preds
        m = postprocess_image(result, size_hw)
    return jsonify(mask=_encode_png(m), width=im.width, height=im.height)


@app.post("/cutout")
def cutout():
    """PNG gia' scontornato, per usarlo fuori dall'app."""
    payload = request.get_json(silent=True) or {}
    if not payload.get("image"):
        return jsonify(error="manca 'image'"), 400
    model = load_model()
    im = _decode(payload["image"])
    size_hw = (im.height, im.width)
    with torch.no_grad():
        x = preprocess_image(im).to(_device)
        if _device.type == "cuda":
            x = x.half()
        preds = model(x)
        result = (preds[-1] if len(preds) > 1 else preds[0]) if isinstance(preds, (list, tuple)) else preds
        m = postprocess_image(result, size_hw)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im.convert("RGB"), mask=m)
    return jsonify(image=_encode_png(out))


if __name__ == "__main__":
    if not HF_TOKEN:
        print("[rmbg] Nessun HF_TOKEN nell'ambiente: va bene se i pesi sono gia' in cache.")
    import socket
    try:
        lan = socket.gethostbyname(socket.gethostname())
    except Exception:
        lan = "IP-DEL-PC"
    print("\n  Da questo PC   ->  http://localhost:%d" % PORT)
    print("  Dal tablet     ->  http://%s:%d   (stessa rete Wi-Fi)\n" % (lan, PORT))
    app.run(host="0.0.0.0", port=PORT, threaded=True)
