#!/usr/bin/env python3
"""
Apre i file cifrati del Quaderno TICE senza l'app.

    pip install cryptography
    python decifra_tice.py --frase XXXXX-XXXXX-XXXXX-XXXXX-XXXXX \
        --config _config/cifratura.json  Pazienti/*/paziente.json

Per ogni file scrive accanto <file>.leggibile.json (e con --csv anche le
sedute in CSV). Al posto di --config si possono dare --sale e --iterazioni
scritti nel file della chiave.

Formato (lo stesso di js/tice-cifra.js):
  chiave = PBKDF2-SHA256(frase normalizzata, sale, iterazioni) → 32 byte
  busta  = AES-256-GCM(iv, testo aggiuntivo "tice:paziente:<id>"), gzip se comp == "gzip"
"""
import argparse
import base64
import csv
import gzip
import hashlib
import json
import re
import sys

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("Serve il pacchetto cryptography:  pip install cryptography")


def normalizza(frase):
    t = re.sub(r"[^0-9A-Z]", "", frase.upper()).replace("O", "0").replace("I", "1").replace("L", "1").replace("U", "V")
    if len(t) != 25:
        sys.exit("La frase deve avere 25 caratteri.")
    return "-".join(t[i:i + 5] for i in range(0, 25, 5))


def apri(chiave, busta, aad):
    chiaro = AESGCM(chiave).decrypt(base64.b64decode(busta["iv"]), base64.b64decode(busta["dati"]), aad.encode())
    if busta.get("comp") == "gzip":
        chiaro = gzip.decompress(chiaro)
    return json.loads(chiaro)


def main():
    ap = argparse.ArgumentParser(description="Apre i file cifrati del Quaderno TICE.")
    ap.add_argument("file", nargs="+", help="paziente.json o versioni (vNNNNNNNN.json)")
    ap.add_argument("--frase", required=True, help="chiave del centro (25 caratteri)")
    ap.add_argument("--config", help="_config/cifratura.json")
    ap.add_argument("--sale", help="sale (base64), se manca --config")
    ap.add_argument("--iterazioni", type=int, help="iterazioni PBKDF2, se manca --config")
    ap.add_argument("--csv", action="store_true", help="scrive anche le sedute in CSV")
    a = ap.parse_args()

    if a.config:
        with open(a.config, encoding="utf-8") as f:
            cfg = json.load(f)
        sale, iterazioni = cfg["kdf"]["sale"], cfg["kdf"]["iterazioni"]
    elif a.sale and a.iterazioni:
        sale, iterazioni = a.sale, a.iterazioni
    else:
        sys.exit("Serve --config oppure --sale e --iterazioni.")

    chiave = hashlib.pbkdf2_hmac("sha256", normalizza(a.frase).encode(), base64.b64decode(sale), iterazioni, 32)
    errori = 0
    for percorso in a.file:
        with open(percorso, encoding="utf-8") as f:
            r = json.load(f)
        if "busta" not in r:
            continue
        try:
            p = apri(chiave, r["busta"], "tice:paziente:" + r["id"])
        except Exception:
            print(f"{percorso}: non si apre (chiave sbagliata o file alterato)")
            errori += 1
            continue
        uscita = re.sub(r"\.json$", "", percorso) + ".leggibile.json"
        with open(uscita, "w", encoding="utf-8") as f:
            json.dump(p, f, ensure_ascii=False, indent=2)
        print(f"{percorso}: {p.get('name')} — {len(p.get('history', []))} sedute → {uscita}")
        if a.csv:
            col = ["date", "setName", "setCat", "mode", "sessionType", "correct", "prompts", "rawX", "total", "percentage", "operatore", "note"]
            with open(re.sub(r"\.json$", "", percorso) + ".sedute.csv", "w", encoding="utf-8-sig", newline="") as f:
                w = csv.writer(f, delimiter=";")
                w.writerow(col)
                for s in sorted(p.get("history", []), key=lambda x: str(x.get("date", ""))):
                    w.writerow([str(s.get(k, ""))[:10] if k == "date" else s.get(k, "") for k in col])
    sys.exit(1 if errori else 0)


if __name__ == "__main__":
    main()
