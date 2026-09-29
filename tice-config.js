// Configurazione dell'edizione Centro TICE.
// Si compila una volta dopo aver pubblicato il custode (docs/configurazione.md).
// Nessuno dei due valori è segreto. Lasciati vuoti, l'app funziona solo sul
// dispositivo, come l'app personale.
window.TICE_CONFIG = Object.assign({
  // Indirizzo dell'app web del custode (Apps Script): termina con /exec
  custodeUrl: '',
  // Client ID OAuth di tipo "Applicazione web" (Google Cloud): termina con .apps.googleusercontent.com
  googleClientId: '',
  // App desktop (Mac, Windows): client OAuth di tipo "App desktop". Per le app
  // installate Google considera anche il "client secret" non segreto.
  googleDesktopClientId: '',
  googleDesktopClientSecret: '',
  // Solo per sviluppo con tools/custode-mock.js --dev: accesso senza Google
  dev: false,
}, window.TICE_CONFIG || {});
