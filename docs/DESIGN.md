# Taccuino — design system di PsyDiary e Centro TICE

Questo documento descrive il linguaggio visivo comune a **PsyDiary** e al **Centro TICE**. Serve a riprodurlo in altre app, scritte a mano o da un'AI. Le indicazioni sono prescrittive: «deve» vuol dire deve.

> In breve: **un taccuino clinico ben tenuto**. Carta calda e inchiostro blu-nero, un solo colore «spot» vermiglio (la matita rossa), titoli serif in Gloock, testo in Archivo. Righe a matita al posto delle schede, poche annotazioni scritte a mano, la grana della carta sopra a tutto. Un'interfaccia calma, da strumento di lavoro, con il carattere di un quaderno.

---

## 1. Principi

1. **Il quaderno, non l'app.** Ogni scelta deve sembrare fatta su carta: righe sottili, etichette spaziate, titoli grandi, segni a mano. Niente vetro smerigliato, gradienti, neon o ombre pesanti.
2. **Un solo colore che grida.** L'inchiostro fa quasi tutto. Il vermiglio (`spot`) è riservato a: oggi, l'elemento attivo o urgente, il focus, le annotazioni a mano, il pericolo. Se tutto è colorato, niente lo è.
3. **I dati restano stampati.** Il font a mano serve solo per brevi annotazioni (un «oggi», «in corso», «Nota della giornata», gli stati vuoti). Numeri, nomi e testi da leggere al volo sono sempre in Archivo o in Gloock.
4. **Il colore ha un significato.**
   - Verde, ocra e rosso sono riservati alle risposte (corretta, promptata, errata) e alle percentuali.
   - I colori di categoria identificano una cosa (un'attività, un bambino, un tag) e si usano come **evidenziatore**, mai come riempimento di una scheda intera.
5. **Calma sotto pressione.** L'app si usa durante le sedute, in fretta, spesso col telefono in una mano. I tasti importanti sono grandi (≥ 44 px, quelli di risposta ≥ 74 px), il contrasto è AA e il movimento è breve.
6. **Chiaro e scuro alla pari.** Esistono due temi: «carta» (chiaro) e «inchiostro» (scuro). Si sceglie in automatico dal sistema oppure a mano. Ogni componente va controllato in entrambi.

---

## 2. Colore

Lo spazio di riferimento è **OKLCH**: i valori sono pensati lì, gli esadecimali sono gli equivalenti usati nel Centro TICE. I neutri non sono mai grigi puri: sono tinti verso la carta (giallo-caldo) o verso l'inchiostro (blu).

### 2.1 Tema «carta» (chiaro)

| Ruolo | Token | OKLCH | Hex | Uso |
|---|---|---|---|---|
| Carta | `--carta` | `0.958 0.015 82` | `#f6f0e6` | Sfondo della pagina |
| Carta 2 | `--carta-2` | `0.936 0.02 80` | `#f1e9db` | Fogli, pannelli, finestre |
| Carta 3 | `--carta-3` | `0.905 0.024 78` | `#e8dfcd` | Incavi, hover, campi |
| Inchiostro | `--inchiostro` | `0.25 0.032 265` | `#1a2131` | Testo, tasti pieni, linee forti |
| Inchiostro 2 | `--inchiostro-2` | `0.45 0.024 265` | `#4f5563` | Testo secondario (AA su carta e carta 2) |
| Inchiostro 3 | `--inchiostro-3` | `0.58 0.018 265` | `#6d727d` | Segnaposto, decorazioni (non per testo importante) |
| Matita | `--matita` | `0.52 0.014 265 / 0.42` | `rgba(26,33,49,.16)` | Righe, bordi di fogli e campi |
| Matita forte | `--matita-forte` | `0.45 0.016 265 / 0.7` | `rgba(26,33,49,.32)` | Bordi di tasti e pillole |
| Spot (vermiglio) | `--spot` | `0.575 0.165 33` | `#c74a31` | Oggi, focus, accento, annotazioni |
| Spot testo | `--spot-testo` | `0.52 0.16 33` | `#b23a23` | Vermiglio leggibile come testo piccolo |
| Spot tenue | `--spot-tenue` | `0.575 0.165 33 / 0.12` | | Selezione del testo, fondi leggerissimi |
| Spot retino | `--spot-retino` | `0.575 0.165 33 / 0.5` | `rgba(199,74,49,.5)` | Retino a puntini |

### 2.2 Tema «inchiostro» (scuro)

| Ruolo | OKLCH | Hex |
|---|---|---|
| Carta | `0.19 0.016 265` | `#10141b` |
| Carta 2 | `0.225 0.018 265` | `#181c24` |
| Carta 3 | `0.265 0.02 265` | `#20252f` |
| Inchiostro | `0.93 0.016 82` | `#ede7dc` |
| Inchiostro 2 | `0.76 0.018 82` | `#b7b0a5` |
| Inchiostro 3 | `0.6 0.016 82` | `#938c82` |
| Matita | `0.9 0.02 82 / 0.2` | |
| Matita forte | `0.9 0.02 82 / 0.42` | |
| Spot | `0.71 0.15 38` | `#ef7c59` |
| Spot testo | `0.74 0.14 40` | `#f48a64` |

Nel tema scuro la carta diventa inchiostro e l'inchiostro diventa carta. Il vermiglio si schiarisce verso l'arancio per restare leggibile.

### 2.3 Colori di significato

| Significato | Chiaro | Scuro | Uso |
|---|---|---|---|
| Corretta / successo (✓) | `#3f7a4d` | `#75b683` | Tasto «corretta», percentuali sopra il criterio |
| Promptata / attenzione (P, e+) | `#9a6a16` | `#e1ad57` | Tasto «promptata», percentuali intermedie |
| Errata / pericolo (✗) | `#9f1d2c` | `#ec6b7a` | Tasto «errata», percentuali basse, eliminazioni |

Nel tema scuro i tasti di risposta sono chiari, con il testo color inchiostro scuro (`#10141b`) per restare AA.

### 2.4 Colori di categoria

Servono a distinguere attività, bambini, aree o tag. Sono usati come **evidenziatore** sotto il nome, come tinta leggera (≈ 9–16 %) di una cella o come pallino. Mai come riempimento pieno di schede.

```
Chiaro:  #30747f  #b07a20  #488055  #c74a31  #834d7e  #375587
Scuro:   #6eb1bd  #e1ad57  #75b683  #ef7c59  #c287bc  #87a6d7
```

Palette estesa per le attività (12, in ordine di assegnazione):
`#c0392b #2471a3 #1e8449 #b9770e #7d3c98 #148f77 #a93279 #5d6d7e #3949ab #8d6e63 #d35400 #0e6655`

### 2.5 Strategia

**Restrained**: carta e inchiostro occupano oltre il 90 % della superficie. Il vermiglio compare su meno del 5 %, i colori di significato e di categoria solo dove portano un'informazione.

---

## 3. Tipografia

| Ruolo | Font | Note |
|---|---|---|
| Display (titoli, nomi, numeri grandi) | **Gloock** 400 | Serif ad alto contrasto. Si usa un solo peso: è il carattere a fare il lavoro. `letter-spacing: -0.01em … -0.015em`. |
| Testo e interfaccia | **Archivo** (variabile, `font-stretch` 62–125 %) | Pesi 400 / 600 / 700, `font-stretch: 97%` per il testo corrente. |
| Mano (annotazioni) | **La Belle Aurore** | Solo annotazioni brevi, sempre in vermiglio (`--spot-testo`). |

Ripieghi: `'Gloock', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif` · `'Archivo Variable', 'Helvetica Neue', Arial, system-ui, sans-serif` · `'La Belle Aurore', 'Bradley Hand', cursive`.
Tutti e tre i font sono con licenza SIL OFL e sono serviti dall'app (non da CDN), così funzionano anche offline.

### 3.1 Scala (rem su base 16 px)

| Token | px | Uso |
|---|---|---|
| `--t-xs` | 12 | Etichette spaziate (eyebrow) |
| `--t-sm` | 13 | Metadati, note piccole |
| `--t-ui` | 15 | Interfaccia, tasti |
| `--t-nota` | 16 | Testo di lettura, note |
| `--t-md` | 20 | Nomi di attività e righe importanti (Gloock) |
| `--t-lg` | 26 | Titoli di finestre e fogli (Gloock) |
| `--t-xl` | 36 | Titoli di pagina (Gloock) |
| `--t-xxl` | 56 | Date grandi, numeri da copertina (Gloock) |

Sui titoli di pagina usare `clamp(2rem, 7.5vw, 2.75rem)`, con `line-height: 1.02` e `text-wrap: balance`.

### 3.2 L'etichetta spaziata (eyebrow)

È il segno più riconoscibile del sistema:

```css
.eti { font: 600 0.75rem/1.2 var(--f-testo); letter-spacing: 0.12em; text-transform: uppercase; color: var(--inchiostro-2); }
```

Sta sopra ogni titolo di pagina («SEDUTA · OGGI, 9 OTTOBRE · MONICA R.», «SETTIMANA 41 · 2026», «CENTRO TICE») e apre ogni sezione. Quando apre una sezione, è seguita da una riga a matita che arriva fino al margine destro.

### 3.3 Regole

- Una sezione dopo l'altra, con un salto di scala netto (≥ 1,25×). Niente scale piatte.
- Testo di lettura al massimo di **68–75 caratteri** per riga (`--misura: 68ch`).
- Nessun trattino lungo (—) nei testi dell'interfaccia: si usano virgole, due punti, punti o il punto mediano «·» come separatore.
- I numeri nelle tabelle e negli orari usano `font-variant-numeric: tabular-nums`.

---

## 4. Spazio, forme, profondità

- **Ritmo a base 4**: `4 8 12 16 24 32 48 64` px (`--s-1 … --s-8`). Lo spazio varia apposta: stretto dentro un gruppo, largo fra le sezioni.
- **Raggi**:
  - `--r-piccolo: 6px` (etichette)
  - `--r: 10px` (campi, tasti quadrati)
  - `--r-grande: 16px` (fogli, finestre)
  - `999px` (pillole e tasti a pillola)
- **Ombre** quasi assenti: una riga a matita sotto e una sfumatura lunga e tenue.
  `--ombra: 0 1px 0 var(--matita), 0 22px 44px -30px oklch(0.25 0.04 265 / 0.55)`
- **Larghezza della barra in alto:** `--barra: 60px`. La barra ha lo sfondo carta e una riga a matita sotto, mai un colore pieno.

---

## 5. Texture e segni

Sono loro a dare il carattere: senza diventano un'app qualunque, con troppi diventano un costume. Ne servono pochi.

### 5.1 Grana della carta (sempre)

Un rumore fine sopra a tutta la pagina, che non intercetta i clic:

```css
body::after {
  content: ''; position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;
  opacity: var(--grana-opacita); mix-blend-mode: var(--grana-fondo);   /* chiaro: .42 multiply · scuro: .22 screen */
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.78' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .24  0 0 0 0 .2  0 0 0 0 .14  0 0 0 .5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.5'/></svg>");
}
```

### 5.2 Retino a puntini

È un puntinato da stampa vermiglio. Si usa per i «piani» (suggerimenti, note del giorno, argomenti), per il nastro adesivo sulle immagini e per il feedback del tocco sui tasti.

```css
.retino { position: relative; isolation: isolate; }
.retino::before { content: ''; position: absolute; inset: 0; z-index: -1; opacity: .5; border-radius: inherit;
  background-image: radial-gradient(var(--spot-retino) 1px, transparent 1.25px); background-size: 6px 6px; }
```

### 5.3 Evidenziatore

È il modo di usare un colore di categoria su un nome: un tratto basso dietro il testo, che copre circa il terzo inferiore della riga.

```css
.evidenziato {
  background: linear-gradient(transparent 66%, color-mix(in srgb, var(--col) 34%, transparent) 66%,
                              color-mix(in srgb, var(--col) 34%, transparent) 97%, transparent 97%);
  -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 0 3px; margin: 0 -3px;
}
```

Nel tema scuro l'intensità sale al 42 %.

### 5.4 Righe a matita

- Separatori, bordi dei fogli e righe del calendario sono linee da 1 px in `--matita`.
- Il tratteggio (`1px dashed --matita-forte`) indica le cose «da fare» o «da riempire»: il «+» per aggiungere, l'avatar senza foto, la modalità «modifica».

### 5.5 Mano (La Belle Aurore)

Sempre in vermiglio, breve, mai per i dati. Esempi d'uso:
- «oggi» accanto alla data;
- lo stato «in corso / salvata 16:40» sotto il nome di un bambino;
- «Nota della giornata»;
- gli stati vuoti («Nessun bambino oggi»);
- la sequenza delle risposte (v, P, x, e+) come sul foglio dati cartaceo.

### 5.6 Timbro

È il momento di chiusura di un'azione importante (seduta salvata). Un riquadro con doppio bordo vermiglio, il testo in Gloock maiuscolo, ruotato di −6°. Appare scalando da 1,6 a 1 e svanisce in circa 2 s. Con `prefers-reduced-motion` resta fermo.

---

## 6. Componenti

### 6.1 Testata di pagina

```
SEDUTA · OGGI, 9 OTTOBRE · MONICA R. ⌄      ← .eti, tappabile se apre una scelta (data)
Luca Rossi                                    ← Gloock 2–2.75rem
```

La barra in alto resta sottile e contiene solo «indietro» e i comandi a icona: il titolo vive nella pagina, non nella barra.

### 6.2 Tasti

| Tipo | Aspetto |
|---|---|
| Primario | Pillola piena d'inchiostro, testo carta. Hover: inchiostro mescolato all'88 % con il vermiglio. |
| Secondario | Pillola trasparente con bordo `--matita-forte`. Hover: `--carta-3`. |
| Nudo | Senza bordo, solo testo o icona. |
| Spot | Pillola vermiglio, solo per l'azione principale di una pagina speciale. |
| Pericolo | Testo vermiglio su trasparente, con bordo dello stesso colore. Mai rosso pieno. |
| Icona | Cerchio da 44 px, con bordo a matita. |

Altezza minima di 44 px per tutto ciò che si tocca; 40 px è tollerato solo su desktop. Alla pressione il tasto scende di 1 px (`transform: translateY(1px)`).

### 6.3 Tasti di risposta (presa dati)

- Sono grandi: almeno 74 px di altezza e 12–14 px di raggio. Hanno lo sfondo del colore di significato e il simbolo grande (✓ P ✗ e+) con l'etichetta maiuscola spaziata sotto.
- Come finitura da timbro hanno un bordo interno chiaro di 2 px e un'ombra interna in basso; quando li premi compare un lampo di retino bianco.
- Due tasti se l'attività ha due risposte, tre se ne ha tre. Sotto i tasti ci sono annulla, nota e le condizioni («✓ vale come…»).

### 6.4 Segmento (scelta fra viste)

È una pillola esterna con bordo a matita forte e un padding di 3 px. La voce attiva è una pillola d'inchiostro pieno, le altre sono solo testo. Serve per schede come Panoramica / Giornate / Attività e per Settimana / Mese.

### 6.5 Pillole (filtri, tag, stati)

- **Filtri:** pillole a matita; quello scelto è in inchiostro pieno.
- **Stato:** piccole, con una tinta leggera del colore di significato (es. «mantenimento», «criterio», «T/D 1″», «F3»).

### 6.6 Fogli, schede, righe

- **Fogli** (bottom sheet sul telefono, finestre centrate su schermi larghi): sfondo carta 2, raggio 16–20 px, titolo in Gloock 1.6 rem, pulsanti in fondo appiccicati.
  - Se il modulo è stato modificato, toccando fuori o premendo Esc compare la domanda «Scartare le modifiche?».
- **Schede:** usarle solo quando servono davvero, cioè per un'unità che si apre e si chiude, come un'attività in seduta. Hanno bordo a matita, raggio di 14 px e un'ombra di 1 px. **Mai** strisce colorate sul lato e **mai** schede annidate.
- **Elenchi:** righe separate da una riga a matita, senza contenitore. Il nome è in Gloock da 1.3 rem, i metadati sono in Archivo piccolo.

### 6.7 Campi

- Sono sottolineati, non incorniciati: riga a matita sotto e sfondo trasparente o carta 3.
- L'etichetta sta sopra, con eventuali note in `.sotto piccolo`.
- Gli errori compaiono **dentro** il foglio (`role="alert"`) e il foglio resta aperto.

### 6.8 Selettore con ricerca

Sostituisce le tendine lunghe, come le modalità o i bambini:
- in cima, la ricerca;
- una fila di pillole-filtro scorrevole;
- l'elenco raggruppato sotto etichette spaziate;
- la voce scelta evidenziata e già in vista;
- in fondo, «Aggiungi «nome» a categoria».

### 6.9 Calendario

- È un foglio a righe: le righe delle ore sono a matita e la colonna dell'ora è in Gloock.
- Il nome del bambino ha l'evidenziatore del suo colore. La cella si tinge appena (9 %) solo quando il bambino è presente.
- Le persone appaiono come pillole su carta con il bordo del colore; i tirocinanti hanno il bordo tratteggiato.
- L'ora attuale è segnata da una riga vermiglia.
- Normalmente il calendario si guarda soltanto. Le modifiche si fanno in un modo esplicito («Modifica turni»), segnalato da un bordo tratteggiato vermiglio.

### 6.10 Numeri e statistiche

- Niente riquadri colorati («hero metric»). Le cifre sono in Gloock da 2–2.4 rem, con l'etichetta spaziata sotto, e i riquadri sono separati da righe a matita.
- Le percentuali hanno il colore di significato solo quando lo confrontano con un criterio.

### 6.11 Grafici

- La tavolozza «Quaderno» si legge dal tema: righe e assi in inchiostro al 12–40 %, serie V/P/X nei colori di significato, accento vermiglio. Le attività usano il loro colore.
- I testi non scendono mai sotto i 10 px a schermo. I grafici si ridisegnano alla larghezza reale invece di rimpicciolirsi.
- Le didascalie stanno sotto, in corsivo piccolo, e spiegano come leggere il grafico in una frase.

### 6.12 Avvisi

- Sono un piccolo toast d'inchiostro in alto, con `role="status"` e `aria-live="polite"`.
- Gli errori sono rossi, con `role="alert"`.
- Per un'azione conclusa importante si usa il timbro, non un toast più grande.

---

## 7. Movimento

- La curva è sempre in uscita: `cubic-bezier(0.22, 1, 0.36, 1)`. Durate: `160ms` per i dettagli, `240ms` per pannelli e fogli.
- Niente rimbalzi o elastici, e niente animazioni di proprietà di layout (si animano `transform` e `opacity`).
- `prefers-reduced-motion: reduce` spegne tutto tranne i cambi di stato istantanei.

---

## 8. Accessibilità e uso

- Il contrasto è almeno **AA** in entrambi i temi; `--inchiostro-2` è stato scelto apposta per restare AA sulla carta 2.
- Il focus è visibile: `outline: 2px solid var(--spot); outline-offset: 2px`.
- I bersagli tattili sono di almeno **44 × 44 px**. Gli elementi piccoli usano un `::after` invisibile che allarga l'area di tocco.
- Le scelte a pulsanti (radio nascosti) restano usabili da tastiera: input visivamente nascosti, mai `display: none`.
- I testi da copiare (target, note, suggerimenti) restano selezionabili.
- Il gesto o tasto «indietro» del sistema chiude il foglio aperto o torna alla schermata precedente; esce dall'app solo dalla schermata iniziale.

---

## 9. Cosa non fare

- Gradienti decorativi, testo in gradiente, vetro smerigliato, bagliori al neon.
- Strisce colorate sul lato di schede, elenchi o avvisi (`border-left` colorato > 1 px).
- Riquadri colorati con il «numero grande» in stile SaaS.
- Griglie di schede identiche con icona, titolo e testo.
- Più di un colore acceso nella stessa vista oltre ai colori di significato.
- Bottoni ciascuno di un colore diverso: sono tutti a matita, e solo il pericolo è vermiglio.
- Font a mano per numeri, nomi o testi lunghi.
- Bianco o nero puri: si usano sempre carta e inchiostro.
- Modali come prima scelta: prima vanno provate le soluzioni sul posto o un foglio.

---

## 10. Variabili pronte all'uso

```css
:root {
  --f-display: 'Gloock', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
  --f-testo: 'Archivo Variable', 'Helvetica Neue', Arial, system-ui, sans-serif;
  --f-mano: 'La Belle Aurore', 'Bradley Hand', cursive;

  --t-xs: .75rem; --t-sm: .8125rem; --t-ui: .9375rem; --t-nota: 1rem;
  --t-md: 1.25rem; --t-lg: 1.625rem; --t-xl: 2.25rem; --t-xxl: 3.5rem;
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;
  --r-piccolo: 6px; --r: 10px; --r-grande: 16px; --barra: 60px; --misura: 68ch;
  --e-uscita: cubic-bezier(0.22, 1, 0.36, 1); --d-breve: 160ms; --d-media: 240ms;

  /* carta (chiaro) */
  --carta: oklch(0.958 0.015 82);  --carta-2: oklch(0.936 0.02 80);  --carta-3: oklch(0.905 0.024 78);
  --inchiostro: oklch(0.25 0.032 265);  --inchiostro-2: oklch(0.45 0.024 265);  --inchiostro-3: oklch(0.58 0.018 265);
  --matita: oklch(0.52 0.014 265 / 0.42);  --matita-forte: oklch(0.45 0.016 265 / 0.7);
  --spot: oklch(0.575 0.165 33);  --spot-testo: oklch(0.52 0.16 33);
  --spot-tenue: oklch(0.575 0.165 33 / 0.12);  --spot-retino: oklch(0.575 0.165 33 / 0.5);
  --ok: #3f7a4d; --attenzione: #9a6a16; --errore: #9f1d2c;
  --su-inchiostro: var(--carta);
  --ombra: 0 1px 0 var(--matita), 0 22px 44px -30px oklch(0.25 0.04 265 / 0.55);
  --grana-fondo: multiply; --grana-opacita: .42;
  color-scheme: light;
}
:root[data-tema='scuro'] {
  --carta: oklch(0.19 0.016 265);  --carta-2: oklch(0.225 0.018 265);  --carta-3: oklch(0.265 0.02 265);
  --inchiostro: oklch(0.93 0.016 82);  --inchiostro-2: oklch(0.76 0.018 82);  --inchiostro-3: oklch(0.6 0.016 82);
  --matita: oklch(0.9 0.02 82 / 0.2);  --matita-forte: oklch(0.9 0.02 82 / 0.42);
  --spot: oklch(0.71 0.15 38);  --spot-testo: oklch(0.74 0.14 40);
  --spot-tenue: oklch(0.71 0.15 38 / 0.16);  --spot-retino: oklch(0.71 0.15 38 / 0.45);
  --ok: #75b683; --attenzione: #e1ad57; --errore: #ec6b7a;
  --su-inchiostro: oklch(0.19 0.016 265);
  --ombra: 0 1px 0 var(--matita), 0 24px 48px -28px oklch(0 0 0 / 0.7);
  --grana-fondo: screen; --grana-opacita: .22;
  color-scheme: dark;
}
/* tema automatico: copiare il blocco «scuro» dentro
   @media (prefers-color-scheme: dark) { :root:not([data-tema='chiaro']) { … } } */
```

---

## 11. Istruzioni per un'AI che deve usare questo sistema

Copia questo paragrafo nel prompt:

> Usa il design system «Taccuino» descritto in DESIGN.md.
> - **Base:** carta calda (`--carta`) e inchiostro blu-nero, un solo accento vermiglio (`--spot`) per oggi, focus e annotazioni. Temi chiaro e scuro alla pari.
> - **Font:** titoli e numeri grandi in Gloock 400; interfaccia in Archivo; annotazioni brevi a mano in La Belle Aurore, sempre vermiglie e mai per i dati.
> - **Pagine:** ogni pagina si apre con un'etichetta maiuscola spaziata (0.75rem, 0.12em) e un titolo grande in Gloock.
> - **Contenitori:** righe a matita da 1 px invece delle schede; tratteggio per ciò che va riempito. I colori di categoria si usano solo come evidenziatore sotto i nomi.
> - **Tasti:** pillole, piene d'inchiostro o con bordo a matita; il pericolo è testo vermiglio. Tutto ciò che si tocca è almeno 44 px.
> - **Texture:** grana della carta sopra a tutto e retino a puntini vermiglio per le note.
> - **Movimento:** breve, in uscita, mai elastico.
> - **Da evitare:** gradienti, vetro, strisce laterali colorate, riquadri di statistiche colorati, bianco o nero puri.
