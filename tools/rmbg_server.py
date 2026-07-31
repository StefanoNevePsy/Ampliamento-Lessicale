"""
Server locale di scontorno per Terapia Attiva — RMBG-2.0 sulla GPU del PC.

Stessa pipeline del tuo script batch (resize 1024, sigmoide, interpolazione del
tensore a piena risoluzione, stretch min-max: e' quella che da' i bordi netti),
ma esposta su HTTP e pensata per preparare set interi.

Tre cose che la rendono piu' veloce dello script a cartelle:
  - usa il modello GIA' scaricato sul PC, senza rete e senza token
  - riceve piu' immagini in una sola richiesta e le passa in GPU in batch
  - tiene il modello in VRAM tra una richiesta e l'altra, e lo scarica da solo
    dopo un periodo di inattivita' (o subito, se glielo chiedi dall'app)

USO
  pip install flask flask-cors torch torchvision transformers pillow
  python rmbg_server.py

  Poi in Impostazioni > Immagini > "Scontorno sul PC" incolla l'indirizzo che
  il server stampa all'avvio, e premi "Prova collegamento".

VARIABILI D'AMBIENTE (tutte facoltative)
  RMBG_MODEL        nome del repo in cache OPPURE percorso di una cartella
                    scaricata a mano (es. F:\\Stable Diffusion\\RMBG-2.0).
                    Default briaai/RMBG-2.0
  RMBG_PORT         default 7865
  RMBG_BATCH        immagini per passata GPU, default 4 (alzalo se hai VRAM)
  RMBG_IDLE_MIN     minuti di inattivita' prima di liberare la VRAM, default 10
                    (0 = non scaricare mai)
  RMBG_ALLOW_DOWNLOAD=1  consente il download se il modello non e' in cache
  HF_TOKEN          serve SOLO al primo download. Mai scriverlo nel file.
"""

import io
import os
import base64
import threading
import time

import torch
import torch.nn.functional as F
from torchvision import transforms
from transformers import AutoModelForImageSegmentation
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

MODEL_ID = os.environ.get("RMBG_MODEL", "briaai/RMBG-2.0")
IS_LOCAL_DIR = os.path.isdir(MODEL_ID)
PORT = int(os.environ.get("RMBG_PORT", "7865"))
BATCH = max(1, int(os.environ.get("RMBG_BATCH", "4")))
IDLE_MIN = float(os.environ.get("RMBG_IDLE_MIN", "10"))
ALLOW_DOWNLOAD = os.environ.get("RMBG_ALLOW_DOWNLOAD", "") == "1"
HF_TOKEN = os.environ.get("HF_TOKEN") or None

app = Flask(__name__)
CORS(app)


@app.after_request
def _private_network(resp):
    """Consente la chiamata da una pagina servita altrove (es. GitHub Pages).

    Chrome non blocca 127.0.0.1 come "contenuto misto" (localhost e' considerato
    attendibile), ma applica Private Network Access: prima della richiesta vera
    manda un preflight che va autorizzato esplicitamente, altrimenti la chiamata
    muore con un errore di rete generico e difficile da diagnosticare.
    """
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp

_model = None
_device = None
_lock = threading.Lock()      # una passata GPU alla volta
_last_use = 0.0

_TRANSFORM = transforms.Compose([
    transforms.Resize((1024, 1024), interpolation=transforms.InterpolationMode.BILINEAR),
    transforms.ToTensor(),
    transforms.Normalize([0.5, 0.5, 0.5], [1.0, 1.0, 1.0]),
])


# --------------------------------------------------------------------------
# Modello: caricamento dalla cache locale, scarico su richiesta o per inattivita'
# --------------------------------------------------------------------------
def load_model():
    """Carica il modello gia' presente sul PC. Niente rete, niente token.

    RMBG_MODEL puo' essere il nome di un repo gia' in cache OPPURE il percorso
    di una cartella scaricata a mano, es. F:\\Stable Diffusion\\RMBG-2.0.
    """
    global _model, _device, _last_use
    _last_use = time.time()
    if _model is not None:
        return _model

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    where = torch.cuda.get_device_name(0) if _device.type == "cuda" else "CPU"
    src = "cartella locale" if IS_LOCAL_DIR else "cache locale"
    print(f"[rmbg] carico {MODEL_ID} dalla {src} su {where}...")

    try:
        m = AutoModelForImageSegmentation.from_pretrained(
            MODEL_ID, trust_remote_code=True, local_files_only=True
        )
    except Exception as e:
        if IS_LOCAL_DIR:
            raise RuntimeError(
                f"La cartella {MODEL_ID} non contiene un modello caricabile ({e}). "
                "Servono config.json, i pesi (.safetensors o .bin) e i moduli .py "
                "del repo, cioe' esattamente quello che scarica from_pretrained."
            )
        if not ALLOW_DOWNLOAD:
            raise RuntimeError(
                f"{MODEL_ID} non e' nella cache di questo PC ({e}). "
                "Se vuoi scaricarlo ora riavvia con RMBG_ALLOW_DOWNLOAD=1 "
                "(e HF_TOKEN se il repo lo richiede)."
            )
        print("[rmbg] non in cache, lo scarico...")
        m = AutoModelForImageSegmentation.from_pretrained(
            MODEL_ID, trust_remote_code=True, token=HF_TOKEN
        )

    m.to(_device)
    m.eval()
    if _device.type == "cuda":
        m.half()                                  # meta' VRAM, maschere identiche
        torch.backends.cudnn.benchmark = True     # forme fisse 1024x1024
    _model = m
    print("[rmbg] pronto.")
    return _model


