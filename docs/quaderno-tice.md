# Edizione Centro TICE — progetto

Questa branch (`claude/quaderno-tice`) è l'app completa con in più ciò che serve
al Centro TICE:
- si apre sulla schermata **Presa dati**;
- ha i **programmi** dei bambini;
- **importa i quaderni Numbers**;
- **condivide i dati** tra professioniste e tirocinanti tramite il Drive del
  centro, cifrati e con le versioni precedenti.

Giochi, set, cartelle cliniche, grafici e report restano quelli dell'app
personale. Senza configurazione (`tice-config.js` vuoto) funziona solo sul
dispositivo, come l'app personale.

## Obiettivi

- Registrare le sedute direttamente sul dispositivo, telefono compreso, senza conti a mano.
- Avere storico, criteri e learn unit calcolati automaticamente.
- Condividere i dati tra professioniste e tirocinanti, ciascuna solo sui bambini che segue.
- Tenere i dati nel Drive del centro, **illeggibili per chiunque non abbia la chiave del centro**,
  compresi Google e gli amministratori del dominio.
- Non perdere mai dati: versioni precedenti di ogni bambino, fusione delle modifiche fatte in parallelo.

## Architettura

```
 telefono / tablet / pc                 Google Apps Script                Drive condiviso
┌────────────────────────┐   HTTPS   ┌─────────────────────────┐        ┌──────────────────────┐
│ app (IndexedDB locale) │──────────▶│ custode                 │───────▶│ _config/             │
│  cifra con la chiave   │  token    │  verifica chi sei,      │        │ Pazienti/<id>/       │
│  del centro            │  Google   │  decide cosa puoi fare, │        │   paziente.json      │
│  unisce i conflitti    │◀──────────│  conserva le versioni   │◀───────│   versioni/          │
└────────────────────────┘  buste    └─────────────────────────┘        │ Materiali/           │
                            cifrate                                     └──────────────────────┘
```

- L'app lavora sempre sul suo database locale, anche senza rete. Il modulo di
  sincronizzazione (`js/tice-sync.js`) tiene allineato il Drive: ogni
  salvataggio di un bambino condiviso va in coda e parte dopo pochi secondi.
