# Modelli AI locali (fallback offline per lo scontorno)

Lo scontorno AI usa un modello di segmentazione del soggetto che gira **nel
browser**, accelerato sulla **GPU** (WebGPU) quando disponibile, con fallback su
CPU (WASM).

Per impostazione predefinita il modello viene scaricato **online** da Hugging
Face la prima volta e poi resta in **cache nel browser** (funziona offline alle
volte successive). Questa cartella serve solo come **fallback manuale** per
quando il download online non è raggiungibile (rete bloccata, dispositivo senza
connessione al primo utilizzo, ecc.).

## Come preparare il modello locale

1. Scarica i file da Hugging Face (RMBG-2.0, consigliato):
   https://huggingface.co/briaai/RMBG-2.0/tree/main

   File necessari:
   - `config.json`
   - `preprocessor_config.json`
   - `onnx/model_fp16.onnx` — per GPU/WebGPU (più veloce, meno batteria)
   - `onnx/model_quantized.onnx` — per CPU (più leggero)

   Bastano i file ONNX che ti servono per il dispositivo che usi: per il
   Galaxy Tab S11 (GPU potente) scarica almeno `model_fp16.onnx`.

2. Disponi i file con **questa struttura**, dentro la cartella `models/`:

   ```
   models/
     briaai/
       RMBG-2.0/
         config.json
         preprocessor_config.json
         onnx/
           model_fp16.onnx
           model_quantized.onnx
   ```

3. Nell'app, vai in **Impostazioni › Immagini › Scontorno AI** e imposta:
   - **Cartella modello locale**: `./models/`
   - (opzionale) spunta **Usa prima la cartella locale** per lavorare sempre
     offline senza tentare la rete.

4. Premi **Carica/Test modello**. Se vedi "Pronto: briaai/RMBG-2.0 su WEBGPU"
   funziona sulla GPU.

## Alternative al modello

Nel campo **Modello** (Impostazioni › Immagini) puoi indicare:
- `briaai/RMBG-2.0` — qualità migliore (licenza non commerciale: uso clinico
  e personale consentito).
- `onnx-community/RMBG-2.0` — conversione ONNX della community.
- `briaai/RMBG-1.4` — più leggero e veloce, ottimo fallback.

Se lasci il campo vuoto, l'app prova in ordine RMBG-2.0 e poi RMBG-1.4.

## Accelerazione hardware

- **GPU (WebGPU)**: usata automaticamente quando il browser la espone. Sul
  Galaxy Tab S11 con Chrome aggiornato è attiva → massime prestazioni e minor
  consumo di batteria rispetto alla CPU.
- **NPU (WebNN)**: non ancora disponibile in modo affidabile nei browser su
  Android. L'opzione "NPU se disponibile" la prova e ripiega su GPU/CPU se
  assente. Verrà usata automaticamente non appena i browser la supporteranno.
- **CPU (WASM)**: fallback sempre disponibile, più lento.

> Nota: questa cartella può restare vuota nel repository. I file `.onnx` sono
> grandi (decine/centinaia di MB) e **non** vanno committati: scaricali sul
> dispositivo come descritto sopra.