def unload_model(reason=""):
    global _model
    with _lock:
        if _model is None:
            return False
        _model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print(f"[rmbg] modello scaricato dalla memoria{(' — ' + reason) if reason else ''}.")
        return True


def _idle_watchdog():
    """Libera la VRAM quando smetti di lavorare, senza doverci pensare."""
    if IDLE_MIN <= 0:
        return
    while True:
        time.sleep(30)
        if _model is not None and _last_use and (time.time() - _last_use) > IDLE_MIN * 60:
            unload_model(f"inattivo da {IDLE_MIN:g} min")


# --------------------------------------------------------------------------
# Immagini
# --------------------------------------------------------------------------
def _decode(data_url: str) -> Image.Image:
    raw = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    return Image.open(io.BytesIO(base64.b64decode(raw)))


def _encode_png(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=False)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _masks_for(images):
    """Una passata GPU per gruppo di BATCH immagini. Ritorna maschere 'L'."""
    model = load_model()
    out = []
    with torch.inference_mode():
        for start in range(0, len(images), BATCH):
            chunk = images[start:start + BATCH]
            batch = torch.stack([_TRANSFORM(im.convert("RGB")) for im in chunk]).to(_device)
            if _device.type == "cuda":
                batch = batch.half()

            preds = model(batch)
            if isinstance(preds, (list, tuple)):
                preds = preds[-1] if len(preds) > 1 else preds[0]
            preds = torch.sigmoid(preds.float())

            # Ogni immagine ha la sua dimensione: interpolo e normalizzo una a una,
            # cosi' il min-max di una foto non influenza quello delle altre.
            for i, im in enumerate(chunk):
                r = F.interpolate(preds[i:i + 1], size=(im.height, im.width),
                                  mode="bilinear", align_corners=False)
                ma, mi = torch.max(r), torch.min(r)
                if (ma - mi) > 0:
                    r = (r - mi) / (ma - mi)
                arr = (r.squeeze() * 255).cpu().numpy().astype("uint8")
                out.append(Image.fromarray(arr, mode="L"))
    return out


def _payload_images(payload):
    imgs = payload.get("images")
    if isinstance(imgs, list) and imgs:
        return [_decode(u) for u in imgs], True
    if payload.get("image"):
        return [_decode(payload["image"])], False
    return [], False


# --------------------------------------------------------------------------
# Endpoint
# --------------------------------------------------------------------------
@app.get("/health")
def health():
    """Prova di collegamento: non carica il modello."""
    vram = None
    if torch.cuda.is_available():
        vram = round(torch.cuda.memory_allocated() / (1024 ** 3), 2)
    return jsonify(ok=True, model=MODEL_ID, local_dir=IS_LOCAL_DIR, loaded=_model is not None,
                   device="cuda" if torch.cuda.is_available() else "cpu",
                   gpu=(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None),
                   batch=BATCH, idle_minutes=IDLE_MIN, vram_gb=vram)


@app.post("/mask")
def mask():
    """Solo la maschera (255 = soggetto). Accetta 'image' o 'images': [...].

    L'app usa questo: sfumatura dei bordi e composizione restano nell'app, cosi'
    il risultato e' identico a quello degli altri motori.
    """
    payload = request.get_json(silent=True) or {}
    images, many = _payload_images(payload)
    if not images:
        return jsonify(error="manca 'image' o 'images'"), 400
    t0 = time.time()
    with _lock:
        masks = _masks_for(images)
    ms = int((time.time() - t0) * 1000)
    print(f"[rmbg] {len(images)} immagini in {ms} ms ({ms // max(1, len(images))} ms/img)")
    if many:
        return jsonify(masks=[_encode_png(m) for m in masks],
                       sizes=[[im.width, im.height] for im in images], ms=ms)
    return jsonify(mask=_encode_png(masks[0]),
                   width=images[0].width, height=images[0].height, ms=ms)


@app.post("/cutout")
def cutout():
    """PNG gia' ritagliato, per usarlo fuori dall'app."""
    payload = request.get_json(silent=True) or {}
    images, many = _payload_images(payload)
    if not images:
        return jsonify(error="manca 'image' o 'images'"), 400
    with _lock:
        masks = _masks_for(images)
    outs = []
    for im, m in zip(images, masks):
        o = Image.new("RGBA", im.size, (0, 0, 0, 0))
        o.paste(im.convert("RGB"), mask=m)
        outs.append(_encode_png(o))
    return jsonify(images=outs) if many else jsonify(image=outs[0])


@app.post("/unload")
def unload():
    """Libera la VRAM adesso: l'app lo chiama quando hai finito di preparare."""
    return jsonify(ok=True, freed=unload_model("richiesto dall'app"))


if __name__ == "__main__":
    import socket
    try:
        lan = socket.gethostbyname(socket.gethostname())
    except Exception:
        lan = "IP-DEL-PC"
    print(f"\n  Modello        :  {MODEL_ID} (dalla cache locale)")
    print(f"  Batch          :  {BATCH} immagini per passata")
    print(f"  Auto-scarico   :  {'dopo %g min di inattivita' % IDLE_MIN if IDLE_MIN > 0 else 'disattivato'}")
    print(f"\n  Da questo PC   ->  http://localhost:{PORT}")
    print(f"  Dal tablet     ->  http://{lan}:{PORT}   (stessa rete Wi-Fi)\n")
    threading.Thread(target=_idle_watchdog, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, threaded=True)
