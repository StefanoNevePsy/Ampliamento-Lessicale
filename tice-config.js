// Configurazione dell'edizione Centro TICE.
// Si compila una volta dopo aver pubblicato il custode (docs/configurazione.md).
// Nessuno dei due valori è segreto. Lasciati vuoti, l'app funziona solo sul
// dispositivo, come l'app personale.
window.TICE_CONFIG = Object.assign({
  // Indirizzo dell'app web del custode (Apps Script): termina con /exec
  custodeUrl: 'https://script.google.com/macros/s/AKfycbwDP70o6VK6VkPJX6hfhhFFGSpTK-hrav0Mu-XwkZ701CEerg1eH9mUVpUTnPAKrWnH4g/exec',
  // Client ID OAuth di tipo "Applicazione web" (Google Cloud): termina con .apps.googleusercontent.com
  googleClientId: '838795760240-hhjuro8tq34mdekktjobo3399k2sufll.apps.googleusercontent.com',
  // App desktop (Mac, Windows): client OAuth di tipo "App desktop". Per le app
  // installate Google considera anche il "client secret" non segreto.
  googleDesktopClientId: '',
  googleDesktopClientSecret: '',
  // Solo per sviluppo con tools/custode-mock.js --dev: accesso senza Google
  dev: false,
}, window.TICE_CONFIG || {});
