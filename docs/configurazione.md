# Configurazione dell'edizione Centro TICE

Questa guida porta l'app del Centro TICE da "funziona solo su questo dispositivo" a
**"i dati dei bambini sono condivisi tra colleghe e tirocinanti, cifrati, sul Drive del centro"**.
Si fa una volta sola.

| | |
|---|---|
| **Tempo** | 40–60 minuti |
| **Serve** | l'account del centro (`…@centrotice.it`) che ospiterà i dati, l'accesso a GitHub per pubblicare l'app, e forse chi amministra il dominio centrotice.it (solo se qualcosa è bloccato) |
| **Alla fine** | un Drive condiviso con i dati cifrati, il custode che lo protegge, l'app online e installabile, la chiave del centro al sicuro, le persone abilitate |

> [!TIP]
> Prima di usare dati veri potete provare tutto con dati finti sul vostro computer:
> vedi [Appendice A — Prova in locale](#appendice-a--prova-in-locale).

---

## Come funziona, in breve

```
  telefoni, tablet, pc                 custode (Google Apps Script)            Drive condiviso del centro
 ┌──────────────────────┐   cifrati   ┌────────────────────────────┐         ┌──────────────────────────┐
 │ app Centro TICE      │ ──────────▶ │ controlla chi sei e cosa   │ ──────▶ │ Dati/                    │
 │ (lavora anche senza  │             │ puoi fare; conserva le     │         │   Pazienti/  (cifrati)   │
 │  rete)               │ ◀────────── │ versioni precedenti        │ ◀────── │   Materiali/             │
 └──────────────────────┘             └────────────────────────────┘         │   _config/               │
                                                                             └──────────────────────────┘
```

- Le persone **non** hanno accesso al Drive: entrano dall'app con il loro account
  Google, anche Gmail personale. Il **custode** gira con l'account del centro ed è
  l'unico che legge e scrive nel Drive.
- I dati escono dai dispositivi **già cifrati** con la *chiave del centro*: sul Drive
  nessuno può leggerli senza chiave, nemmeno Google o chi amministra il dominio.
- La chiave la conoscono **solo gli amministratori**. Agli altri dispositivi l'app la
  consegna da sola, senza mostrarla.

---

## Cosa annotare durante la configurazione

Tieni aperto un foglio: nei passi seguenti raccoglierai questi tre valori.
**Nessuno dei tre è segreto.**

| Valore | Dove lo trovi | Esempio |
|---|---|---|
| **ID della cartella** | Passo 1 | `1AbCdEfGhIjKlMnOpQrStUvWxYz` |
| **Client ID Google** | Passo 2 | `123456789-abc….apps.googleusercontent.com` |
| **URL del custode** | Passo 3 | `https://script.google.com/macros/s/AKfy…/exec` |
| *Client ID e secret desktop* | Passo 2.6, solo per l'app installata su Mac e Windows | `…-desk….apps.googleusercontent.com`, `GOCSPX-…` |

La **chiave del centro** (passo 5) invece **è segreta** e non va su questo foglio.

---

## Passo 1 — Il Drive condiviso

*Con l'account del centro. 5 minuti.*

1. Apri [drive.google.com](https://drive.google.com).
2. Nella colonna a sinistra: **Drive condivisi → Nuovo** → nome `Centro TICE — Dati`.
   > [!NOTE]
   > Se "Drive condivisi" o "Nuovo" non compaiono, l'amministratore del dominio li ha
   > disattivati: chiedigli di abilitarli. In alternativa funziona anche una cartella nel
   > tuo "Il mio Drive", ma i file resterebbero legati al tuo account.
3. **Gestisci membri**: aggiungi solo te e un secondo amministratore di riserva, entrambi
   come **Gestore**. Nessun altro: colleghe e tirocinanti entrano dall'app.
4. Dentro il Drive condiviso crea una cartella **`Dati`** e aprila.
5. Guarda l'indirizzo nel browser: `https://drive.google.com/drive/folders/`**`1AbCd…`**.
   La parte dopo `folders/` è l'**ID della cartella**: annotalo.

---

## Passo 2 — Il pulsante "Accedi con Google"

*Con l'account del centro. 10 minuti. Serve solo a far comparire il pulsante di accesso
nell'app: l'app chiede a Google chi sei, niente di più (niente Drive, niente posta).*

1. Apri [console.cloud.google.com](https://console.cloud.google.com) → selettore dei
   progetti in alto → **Nuovo progetto** → nome `Centro TICE` → **Crea**.
2. Menu ☰ → **Google Auth Platform** (in alcune versioni: *API e servizi → Schermata
   consenso OAuth*) → **Inizia**:
   - **Informazioni sull'app**: nome `Centro TICE`, email di assistenza la tua.
     *Non caricare un logo*: farebbe partire una verifica di Google inutile.
   - **Pubblico**: **Esterno** (le tirocinanti usano Gmail personali).
   - **Dati di contatto**: la tua email → **Crea**.
3. Sempre in Google Auth Platform → **Pubblico** → **Pubblica app** → conferma
   *In produzione*. L'app chiede solo nome ed email, quindi Google non richiede verifiche
   e non serve un elenco di utenti di prova.
4. **Client → Crea client**:
   - Tipo di applicazione: **Applicazione web**, nome `Centro TICE`.
   - **Origini JavaScript autorizzate** → *Aggiungi URI*:
     - `https://stefanonevepsy.github.io`
     - `http://localhost:8787` *(solo per le prove in locale)*
   - **URI di reindirizzamento**: lascia vuoto → **Crea**.
5. Copia il **Client ID** (finisce con `.apps.googleusercontent.com`) e annotalo.
   Il *client secret* non serve: ignoralo.
6. *(Facoltativo: solo se userete l'app installata su Mac o Windows, vedi passo 8.)*
   **Client → Crea client** → tipo **App desktop**, nome `Centro TICE desktop` → **Crea**.
   Annota **Client ID** e **Client secret**.
   > [!NOTE]
   > Per le app installate Google considera il secret non segreto: finisce nell'app,
   > come il Client ID. L'app desktop apre l'accesso nel browser del computer (Google non
   > lo consente dentro le finestre delle app) e poi torna da sola.

---

## Passo 3 — Il custode

*Con l'account del centro. 10 minuti. Il custode è il piccolo programma che fa da
portinaio al Drive.*

1. Apri [script.google.com](https://script.google.com) → **Nuovo progetto** → in alto
   rinominalo `Custode Centro TICE`.
2. **Impostazioni progetto** (ingranaggio a sinistra) → spunta
   **Mostra il file manifest "appsscript.json" nell'editor**.
3. Torna all'**Editor** (`< >` a sinistra):
   1. Apri `appsscript.json`, cancella tutto e incolla il contenuto di
      [`custode/appsscript.json`](../custode/appsscript.json).
   2. Apri `Code.gs`, cancella tutto e incolla il contenuto di
      [`custode/custode-completo.gs`](../custode/custode-completo.gs) *(un file solo,
      contiene tutto il custode)*.
   3. Salva (💾 o `Ctrl+S`).
4. **Impostazioni progetto → Proprietà script → Aggiungi proprietà script**:

   | Proprietà | Valore |
   |---|---|
   | `CARTELLA_RADICE` | l'ID della cartella (passo 1) |
   | `GOOGLE_CLIENT_ID` | il Client ID (passo 2) |
   | `GOOGLE_CLIENT_ID_DESKTOP` | *facoltativo*: il Client ID desktop (passo 2.6) |

   → **Salva proprietà script**.
5. Torna all'Editor, nel menu a tendina in alto scegli la funzione **`configura`** e premi
   **▶ Esegui**. Google chiede di autorizzare:
   - *Accedi a Drive* e *Connettiti a un servizio esterno*: è il custode che chiede di
     lavorare con il tuo account.
   - Se compare "Google non ha verificato questa app": **Avanzate → Vai a Custode Centro
     TICE (non sicuro)**. È normale per uno script tuo.

   Nel **Registro di esecuzione** devono comparire il nome della cartella, la tua email
   come proprietario e il Client ID.
6. **Esegui il deployment → Nuovo deployment** → ingranaggio **Seleziona tipo → App web**:
   - *Descrizione*: `Centro TICE`
   - *Esegui come*: **Me** (la tua email)
   - *Chi ha accesso*: **Chiunque**
   - **Esegui il deployment** → copia l'**URL dell'app web** (finisce con `/exec`) e
     annotalo.

   > [!IMPORTANT]
   > "Chiunque" è corretto: la porta è aperta, ma il custode controlla l'identità a ogni
   > richiesta e risponde solo a chi è in elenco. Se l'opzione "Chiunque" non c'è, il
   > dominio la blocca: chi amministra centrotice.it deve consentire le app web di Apps
   > Script accessibili a chiunque (Console di amministrazione → App → Google Workspace →
   > Drive e Documenti / Apps Script).
7. **Verifica**: apri l'URL `/exec` in una finestra del browser. Deve comparire:
   ```json
   {"ok":true,"servizio":"custode Quaderno TICE","versione":"2.0.0","configurato":true}
   ```

---

## Passo 4 — Collegare l'app e pubblicarla

*5 minuti, più qualche minuto di attesa.*

1. Nel repository apri [`tice-config.js`](../tice-config.js) e inserisci i due valori:
   ```js
   custodeUrl: 'https://script.google.com/macros/s/AKfy…/exec',
   googleClientId: '123456789-abc….apps.googleusercontent.com',
   // solo per l'app desktop (passo 2.6)
   googleDesktopClientId: '…-desk….apps.googleusercontent.com',
   googleDesktopClientSecret: 'GOCSPX-…',
   ```
   Salva con un commit sulla branch `claude/quaderno-tice`.
2. **Solo la prima volta**: su GitHub → **Settings → Pages → Build and deployment →
   Source: GitHub Actions**.
3. GitHub → **Actions → Deploy su GitHub Pages → Run workflow** → nel campo *branch*
   scrivi `claude/quaderno-tice` → **Run workflow**.
4. Dopo 2–3 minuti l'app è su
   **`https://stefanonevepsy.github.io/Ampliamento-Lessicale/`**.

> [!NOTE]
> Sul sito c'è un solo spazio: pubblicando questa branch, il sito diventa l'edizione del
> centro. È comunque l'app completa: senza accesso funziona solo sul dispositivo, come
> quella personale. Ripubblicando un'altra branch torna quella.

---

## Passo 5 — Primo accesso e chiave del centro

*Con l'account del centro, dall'app. 5 minuti. È il passo più importante.*

1. Apri l'app → riquadro **Collega l'app al Drive del centro** → **Accedi con Google**
   con l'account del centro. Sei amministratore.
2. Compare **Manca la chiave del centro** → **Crea la chiave del centro**. L'app mostra una
   frase di 25 caratteri, per esempio `Q9573-YW38J-9E1N1-0ED9A-GCJJP`.
3. **Prima di continuare**, conservala:
   - [ ] **Scarica** il file della chiave. Contiene anche i dati tecnici per aprire i file
     senza l'app.
   - [ ] **Stampala** e mettila in un luogo chiuso (armadio, cassaforte).
   - [ ] Salvala in un **gestore di password** (quello del browser va bene, meglio uno
     condiviso tra gli amministratori).
   - [ ] **Non** mandarla per email o chat, **non** darla a colleghe e tirocinanti.
4. Riscrivi l'ultimo gruppo di 5 caratteri per confermare → **Crea la chiave**.

> [!WARNING]
> Se si perdono **tutte** le copie della chiave, i dati sul Drive non si recuperano più: è
> il prezzo del fatto che nessun altro può leggerli. Due copie in due posti diversi.

Da qui in poi:
- **Gli altri dispositivi non inseriscono niente.** Al primo accesso restano "in attesa
  della chiave" e la ricevono da soli appena l'app di un amministratore è aperta e
  collegata. La usano senza vederla.
- Gli amministratori la rivedono in **Collegamento con il centro → Mostra la chiave**.
  Lì trovano anche **Dispositivi**, per vedere chi ha ricevuto la chiave e togliere un
  dispositivo, e **Cambia la chiave**, per sostituirla.

---

## Passo 6 — Le persone

*Dall'app, con un account amministratore. 2 minuti a persona.*

Menu **⋮ → Persone e accessi → Aggiungi una persona**:

| Campo | Cosa mettere |
|---|---|
| Email Google | quella con cui la persona entrerà (del centro o Gmail personale) |
| Nome | come comparirà nelle sedute |
| Ruolo | vedi tabella sotto |
| Accesso fino al | per i tirocini: dopo questa data l'accesso si chiude da solo |
| Bambini assegnati | "Tutti", oppure quelli che segue |

| Ruolo | Cosa può fare |
|---|---|
| **Amministratore** | tutto: persone, chiave, dispositivi, archiviare bambini |
| **Professionista** | bambini assegnati: sedute, programmi, nuovi bambini, import, materiali, cartella completa |
| **Tirocinante** | versione semplice: presa dati, giochi, cartella in sola lettura; niente import, programmi, archivio, impostazioni, condivisioni, export, report AI |

Poi ognuno apre l'app sul proprio dispositivo, accede con la propria email e aspetta la
chiave: arriva da sola alla prima sincronizzazione di un amministratore.

Per **togliere l'accesso**: apri la persona → **Togli dall'elenco** (o togli la spunta
*Accesso attivo*). Ha effetto alla richiesta successiva: i suoi dispositivi perdono dati del
centro e chiave.

---

## Passo 7 — I primi dati

**Quaderni Numbers esistenti.** In *Presa dati* → **Importa quaderni** → scegli uno o più
file `.numbers`, anche direttamente da Drive dal telefono. Poi:
1. controlla l'anteprima: bambino nuovo o esistente, attività, sedute, avvisi;
2. conferma le *prove per seduta* che l'import ha dovuto dedurre;
3. premi **Importa**.

Il file si legge sul dispositivo; il bambino va sul Drive già cifrato. Ricordati di
assegnarlo alle persone che lo seguono (passo 6).

**Materiali.** Menu ⋮ → **Materiali del centro → Pubblica un set del tuo archivio**. Le
colleghe lo scaricano una volta e lo usano nei giochi e nei programmi, anche senza rete.

---

## Passo 8 — Installare l'app sui dispositivi

Ci sono due modi. Funzionano entrambi senza rete e usano gli stessi dati.

### A. Dal browser (consigliato, tutti i dispositivi)

Si apre in una finestra sua, con l'icona del centro, e si aggiorna da sola a ogni
pubblicazione: quando c'è una versione nuova compare **Aggiorna**.

| Dispositivo | Come |
|---|---|
| Android, telefono o tablet (Chrome) | menu ⋮ → **Installa app** |
| iPhone / iPad (Safari) | Condividi ⎋ → **Aggiungi alla schermata Home** |
| Mac (Chrome o Edge) | icona ⊕ nella barra dell'indirizzo → **Installa** |
| Mac (Safari, macOS 14+) | File → **Aggiungi al Dock** |
| Windows (Chrome o Edge) | icona ⊕ nella barra dell'indirizzo → **Installa** |

Dall'app si può installare anche dal menu ⋮ della presa dati → **Installa l'app**
(Chrome ed Edge).

### B. App desktop (Mac, Windows)

Serve se volete l'app vera e propria, per esempio per lo scontorno delle immagini con
il modello installato sul PC.
1. Serve il client desktop: passo 2.6, passo 3.4 e passo 4.
2. GitHub → **Actions → Build Desktop & Android → Run workflow**:
   - in *Use workflow from* scegli `claude/quaderno-tice`;
   - target `macos` o `windows`.
3. A fine lavoro scarica l'installatore dagli **Artifacts** della corsa: `.dmg` per Mac,
   `.exe` per Windows.

L'app si chiama **Centro TICE** e si installa accanto all'app personale, senza
sostituirla. Per l'accesso, **Accedi con Google** apre il browser del computer: si
completa lì e si torna da soli all'app. Poi l'accesso si rinnova in silenzio; su Mac e
Windows resta salvato, cifrato dal sistema operativo.

> [!NOTE]
> Gli installatori non sono firmati con un certificato a pagamento.
> - **Mac**: al primo avvio tasto destro sull'app → **Apri** → **Apri**.
> - **Windows**: se compare "Windows ha protetto il PC", → **Ulteriori informazioni →
>   Esegui comunque**.
>
> L'app desktop non si aggiorna da sola: per una versione nuova si ripete il punto 2.

> [!TIP]
> Sui dispositivi condivisi del centro (tablet d'aula) usate il blocco schermo, e alla fine
> del tirocinio fate **Esci → Esci e cancella i dati del centro da questo dispositivo**.

---

## Dopo la configurazione

### Backup e versioni precedenti
- Ogni salvataggio conserva la versione precedente di quel bambino: le **ultime 20** e
  l'**ultima di ogni giorno per 60 giorni**. Menu del bambino → **Versioni precedenti**
  per confrontare e ripristinare.
- Per una copia fuori da Google: ogni tanto scarica la cartella `Dati` (tasto destro →
  Scarica) su un disco esterno. È cifrata, quindi può stare anche fuori dal centro.

### Aprire i dati senza l'app
- [`strumenti/apri-dati.html`](../strumenti/apri-dati.html): un file che si apre con il
  browser anche offline. Si danno il file della chiave e i file scaricati dal Drive (anche
  la cartella intera) e si ottengono i dati leggibili (JSON) o le sedute (CSV per Excel).
  Conservane una copia insieme alla chiave.
- [`tools/decifra_tice.py`](../tools/decifra_tice.py), per chi usa Python:
  ```bash
  pip install cryptography
  python decifra_tice.py --frase XXXXX-XXXXX-XXXXX-XXXXX-XXXXX \
      --config Dati/_config/cifratura.json --csv Dati/Pazienti/*/paziente.json
  ```

### Cambiare la chiave
Quando qualcuno potrebbe averla conservata, per esempio una persona tecnica che non
collabora più: **Collegamento con il centro → Cambia la chiave**.
- L'app ricifra tutti i bambini e consegna la nuova chiave ai dispositivi abilitati.
- Conserva anche la frase vecchia: apre le versioni salvate prima del cambio.
- Tieni l'app aperta finché non finisce. Se si interrompe, rilanciala e riprende da dove
  si era fermata.

### Aggiornare il custode
Quando cambia il codice del custode:
1. Nell'editor di Apps Script incolla il nuovo [`custode/custode-completo.gs`](../custode/custode-completo.gs)
   al posto di `Code.gs` e salva.
2. **Esegui il deployment → Gestisci deployment → ✏️ modifica → Versione: Nuova versione →
   Esegui il deployment**.

L'URL resta lo stesso e l'app non va toccata. Controlla la versione aprendo l'URL `/exec`.

### Un custode più pronto
Il custode tiene in memoria (la cache di Apps Script) i file che legge più spesso:
accessi, chiave, elenco dei bambini, dispositivi, materiali. Così entrare e
sincronizzare costa una frazione di prima; salvare resta un po' più lento, perché
ogni salvataggio scrive davvero su Drive.

- **Risveglio (facoltativo, consigliato).** Apps Script, quando per un po' nessuno lo
  usa, alla prima richiesta impiega qualche secondo a ripartire. Nell'editor scegli la
  funzione **attivaRisveglio** e premi ▶ **Esegui** (consenti la creazione di un
  attivatore): ogni 10 minuti, tra le 7 e le 21, il custode si sveglia da solo per circa
  un secondo. Per toglierlo: **disattivaRisveglio**.
- **Dopo una modifica fatta a mano ai file nel Drive** (da evitare, per esempio un file
  ripristinato da una versione precedente): esegui **svuotaCache** (o
  **ricostruisciCache**, che la svuota e ricostruisce l'elenco dei bambini), altrimenti
  per qualche ora il custode continua a usare la copia che ha in memoria.

---

## Se qualcosa non va

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| Nell'app non c'è il riquadro "Collega l'app al Drive del centro" | `tice-config.js` vuoto, o sito non ripubblicato | passo 4 |
| Il pulsante Google non compare o dà "origin mismatch" | l'indirizzo del sito non è tra le origini autorizzate | passo 2.4 |
| "L'account … non è abilitato" | la persona non è in Persone e accessi, o ha usato un'altra email | passo 6 |
| Un dispositivo resta "in attesa della chiave" | nessun amministratore ha aperto l'app dopo il suo primo accesso | apri l'app da amministratore → *Sincronizza ora* |
| "Questa non è la chiave del centro" | frase sbagliata | ricontrolla; l'app tollera minuscole, spazi, O/0 e I/1 |
| "Accesso scaduto" | normale dopo circa un'ora | rientra con Google: nulla va perso |
| Bambini "da inviare" che non partono | niente rete, o il custode non risponde | apri l'URL `/exec`: deve rispondere `"ok":true` |
| "Il custode è occupato" | tante scritture nello stesso istante | riprova dopo qualche secondo |
| L'URL `/exec` dice `"configurato":false` | mancano le proprietà dello script | passo 3.4 |
| All'URL `/exec` chiede di accedere a Google | deployment con accesso diverso da "Chiunque" | passo 3.6 |
| App desktop: "Client ID desktop mancante" o il pulsante apre il login web | `googleDesktopClientId` vuoto in `tice-config.js`, o installatore creato prima di compilarlo | passo 4, poi rifai l'installatore |
| App desktop: dopo l'accesso nel browser il custode dice "Accesso scaduto o non valido" | manca `GOOGLE_CLIENT_ID_DESKTOP` nelle proprietà del custode | passo 3.4 |
| L'app installata non propone "Aggiorna" | l'aggiornamento arriva quando si riapre l'app con la rete | chiudi e riapri |

---

## Appendice A — Prova in locale

Con [Node.js](https://nodejs.org) installato, dalla cartella del progetto:

```bash
node tools/custode-mock.js --dev
```

Apri `http://localhost:8787/`: c'è un accesso finto, basta un'email qualunque
(`admin@centro.test` è l'amministratore). I dati, cifrati, finiscono nella cartella
`.custode-dati/`, non su Google. Per provare anche l'accesso Google vero:

```bash
node tools/custode-mock.js --client-id <CLIENT_ID> --proprietario tu@centrotice.it
```

## Appendice B — Test automatici

Girano anche su GitHub a ogni modifica:

```bash
node tools/componi-custode.js --verifica   # il file unico del custode è aggiornato
node tools/test-custode.js                 # regole del custode
node tools/test-appsscript.js              # custode con servizi Google simulati
node tools/test-tice-sync.js               # cifratura, consegna della chiave, fusione
node tools/test-tice-import.js             # import dei quaderni Numbers
node tools/test-accesso-desktop.js         # accesso dell'app desktop (Google finto)
```
