# Scontorno nativo su NPU/GPU (Galaxy Tab S11)

Questo documento spiega come abilitare lo scontorno AI **nativo**, accelerato
sull'hardware del Tab S11, e qual è il percorso per arrivare fino alla **NPU**
(NeuroPilot di MediaTek). Risponde anche a: si possono tenere sia RMBG‑1.4 che
2.0? esistono modelli già pronti per NeuroPilot? altrimenti come si fa?

## TL;DR

- Il Tab S11 monta un **MediaTek Dimensity 9400+** → la NPU è l'**APU MediaTek**.
- Due strade per usarla da nativo:
  1. **ONNX Runtime + NNAPI** (già scaffoldato in questo repo). Riusa i modelli
     **ONNX** che abbiamo già; NNAPI smista gli operatori supportati all'APU.
     È la via col **minimo lavoro** ed è quella che trovi pronta da compilare.
  2. **LiteRT (TFLite) + delegate NeuroPilot** → accesso **diretto** all'APU,
     massima efficienza, ma richiede l'**SDK NeuroPilot** (ad accesso riservato)
     e la conversione/quantizzazione del modello.
- Puoi **tenere entrambi** i modelli (1.4 e 2.0) negli assets e scegliere/fare
  fallback dall'app.

## Cosa è già pronto nel repo (NNAPI)

- `native/plugin/NpuCutoutPlugin.java` — plugin Capacitor: prende un'immagine,
  esegue il modello ONNX con **NNAPI** (→ APU/GPU), restituisce la maschera.
- `scripts/add-native-npu.js` — iniettore post‑sync: copia il plugin, lo registra
  in `MainActivity`, aggiunge la dipendenza **onnxruntime-android** al Gradle e
  copia i modelli da `native-models/` negli assets.
- `js/ai-engine.js` — se il plugin nativo è presente lo usa **per primo**
  (`segmentSubject` → `nativeSegment`), altrimenti ripiega su WebGPU e poi CPU.
  Nessun cambiamento per l'utente.
- `build.bat` opzioni **8/9/10** e gli script npm `cap:npu:setup`,
  `cap:sync:native`, `cap:build:android:native`.

### Passi per provarlo

1. `npx cap add android` (se non l'hai già fatto).
2. Scarica i modelli ONNX in `native-models/` come `rmbg-2.0.onnx` e/o
   `rmbg-1.4.onnx` (vedi `native-models/README.md`).
3. Build con NPU: `build.bat` → opzione **10** (oppure `npm run cap:build:android:native`).
4. Sul tab, apri lo scontorno → **Manuale / AI** → **AI auto**. La riga di stato
   dirà `Scontorno nativo completato (nnapi)` se ha usato l'acceleratore.

> Nota: è uno **scaffold** — compila contro ORT, ma va provato sul dispositivo.
> Se un operatore non è supportato da NNAPI, viene eseguito su GPU/CPU
> (fallback automatico, nessun crash).

## Tenere sia RMBG‑1.4 che 2.0

Sì. Metti entrambi i file in `native-models/` (`rmbg-1.4.onnx`, `rmbg-2.0.onnx`):
vengono **entrambi** copiati negli assets. Il plugin carica il modello richiesto
per nome; l'app sceglie quale usare (campo *Modello* in Impostazioni › Immagini)
e può fare fallback all'altro. Le normalizzazioni corrette (mean/std) e il
post‑processing (sigmoid per il 2.0, nessuno per l'1.4) sono già gestiti.

## Esistono modelli "pronti" per NeuroPilot?

**No, non ufficialmente.** RMBG è distribuito come **PyTorch/ONNX** (e l'1.4 anche
in ONNX già pronto). Non esistono pacchetti NeuroPilot/`.dla` precompilati di RMBG
pronti all'uso. Quindi per NeuroPilot bisogna **convertire** noi.

Quello che è "pronto" è l'ONNX → ed è esattamente ciò che usa la via **NNAPI**
già scaffoldata. Per questo NNAPI è il primo passo consigliato.

## Percorso completo verso NeuroPilot (massima NPU)

NeuroPilot è l'SDK MediaTek per l'APU. Per usarlo davvero:

1. **Ottieni l'SDK NeuroPilot** dal programma sviluppatori MediaTek
   (accesso riservato/registrazione; non è una dipendenza Maven pubblica).
   Include il runtime **Neuron**, il **delegate TFLite NeuroPilot** e il
   **NeuroPilot Converter Tool**.
2. **Converti il modello** in TFLite e poi compila per l'APU:
   - ONNX → TFLite: `onnx2tf` oppure `ai-edge-torch` (da PyTorch).
   - **Quantizza int8** (PTQ con un set di calibrazione di ~100–300 immagini
     rappresentative): la NPU rende al meglio in int8. Aspettati una piccola
     perdita di qualità sui bordi — per questo è utile tenere anche l'1.4/2.0
     fp16 come confronto.
   - (Max) compila in `.dla` con il NeuroPilot Converter per l'APU del 9400+.
3. **Integra il delegate**: aggiungi gli AAR NeuroPilot al Gradle e, nel plugin,
   sostituisci l'esecuzione ORT/NNAPI con LiteRT + `NeuroPilotDelegate`
   (o esegui il `.dla` col runtime Neuron). Il resto (pre/post‑processing,
   bridge JS, compositing) resta identico.
4. **Verifica l'uso APU**: controlla i log del delegate per confermare quanti
   operatori girano sull'APU vs fallback GPU/CPU.

### Aspettative

- **NNAPI (ora)**: usa APU/GPU per gli op supportati; semplice; riusa ONNX.
- **NeuroPilot int8 (max)**: latenza minima (~decine di ms) e massima efficienza
  energetica, ma più lavoro e un po' di tuning sulla qualità.

## Avvertenze

- NNAPI è **deprecato da Android 15**: funziona ancora, ma la via a prova di
  futuro è LiteRT/NeuroPilot.
- La NPU vuole modelli **int8**; fp16/fp32 spesso ricadono su GPU.
- **RMBG‑2.0** ha licenza **non commerciale** (uso clinico/personale ok).
- Tutto questo vale solo nella **build Android nativa**; nel browser/PWA resta
  attivo il motore **WebGPU** già integrato.
