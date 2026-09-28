# Quaderno TICE — progetto

Edizione dell'app pensata per il Centro TICE: sostituisce i quaderni cartacei e i
file Numbers su Drive con un quaderno digitale condiviso, usabile da telefono,
tablet e computer. Vive nella cartella `centro/` di questa branch e non tocca
l'app personale (radice del repository).

## Obiettivi

- Registrare le sedute direttamente sul dispositivo, senza conti a mano.
- Avere storico, criteri e learn unit calcolati automaticamente.
- Condividere i dati tra professionisti e tirocinanti, ciascuno solo sui bambini
  che segue.
- Condividere i materiali (set) tra professionisti, scaricandoli una volta sola.
- Tenere i dati nel Drive del centro, senza server esterni.

## Architettura in una riga

L'app non tocca mai Drive direttamente. Parla con un **custode** (Google Apps
Script) che gira con l'account di un amministratore del centro ed è l'unico a
leggere e scrivere il Drive condiviso. Gli utenti fanno "Accedi con Google" solo
per dimostrare chi sono; è il custode a decidere cosa possono vedere.

```
 telefono / tablet / PC                     Workspace centrotice.it
┌──────────────────────┐   HTTPS + token   ┌──────────────────────────┐
│ Quaderno TICE        │ ────────────────▶ │ Custode (Apps Script)    │
│  · copia locale      │ ◀──────────────── │  · verifica identità     │
│  · coda d'invio      │                   │  · controlla i permessi  │
│  · grafici, criteri  │                   │  · unico che scrive      │
└──────────────────────┘                   └────────────┬─────────────┘
                                                        │
                                            Drive condiviso "Quaderno TICE"
```

Perché così e non con la condivisione di Drive:

- **Tirocinanti con Gmail personale.** Se ogni utente accedesse a Drive con i
  propri permessi, Google imporrebbe di elencarli uno per uno nella console Cloud
  (o una verifica di sicurezza lunga). Con il custode gli utenti chiedono solo
  nome ed email, e per quello Google non richiede né liste né verifiche.
- **Proprietà dei file.** Scrive sempre il custode, quindi tutti i file sono del
  Drive condiviso del centro, anche quelli registrati da un tirocinante.
- **Revoca reale.** I tirocinanti non ricevono la cartella: vedono i dati solo
  tramite l'app, e quando l'accesso scade o viene tolto non resta nulla nel loro
  Drive.

Il prezzo: il controllo degli accessi è codice nostro (`custode/core.js`), non la
condivisione di Google. È piccolo, testato e leggibile di proposito.

## Struttura del Drive condiviso

```
Quaderno TICE/                      (Drive condiviso: membri = solo admin)
├── _config/
│   └── accessi.json                utenti, ruoli, assegnazioni, scadenze
├── Pazienti/
│   ├── _elenco.json                riepilogo per l'elenco (cache ricostruibile)
│   └── pz_xxxxxxxx/
│       ├── paziente.json           anagrafica pseudonima, programmi, STO
│       ├── _sedute.json            tutte le sedute in un file (cache ricostruibile)
│       └── sedute/
│           └── 2026-06-18_sd_xxxx.json   una seduta = un file, mai riscritto da altri
└── Materiali/
    ├── indice.json                 elenco set con versione e hash delle immagini
    ├── set/<id>.json               set con le immagini sostituite da riferimenti
    └── immagini/<sha256>.<ext>     ogni immagine una volta sola, nominata dal contenuto
```

I file `_elenco.json` e `_sedute.json` servono solo alla velocità: leggere un file
è molto più rapido che leggerne trecento. La fonte di verità sono i file delle
singole sedute; un admin può ricostruire le cache in ogni momento.

## Ruoli

| | admin | professionista | tirocinante |
|---|---|---|---|
| Vede i pazienti | tutti | assegnati (o tutti se `*`) | assegnati |
| Registra sedute | ✓ | ✓ | ✓ |
| Vede storico, grafici, dati | ✓ | ✓ | ✓ |
| Corregge/elimina sedute | tutte | tutte dei suoi pazienti | solo le proprie |
| Modifica programmi, STO, criteri | ✓ | ✓ | — |
| Crea pazienti | ✓ | ✓ | — |
| Pubblica materiali | ✓ | ✓ | — (li scarica) |
| Gestisce utenti e assegnazioni | ✓ | — | — |

