// Configurazione del Quaderno TICE.
// Si compila una volta dopo aver pubblicato il custode (docs/setup-custode.md).
window.QT_CONFIG = Object.assign({
  nomeApp: 'Quaderno TICE',
  // Indirizzo dell'app web del custode (Apps Script): termina con /exec
  custodeUrl: '',
  // Client ID OAuth di tipo "Applicazione web" (Google Cloud): termina con .apps.googleusercontent.com
  googleClientId: '',
  // Solo per sviluppo con tools/custode-mock.js: login senza Google
  dev: false,
}, window.QT_CONFIG || {});
