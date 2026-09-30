# Celeration chart (SCC) e cronometro per la fluency

La *Standard Celeration Chart* della Precision Teaching, calcolata sui dati che
l'app già raccoglie. Ispirata a OpenCelerator
(https://opencelerator.pigeondev.net/), ma riscritta da zero: le formule sono
quelle standard, il codice è nostro (`js/scc.js`, testato in
`tools/test-scc.js`).

## Dove si trova

- **Presa dati → Programma**: accanto a ogni target in corso compare la sua
  celerazione (es. **×1,4**: le risposte corrette crescono del 40% a
  settimana). Un tocco apre il grafico del target. Sotto ogni attività,
  **Andamento** apre il grafico di tutta l'attività (tutti i suoi target, con i
  cambi di target segnati).
- **Menu del target → Grafico e celerazione**.
- **Cartella del paziente → Visualizzazioni → Celeration chart (SCC)**: per
  ogni target, attività del programma, set o gioco. La vecchia vista
  "Celeration" (tutte le attività insieme) resta come *Celeration globale*.

## Come si legge

- Scala logaritmica: distanze uguali = moltiplicazioni uguali. Da 5 a 10 è
  lo stesso "salto" che da 50 a 100.
- **●** corrette · **△** con aiuto · **✕** errori. Un punto per giorno di
  calendario: somma delle sedute del giorno. Giorni senza sedute: nessun punto.
  Giorni a zero: sotto la riga dell'1.
- **Celerazione**: di quanto si moltiplica il valore in una settimana.
  ×2 raddoppia, ÷2 si dimezza, ×1 è stabile. Si vuole × per le corrette, ÷ per
  aiuto ed errori. Proporzioni standard: ×2 a settimana è sempre inclinato di
  circa 34°, come sulle carte di Lindsley.
- **Precisione**: di quanto migliora il rapporto corrette/errori
  (celerazione delle corrette ÷ quella degli errori).
- **Variabilità (bounce)**: ampiezza della fascia che contiene il 90% dei
  giorni attorno alla linea. ×1,5 è molto stabile, oltre ×4 è molto irregolare.
- **Obiettivo e previsione**: se l'attività ha un numero fisso di prove, dal
  criterio (es. 90% di 10 prove) si ricava l'obiettivo in risposte al giorno;
  la linea tratteggiata mostra quando lo si raggiunge al ritmo attuale.
- **Vista settimanale**: ogni punto è la mediana dei giorni della settimana;
  la celerazione è "ogni 4 settimane".

## Cambi di fase

Una linea verticale divide il grafico in fasi: la celerazione si calcola
separatamente in ciascuna (servono almeno 5 giorni con dati).

- **Automatici** (tratteggiati): cambio di target, passaggio indipendente ↔
  time delay (e secondi), inizio del mantenimento.
- **A mano** (continui): *+ Cambio di fase* con data e descrizione (es.
  "fading del prompt", "nuovo rinforzatore"). Si salvano nel bambino, si
  sincronizzano con il Drive del centro e, se aggiunti su due dispositivi, si
  sommano senza perdersi.

## Metodi della linea

- **Theil-Sen** (predefinito): mediana delle pendenze tra tutte le coppie di
  giorni. Robusto: un giorno anomalo non sposta la linea.
- **Split-middle**: il metodo classico della Precision Teaching.
- **Minimi quadrati**: la regressione lineare sul logaritmo.

## Fluency: attività cronometrate

Nel modulo dell'attività: **Cronometra (fluency)**. In seduta compare un
cronometro che parte da solo alla prima risposta (si può mettere in pausa) e
mostra le corrette al minuto. La seduta salvata porta il tempo di lavoro
(`durationSeconds`), e il grafico offre **Al minuto**: frequenza = risposte ÷
minuti, con il "pavimento" (1 ÷ minuti) disegnato come trattino.

Solo per attività davvero a tempo: con le prove scandite dal terapista le
risposte al minuto misurerebbero il ritmo di chi presenta, non l'abilità.
La percentuale di corrette resta nei grafici di sempre: su scala logaritmica
non avrebbe senso (è limitata a 100).

## Esportazione

**Esporta CSV** produce `Date, Corrects, Errors, Prompted, Minutes`: si importa
anche in OpenCelerator.
