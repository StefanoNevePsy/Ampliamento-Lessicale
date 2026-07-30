# Modelli per il plugin NPU nativo

Metti qui i file `.onnx` dei modelli di scontorno. Lo script `cap:sync:native`
(o l'opzione 9/10 del `build.bat`) li copia automaticamente in
`android/app/src/main/assets/`, da dove il plugin nativo li carica.

Nomi attesi dal plugin (puoi tenerli entrambi per il fallback):

- `rmbg-2.0.onnx`  ← qualità migliore (BiRefNet)
- `rmbg-1.4.onnx`  ← più leggero/veloce, ottimo fallback

## Dove prenderli

- RMBG-1.4 (ONNX pronto):
  https://huggingface.co/briaai/RMBG-1.4/tree/main/onnx
  scarica `model.onnx` e rinominalo `rmbg-1.4.onnx`.

- RMBG-2.0 (ONNX):
  https://huggingface.co/briaai/RMBG-2.0/tree/main  (cartella `onnx/`)
  oppure la conversione community `onnx-community/RMBG-2.0`.
  Scarica `model.onnx` (o `model_fp16.onnx`) e rinominalo `rmbg-2.0.onnx`.

> Per l'esecuzione su NPU al massimo delle prestazioni serve una versione
> **quantizzata int8** (vedi NATIVE_NPU.md). I file fp32/fp16 funzionano con
> NNAPI ma molte operazioni potrebbero girare su GPU/CPU invece che sull'APU.

I file qui dentro NON vengono committati (sono grandi): vedi `.gitignore`.