- Il **custode** (Apps Script, gira con l'account del centro) è l'unico che
  scrive nel Drive. Verifica il token Google di ogni richiesta e i permessi, e
  conserva le versioni. **Non vede i dati**: riceve buste già cifrate.
- Gli utenti non hanno accesso al Drive: entrano dall'app con il loro account
  Google, anche Gmail personale.

## Cifratura

- **Chiave del centro.** È una frase di 25 caratteri (125 bit), generata
  dall'app alla prima configurazione. **La conoscono solo gli admin**: la
  conservano (gestore di password e carta) e sui loro dispositivi la possono
  rivedere ("Mostra la chiave"). Il custode non la conosce.
- **Derivazione.** Dalla frase si ricava la chiave con PBKDF2-SHA256
  (600 000 iterazioni) e il sale del centro (`_config/cifratura.json`, non
  segreto).
- **Consegna agli altri dispositivi, senza mostrarla.** Ogni dispositivo, al
  primo accesso, crea una coppia di chiavi RSA-OAEP 3072 la cui parte privata
  non si può esportare, e registra la parte pubblica sul custode
  (`_config/dispositivi.json`). Alla prima sincronizzazione, l'app di un admin
  cifra la chiave del centro con quella parte pubblica, se la persona è
  abilitata. Il dispositivo la apre come chiave non esportabile: la usa per
  leggere e scrivere, ma non la può mostrare né copiare, e non c'è niente da
  trascrivere. L'abilitazione è automatica. Gli admin vedono l'elenco dei
  dispositivi (persona, tipo, ultimo accesso) e possono toglierli.
- **Buste.** Ogni bambino è compresso (gzip) e cifrato con AES-256-GCM, con un
  IV casuale per salvataggio. Il testo aggiuntivo autenticato `tice:paziente:<id>`
  lega la busta al suo bambino: un file spostato o alterato non si apre.
  Anche il nome nell'elenco è cifrato.
- **Cosa resta in chiaro sul Drive.** Identificativi numerici, numero di
  versione, email e ora di chi ha salvato, l'elenco degli accessi e dei
  dispositivi (email, identificativi assegnati, chiavi pubbliche), i materiali
  (set e immagini, non dati clinici).
- **Revoca.** A chi viene tolto l'accesso, il custode non risponde più e
  cancella i suoi dispositivi. La sua app cancella dati del centro e chiave. Non
  avendo mai visto la chiave, non ha niente da conservare.
- **Cambio della chiave.** Un admin può generare una chiave nuova. L'app
  ricifra tutti i bambini, consegna la nuova chiave ai dispositivi abilitati, e
  il custode rifiuta i salvataggi con la vecchia. Le versioni salvate prima del
  cambio restano con la chiave di allora: le aprono gli admin che la hanno, o
  che ne inseriscono la frase.
- **Limiti da conoscere.**
  - Una persona tecnicamente esperta, mentre ha l'accesso, potrebbe estrarre la
    chiave dal browser con gli strumenti per sviluppatori: in un'app web non si
    può impedire del tutto. Il cambio della chiave serve a chiudere questa porta
    quando serve.
  - L'abilitazione automatica si fida dell'elenco degli accessi. Chi prendesse
    il controllo dell'account del custode potrebbe aggiungersi e farsi
    consegnare la chiave: per questo gli admin vedono ogni dispositivo
    abilitato, con data e persona.
  - Se si perdono tutte le copie della frase, i dati sul Drive restano
    leggibili solo finché qualche dispositivo ha ancora la chiave.
- **Aprire i file senza l'app.** Si usa `strumenti/apri-dati.html` (un file
  solo, funziona offline: frase + file scaricati dal Drive → dati leggibili,
  JSON o CSV per Excel) oppure `tools/decifra_tice.py`. Il file della chiave
  che l'app fa scaricare contiene anche sale e iterazioni.

## Versioni precedenti

A ogni salvataggio il custode sposta la versione attuale in
`Pazienti/<id>/versioni/vNNNNNNNN.json`. Tiene:
- **le ultime 20 versioni**;
- **l'ultima di ogni giorno per 60 giorni**.

Le altre vanno nel cestino di Drive, dove restano altri 30 giorni.

Dall'app si scorrono le versioni di un bambino, con data e autore, e se ne
confronta una con la versione attuale (sedute, ultima seduta, attività). Una
versione si può ripristinare: diventa la versione attuale, e quella di adesso
resta tra le precedenti. Anche le versioni sono cifrate.

## Modifiche in parallelo

Il custode salva con un numero di versione: se nel frattempo un altro
dispositivo ha salvato lo stesso bambino, risponde "conflitto" con la versione
attuale. L'app, che può leggerla, la unisce alla propria (`js/tice-unisci.js`)
partendo dall'ultima versione che entrambi conoscevano:
- **Sedute.** Si uniscono per id: nessuna si perde. Una seduta cancellata da una
  parte e non toccata dall'altra resta cancellata.
- **Attività e target del programma.** Si uniscono per id.
- **Oggetti** (note del giorno, soglie…). Ogni chiave prende il valore cambiato.
  Se cambia da entrambe le parti, vince chi sta salvando.

## Ruoli

| | Admin | Professionista | Tirocinante |
|---|---|---|---|
| Vede i bambini | tutti | assegnati | assegnati |
| Registra sedute, vede lo storico | ✓ | ✓ | ✓ |
| Modifica i programmi, crea e importa bambini | ✓ | ✓ | — |
| Pubblica materiali | ✓ | ✓ | — |
| Archivio set, impostazioni, condivisioni, export, report AI | ✓ | ✓ | — |
| Conosce la chiave, archivia bambini, gestisce persone e dispositivi | ✓ | — | — |

La **versione per le tirocinanti** è più semplice: presa dati, giochi con i set
e cartella clinica in sola lettura. Non ci sono import, programmi, archivio dei
set, impostazioni, Quick Share, sincronizzazioni dirette, Firebase, export
Excel né report AI: tutto ciò che potrebbe far uscire dati dal centro.

