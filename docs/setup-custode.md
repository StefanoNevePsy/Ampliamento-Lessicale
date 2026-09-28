# Quaderno TICE — installazione

Tempo: circa 30–40 minuti, una volta sola. Serve l'account **centrotice.it** su
cui girerà il custode (nel vostro caso quello di Stefano) e, per un passaggio,
eventualmente chi amministra il dominio centrotice.it.

Alla fine avrete:
- un Drive condiviso del centro con dentro i dati;
- il custode (Apps Script) che è l'unico a leggerlo e scriverlo;
- l'app su `https://stefanonevepsy.github.io/Ampliamento-Lessicale/centro/`,
  installabile su telefoni e tablet.

> Prima di toccare i dati veri potete provare tutto in locale con dati finti:
> vedi [Provare in locale](#provare-in-locale) in fondo.

---

## 1. Il Drive condiviso

1. Apri [drive.google.com](https://drive.google.com) con l'account del centro.
2. Nella colonna a sinistra: **Drive condivisi → Nuovo** → nome `Quaderno TICE`.
   - Se "Drive condivisi" o "Nuovo" non ci sono, l'edizione di Workspace non li
     include o l'amministratore del dominio li ha disattivati: chiedigli di
     abilitarli. In alternativa va bene anche una cartella nel tuo "Il mio Drive",
     ma i file resterebbero legati al tuo account.
3. **Membri**: solo tu e un secondo admin di riserva, entrambi *Gestore*.
   Nessun altro: colleghe e tirocinanti entrano dall'app, non dal Drive.
4. Dentro il Drive condiviso crea una cartella `Dati` e aprila. L'indirizzo è
   `https://drive.google.com/drive/folders/XXXXXXXX`: **copia la parte dopo
   `folders/`**. È l'ID della cartella radice.

## 2. Le credenziali per "Accedi con Google"

Serve solo a far comparire il pulsante di accesso. Si fa una volta.

1. Apri [console.cloud.google.com](https://console.cloud.google.com) con
   l'account del centro → selettore dei progetti in alto → **Nuovo progetto** →
   `Quaderno TICE`.
2. Menu → **Google Auth Platform** (in alcune versioni: *API e servizi →
   Schermata consenso OAuth*):
   - **Branding**: nome app `Quaderno TICE`, email di assistenza la tua.
     Non caricare un logo: farebbe partire una verifica di Google che non serve.
   - **Pubblico / Audience**: tipo **Esterno** (i tirocinanti hanno Gmail
     personali), poi **Pubblica app** → *In produzione*.
     L'app chiede solo nome ed email, quindi Google non richiede verifiche e
     non serve un elenco di utenti di prova.
   - **Accesso ai dati / Ambiti**: non aggiungere nulla.
3. **Client → Crea client** → tipo **Applicazione web** → nome `Quaderno TICE`.
   - *Origini JavaScript autorizzate*:
     - `https://stefanonevepsy.github.io`
     - `http://localhost:8787` (per le prove in locale)
   - *URI di reindirizzamento*: nessuno.
4. Copia il **Client ID** (finisce con `.apps.googleusercontent.com`).
   Non è un segreto: finisce nel codice dell'app.

## 3. Il custode

Con l'account del centro (quello che sarà "proprietario": è sempre admin):

1. Apri [script.google.com](https://script.google.com) → **Nuovo progetto** →
   rinominalo `Custode Quaderno TICE`.
2. **Impostazioni progetto** (ingranaggio) → spunta *Mostra il file manifest
   "appsscript.json" nell'editor*.
3. Nell'editor:
   - apri `appsscript.json` e sostituiscilo con il contenuto di
     [`custode/appsscript.json`](../custode/appsscript.json);
   - apri `Code.gs` e sostituiscilo con [`custode/Code.gs`](../custode/Code.gs);
   - **+ → Script**, chiamalo `core`, e incolla [`custode/core.js`](../custode/core.js).
4. **Impostazioni progetto → Proprietà script → Aggiungi**:
   | Proprietà | Valore |
   |---|---|
   | `CARTELLA_RADICE` | l'ID della cartella del punto 1 |
   | `GOOGLE_CLIENT_ID` | il Client ID del punto 2 |
5. Torna all'editor, scegli la funzione **`configura`** nel menu in alto e
   premi **Esegui**. Google chiede di autorizzare l'accesso a Drive e alle
   richieste esterne: è il custode che chiede di poter lavorare *con il tuo
   account*. Nel registro devono comparire la cartella e il tuo indirizzo come
   proprietario.
6. **Esegui il deployment → Nuovo deployment** → tipo **App web**:
   - *Esegui come*: **Me**
   - *Chi ha accesso*: **Chiunque**
   - **Esegui il deployment** e copia l'**URL dell'app web** (finisce con `/exec`).

   "Chiunque" è corretto: la porta è aperta, ma il custode controlla l'identità
   su ogni richiesta e risponde solo a chi è in elenco. Se l'opzione non compare,
   il dominio centrotice.it la blocca: chi amministra il dominio deve consentire
   le app web di Apps Script accessibili a chiunque.
7. Prova: apri l'URL `/exec` nel browser. Deve rispondere
   `{"ok":true,"servizio":"custode Quaderno TICE",...,"configurato":true}`.

**Aggiornare il custode in futuro**: incolla il nuovo codice, poi *Esegui il
deployment → Gestisci deployment → modifica (matita) → Versione: Nuova versione*.
Così l'URL resta lo stesso e l'app non va toccata.

## 4. Collegare l'app al custode e pubblicarla

1. In [`centro/config.js`](../centro/config.js) compila:
   ```js
   custodeUrl: 'https://script.google.com/macros/s/.../exec',
   googleClientId: '....apps.googleusercontent.com',
   ```
   e fai commit sulla branch `claude/quaderno-tice`. Nessuno dei due è segreto.
2. Su GitHub: **Actions → Deploy su GitHub Pages → Run workflow** → nel campo
   *branch* scrivi `claude/quaderno-tice`.
3. Dopo un paio di minuti l'app è su
   `https://stefanonevepsy.github.io/Ampliamento-Lessicale/centro/`.

Sul sito c'è un solo spazio: pubblicando questa branch ci finiscono sia l'app
personale (invariata) sia `/centro/`. Se poi pubblichi un'altra branch,
`/centro/` sparisce finché non ripubblichi questa. Quando il Quaderno sarà
collaudato, la soluzione definitiva è unire la cartella `centro/` alla branch
principale: non tocca nessun file dell'app personale.

**Installare sui dispositivi** (così si apre come un'app, anche senza rete):
- Android, Chrome: menu ⋮ → *Installa app* (o *Aggiungi a schermata Home*).
- iPhone/iPad, Safari: Condividi → *Aggiungi alla schermata Home*.

## 5. Primo accesso e persone

1. Apri l'app e **Accedi con Google** con l'account del custode: sei admin.
2. **Admin → Persone → Aggiungi una persona** per ogni collega e tirocinante:
   ruolo, bambini assegnati, e per i tirocini la data di fine (dopo quella data
   l'accesso si chiude da solo).
3. Ognuno apre l'app sul proprio dispositivo e accede con la propria email
   Google (del centro o personale, quella che hai inserito).

Togliere l'accesso ha effetto alla richiesta successiva. Al primo collegamento
l'app cancella anche la copia locale dei bambini non più assegnati.

## 6. Importare i quaderni Numbers

Su un computer, per ogni bambino:

```bash
pip install numbers-parser
python tools/import_numbers.py "Mario_R.numbers" --codice PZ-014 --etichetta "M. R." --aula "Aula 1"
```

Il programma stampa un riepilogo (programmi, STO, sedute, avvisi) e crea
`import-PZ-014.json`. Poi nell'app: **Admin → Importa** → scegli il file →
controlla le *prove per seduta* che l'import ha dovuto dedurre → **Importa**.

Consigliato: codice e iniziali, non nome e cognome.

## 7. Materiali condivisi

Dall'app completa (tablet) esporta un set: è un file `.zip`. Nel Quaderno:
**Materiali → Pubblica un set** → scegli lo zip. Le colleghe lo trovano in
Materiali, lo scaricano una volta, e con **Esporta per l'app completa** ottengono
uno zip che l'app completa apre con *Importa*.

---

## Provare in locale

Con Node.js installato, dalla cartella del progetto:

```bash
node tools/custode-mock.js --dev
```

Apri `http://localhost:8787/`: c'è un accesso finto ("Entra" con qualunque
email; `admin@centro.test` è l'admin). I dati finiscono in `.custode-dati/`,
non su Google. Per provare anche il login vero:

```bash
node tools/custode-mock.js --client-id <CLIENT_ID> --proprietario tu@centrotice.it
```

Test automatici (logica del custode, adattatore Apps Script, calcoli clinici):

```bash
node tools/test-custode.js
node tools/test-appsscript.js
node tools/test-modello.js
```

## Se qualcosa non va

| Sintomo | Causa probabile |
|---|---|
| "Manca il Client ID di Google in config.js" | punto 4.1 |
| Il pulsante Google non compare o dà errore di origine | l'indirizzo del sito non è tra le *Origini JavaScript autorizzate* (punto 2.3) |
| "L'account ... non è abilitato" | la persona non è in Admin → Persone, o l'email è diversa |
| "Accesso scaduto" | normale dopo un'ora di inattività: si rientra con Google, le sedute restano salvate |
| Sedute "da inviare" che non partono | nessuna rete, oppure il custode non risponde: prova l'URL `/exec` |
| "Il custode è occupato" | molte scritture nello stesso istante: riprova dopo qualche secondo |
