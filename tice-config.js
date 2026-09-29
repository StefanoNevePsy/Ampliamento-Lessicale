// Configurazione dell'edizione Centro TICE.
// Si compila una volta dopo aver pubblicato il custode (docs/setup-custode.md).
// Nessuno dei due valori è segreto. Lasciati vuoti, l'app funziona solo sul
// dispositivo, come l'app personale.
window.TICE_CONFIG = Object.assign({
  // Indirizzo dell'app web del custode (Apps Script): termina con /exec
  custodeUrl: '',
  // Client ID OAuth di tipo "Applicazione web" (Google Cloud): termina con .apps.googleusercontent.com
  googleClientId: '',
  // Solo per sviluppo con tools/custode-mock.js --dev: accesso senza Google
  dev: false,
}, window.TICE_CONFIG || {});