Il proprietario del custode è sempre admin. Gli accessi possono avere una data
di scadenza (tirocini). Il custode controlla chi può leggere e salvare ogni
bambino. Il contenuto è cifrato, quindi il limite "le tirocinanti non
modificano i programmi" lo applica l'app, non il custode.

## Presa dati e programmi

All'avvio l'app mostra i bambini. Toccandone uno compaiono le attività del suo
**programma**, ciascuna con il target in corso, e si segna ✓ / P / ✗ con un
tocco. La bozza resta sul dispositivo finché non si salva. Ogni attività diventa
una seduta dello storico (setName "Attività · Target"), quindi cartella
clinica, grafici, criterio ed export le trattano come le altre.

I target di un'attività possono essere:
- **scritti a mano**;
- **presi da una lista del Quaderno**;
- **collegati a un set dell'archivio**, con il suo gioco (TACT, RAN…).

Su tablet e computer, toccare un'attività collegata a un set apre direttamente
il gioco, con bambino, set, tipo di seduta e secondi di T/D già impostati. Al
salvataggio la seduta viene collegata al target e si torna alla presa dati. Una
linguetta in alto riapre la presa dati in qualsiasi momento.

Quando un target raggiunge il criterio (N giorni di fila sopra soglia), l'app
propone il target successivo, un altro o uno nuovo. Non lo decide da sola.

```
patient.programma.attivita[] = { id, nome, area, descrizione, sessionType, mode,
  criterio: { soglia, sedute }, prove, stato: attivo|sospeso|terminato,
  target[]: { id, testo, setId?, mode?, stato: attivo|pianificato|criterio|repertorio|chiuso, inizio, fine } }
```

## Import dai file Numbers

Da **Presa dati → Importa quaderni** si scelgono uno o più file `.numbers`,
anche direttamente da Drive. Il file si legge sul dispositivo
(`js/numbers-reader.js`, verificato cella per cella contro numbers-parser) e si
controlla l'anteprima: bambino nuovo o esistente, attività, sedute, prove da
confermare, avvisi. L'import riconosce:
- un foglio per area e una tabella per attività;
- target su più righe e target paralleli;
- tabelle in percentuale e in conteggi;
- le decisioni scritte a mano;
- le tabelle "Learn unit giornaliere" e "Frequenze";
- il foglio dei programmi terminati.

Quando un dato non è certo (le tabelle che scrivono solo le corrette non dicono
quante prove c'erano), l'import propone un valore da confermare invece di
inventarlo. Reimportare lo stesso file sostituisce le sedute importate da quel
file; quanto registrato o cambiato nell'app resta.

## Materiali

I set si pubblicano sul Drive del centro e le colleghe li scaricano una volta.
Immagini e audio viaggiano per impronta SHA-256, verificata dal custode: un set
aggiornato scarica solo le novità. Niente SVG (possono contenere script).

## Dove sta cosa

| Percorso | Contenuto |
|---|---|
| `js/tice-home.js`, `css/tice.css` | presa dati, programma, import |
| `js/tice-centro.js` | accesso, chiave, persone, versioni, materiali |
| `js/tice-sync.js` | sincronizzazione con il custode |
| `js/tice-cifra.js`, `js/tice-unisci.js` | cifratura, fusione |
| `js/tice-programma.js`, `js/tice-import.js`, `js/numbers-reader.js` | programma, import Numbers |
| `tice-config.js` | indirizzo del custode e Client ID Google |
| `custode/` | il custode: `core.js` (regole), `Code.gs` (Google), `custode-completo.gs` (i due insieme, da incollare), `appsscript.json` |
| `strumenti/apri-dati.html`, `tools/decifra_tice.py` | aprire i dati senza l'app |
| `tools/custode-mock.js` | custode locale per provare senza Google |
| `tools/test-*.js` | test automatici, anche su GitHub a ogni push |
| `docs/configurazione.md` | configurazione passo per passo |
