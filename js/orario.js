/**
 * Date e ore come si scrivono in Italia, qualunque sia la lingua del
 * dispositivo (con un telefono in inglese i campi data del browser
 * diventano mm/dd/yyyy).
 *   - Ogni <input type="date"> dell'app (anche quelli disegnati dopo) viene
 *     affiancato da un campo gg/mm/aaaa con il calendario del sistema a un
 *     tocco: il campo originale resta, nascosto, e tiene il valore AAAA-MM-GG,
 *     così moduli e onchange esistenti funzionano come prima.
 *   - Orari a 24 ore (predefinito) o a 12 ore, scelti nelle impostazioni.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.Orario = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CHIAVE = 'app_ore12';
  var due = function (n) { return String(n).padStart(2, '0'); };
  var ore12 = false;
  try { ore12 = localStorage.getItem(CHIAVE) === '1'; } catch (e) { ore12 = false; }

  function usaOre12() { return ore12; }
  function impostaOre12(v) { ore12 = !!v; try { localStorage.setItem(CHIAVE, ore12 ? '1' : '0'); } catch (e) { /* solo per ora */ } }
  /** Opzioni per toLocaleTimeString / toLocaleString con l'impostazione scelta */
  function opzioniOra(extra) { var o = { hour: '2-digit', minute: '2-digit', hour12: ore12 }; for (var k in (extra || {})) o[k] = extra[k]; return o; }
  /** "16:30" → "16:30" o "4:30 pm" */
  function oraTesto(hhmm, dodici) {
    if (!hhmm) return '';
    var p = String(hhmm).split(':'), h = +p[0], m = +p[1] || 0;
    if (isNaN(h)) return String(hhmm);
    if (!(dodici == null ? ore12 : dodici)) return due(h) + ':' + due(m);
    return (h % 12 || 12) + ':' + due(m) + ' ' + (h < 12 ? 'am' : 'pm');
  }
  function dataEuropea(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }
  /** "6/10/26", "06.10.2026", "6-10", "06102026" → "AAAA-MM-GG"; "" se vuoto; null se non è una data */
  function leggiDataEuropea(testo, oggi) {
    var t = String(testo || '').trim();
    if (!t) return '';
    var m = /^(\d{1,2})[\/.\-\s](\d{1,2})(?:[\/.\-\s](\d{2}|\d{4}))?$/.exec(t);
    if (!m && /^\d{8}$/.test(t)) m = [t, t.slice(0, 2), t.slice(2, 4), t.slice(4)];
    if (!m && /^\d{6}$/.test(t)) m = [t, t.slice(0, 2), t.slice(2, 4), t.slice(4)];
    if (!m) return null;
    var a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : (oggi || new Date()).getFullYear();
    var d = new Date(a, +m[2] - 1, +m[1]);
    if (d.getFullYear() !== a || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[1]) return null;
    return a + '-' + due(+m[2]) + '-' + due(+m[1]);
  }

  // ---------- i campi data ----------
  function potenziaUno(nat) {
    if (nat.dataset.orarioFatto) return;
    nat.dataset.orarioFatto = '1';
    var box = document.createElement('span');
    box.className = 'campo-data-eu';
    var testo = document.createElement('input');
    testo.type = 'text';
    testo.inputMode = 'numeric';
    testo.autocomplete = 'off';
    testo.placeholder = 'gg/mm/aaaa';
    testo.maxLength = 10;
    testo.className = nat.className;
    if (nat.getAttribute('style')) testo.setAttribute('style', nat.getAttribute('style'));
    testo.setAttribute('aria-label', nat.getAttribute('aria-label') || 'Data');
    if (nat.id) { testo.id = nat.id + '-testo'; }
    testo.required = nat.required;
    nat.required = false;
    testo.disabled = nat.disabled;
    testo.value = dataEuropea(nat.value);
    var bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'campo-data-eu-cal';
    bottone.setAttribute('aria-label', 'Scegli dal calendario');
    bottone.innerHTML = '<i class="fa-regular fa-calendar"></i>';
    nat.parentNode.insertBefore(box, nat);
    box.appendChild(testo); box.appendChild(bottone); box.appendChild(nat);
    nat.classList.add('campo-data-eu-nativo');
    nat.tabIndex = -1;
    nat.setAttribute('aria-hidden', 'true');
    var scrivi = function (v) {
      if (nat.value === v) return;
      nat.value = v;
      nat.dispatchEvent(new Event('input', { bubbles: true }));
      nat.dispatchEvent(new Event('change', { bubbles: true }));
    };
    var conferma = function () {
      var v = leggiDataEuropea(testo.value);
      var fuori = v && ((nat.min && v < nat.min) || (nat.max && v > nat.max));
      testo.setCustomValidity(v === null ? 'Scrivi la data come gg/mm/aaaa' : fuori ? 'Data fuori dall\'intervallo' : '');
      box.classList.toggle('errore', v === null || !!fuori);
      if (v === null || fuori) return;
      testo.value = dataEuropea(v);
      scrivi(v);
    };
    testo.addEventListener('change', conferma);
    testo.addEventListener('blur', conferma);
    testo.addEventListener('keydown', function (e) { if (e.key === 'Enter') conferma(); });
    nat.addEventListener('change', function () { testo.value = dataEuropea(nat.value); box.classList.remove('errore'); testo.setCustomValidity(''); });
    bottone.addEventListener('click', function () {
      if (testo.disabled) return;
      try { if (nat.showPicker) { nat.showPicker(); return; } } catch (e) { /* senza showPicker */ }
      nat.focus(); nat.click();
    });
  }
  function potenzia(dove) {
    var r = dove || document;
    if (r.matches && r.matches('input[type=date]')) potenziaUno(r);
    if (r.querySelectorAll) Array.prototype.forEach.call(r.querySelectorAll('input[type=date]'), potenziaUno);
  }
  function avvia() {
    potenzia(document);
    new MutationObserver(function (cambi) {
      cambi.forEach(function (c) { Array.prototype.forEach.call(c.addedNodes, function (n) { if (n.nodeType === 1) potenzia(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
    else avvia();
  }

  return { usaOre12: usaOre12, impostaOre12: impostaOre12, opzioniOra: opzioniOra, oraTesto: oraTesto,
    dataEuropea: dataEuropea, leggiDataEuropea: leggiDataEuropea, potenzia: potenzia };
});