L'account su cui gira il custode è sempre admin, così il primo accesso funziona
senza configurazioni a mano. Ogni utente può avere una **scadenza** (fine
tirocinio): dopo quella data il custode lo rifiuta da solo.

La tabella è in `custode/core.js` (`PERMESSI`) ed è l'unico posto da cambiare.

## Formato dei dati

### Paziente — `paziente.json`

```json
{
  "schema": 1,
  "id": "pz_7Kq2mX9a",
  "codice": "PZ-014",
  "etichetta": "C. G.",
  "aula": "Aula 1",
  "programmi": [{
    "id": "pr_...",
    "area": "Speaker",
    "nome": "TACT",
    "descrizione": "TACT",
    "criterio": { "soglia": 90, "sedute": 2 },
    "strategia": "timedelay",
    "prove": 10,
    "scala": "conteggio",
    "evento": null,
    "stato": "attivo",
    "sto": [{ "id": "st_...", "testo": "TACT oggetti mix — divano, porta, frigo",
              "stato": "attivo", "inizio": "2026-03-09", "fine": null }]
  }],
  "learnUnitStoriche": [],
  "version": 7, "aggiornato": "...", "aggiornatoDa": "..."
}
```

- `codice` ed `etichetta` al posto del nome: consigliato usare iniziali.
- `strategia`: `indipendente` o `timedelay`.
- `prove`: prove per seduta, se fisso. Serve all'import (i fogli a una colonna non
  scrivono il totale) e come promemoria in seduta.
- `scala`: `conteggio` per i dati raccolti con l'app; `percentuale` solo per dati
  importati da tabelle che registravano percentuali.
- `evento`: registrazione di eventi (es. `["Pipì", "No pipì"]`) accanto a V/P/X.
- `learnUnitStoriche`: le tabelle "Frequenze" e "Learn unit giornaliere"
  importate così come sono, per non perdere lo storico prima dell'app.

### Seduta — `sedute/<data>_<id>.json`

```json
{
  "schema": 1,
  "id": "sd_Xa91...",
  "pazienteId": "pz_...",
  "data": "2026-06-18",
  "inizio": "2026-06-18T09:02:00Z", "fine": "2026-06-18T09:51:00Z",
  "operatore": "elisa@...", "operatoreNome": "Eli",
  "coOperatori": ["Ali"],
  "voci": [{
    "programmaId": "pr_...", "stoId": "st_...", "strategia": "timedelay",
    "v": 9, "p": 1, "x": 0, "sequenza": "VVVVPVVVVV",
    "eventi": null, "decisione": null, "nota": ""
  }],
  "nota": "",
  "fonte": "app",
  "eliminata": false
}
```

Una seduta è **tutto quello che si fa con un bambino in quell'incontro**, con più
programmi dentro: è l'unità del foglio "Learn unit giornaliere". Si invia con una
sola richiesta a fine seduta.

L'`id` è generato sul dispositivo. Se la rete cade dopo che il custode ha salvato
ma prima della conferma, l'app riprova e il custode riconosce l'id: niente doppioni.

### Calcoli (identici a quelli dell'app personale)

- **Percentuale** di una voce: `v / (v + p + x)`; con `scala: percentuale` è `v`.
- **Criterio** di uno STO: le ultime `criterio.sedute` sedute di quello STO, in
  giorni diversi e consecutive, tutte ≥ `criterio.soglia`.
- **Repertorio**: la prima seduta in assoluto di uno STO è già sopra soglia.
- **Learn unit del giorno**: somma di `v` (corrette) e di `v+p+x` (totali) di tutte
  le voci del giorno; **criteri del giorno**: STO che hanno raggiunto il criterio
  in quella data.

## API del custode

Un solo indirizzo, richieste `POST` con corpo JSON:

```json
{ "v": 1, "token": "<ID token Google>", "azione": "seduta.salva", "dati": { } }
```

Risposta `{ "ok": true, "dati": ... }` oppure `{ "ok": false, "errore": "codice", "messaggio": "..." }`.

| Azione | Chi | Cosa fa |
|---|---|---|
| `io` | tutti | identità, ruolo, permessi |
| `pazienti.elenco` | tutti | pazienti visibili, con riepilogo |
| `paziente.leggi` | assegnati | paziente + sedute (tutte o solo quelle dopo una data) |
| `paziente.crea` | admin, prof. | nuovo paziente; chi lo crea viene assegnato |
| `paziente.salva` | admin, prof. | programmi e STO, solo partendo dall'ultima versione |
| `paziente.importa` | admin | paziente + storico da import Numbers |
| `seduta.salva` | assegnati | crea o corregge (idempotente per id) |
| `seduta.elimina` | vedi ruoli | segna come eliminata, non cancella |
| `materiali.indice` | tutti | indice dei set |
| `materiali.set` | tutti | un set |
| `materiali.immagini` | tutti | immagini per hash, a gruppi |
| `materiali.pubblica` | admin, prof. | pubblica un set, solo le immagini mancanti |
| `materiali.elimina` | admin | toglie un set dall'indice |
| `accessi.leggi` / `accessi.salva` | admin | utenti, ruoli, assegnazioni |
| `manutenzione.ricostruisci` | admin | ricostruisce le cache dai file delle sedute |

Scritture sotto lock: una alla volta per tutto il custode, ognuna in meno di un
secondo. **Versioni**: paziente, indice dei materiali e accessi hanno un numero di
versione; un salvataggio che non parte dall'ultima viene rifiutato con
`conflitto`, e l'app propone di ricaricare invece di sovrascrivere il lavoro di
un altro.

## Sincronizzazione

**Sedute.** Durante la seduta ogni tocco è salvato in locale (bozza). A fine
seduta la seduta completa entra nella coda d'invio e parte subito; senza rete
resta "in attesa di invio", visibile, e riparte da sola.

**Pazienti.** Alla prima apertura si scarica lo storico; poi solo le sedute
modificate dopo l'ultima sincronizzazione.

**Materiali.** Si scarica l'indice (pochi KB); si confronta con quello locale; si
scaricano solo i set cambiati e, dei set cambiati, solo le immagini che mancano.
Il controllo avviene all'apertura e con "Aggiorna materiali".

**Dispositivi condivisi.** I dati locali sono separati per utente: sul tablet
dell'aula ognuno vede solo i propri pazienti. Quando un bambino viene tolto a un
utente, la sua copia locale viene cancellata alla prima connessione.

## Import dai file Numbers

`tools/import_numbers.py` legge un file `.numbers` e produce un JSON da caricare
dall'app (Admin → Importa). Riconosce:

- un foglio per area, una tabella per programma, intestazione su tre righe;
- STO scritti su più righe e STO paralleli nella stessa tabella;
- tabelle in percentuale (V+P = 100) e in conteggi (con o senza la colonna dei
  promptati);
- decisioni scritte a mano (CRITERIO, REPERTORIO, "Passa a 1" T/D"…), conservate
  come annotazioni;
- tabelle "Frequenze" e "Learn unit giornaliere", importate come storico;
- il foglio "Programmi terminati".

Quando non può saperlo con certezza, **lo dice**: le tabelle a una sola colonna
non scrivono quante prove c'erano, e l'import propone un valore da confermare
invece di inventarlo.

## Sicurezza

- Identità verificata dal custode su ogni richiesta (firma, destinatario,
  scadenza, email verificata del token Google).
- Permessi decisi solo dal custode; l'app mostra, non decide.
- Ogni identificativo è validato prima di diventare un percorso su Drive.
- Il Drive condiviso ha come membri solo gli admin.
- Le copie locali sui dispositivi restano finché l'utente non esce o perde
  l'accesso: per i dispositivi condivisi serve il blocco schermo.
- Nome e cognome dei bambini non servono all'app: consigliato usare codici e
  iniziali.
