/**
 * Quaderno TICE — grafici SVG.
 *
 * viewBox fisso + larghezza 100% + altezza automatica: il grafico scala con lo
 * schermo senza deformarsi e resta nitido. Asse X per seduta (come i grafici
 * dei fogli del centro), non per tempo: una pausa di tre settimane non deve
 * schiacciare le sedute in un angolo.
 */
var Grafici = (function () {
  'use strict';
  var h = UI.html;

  function scala(v, a, b, c, d) { return c + (v - a) * (d - c) / ((b - a) || 1); }

  /** Percentuale per seduta di un programma, con soglia e confini tra STO. */
  function programma(serie, opzioni) {
    opzioni = opzioni || {};
    var soglia = opzioni.soglia || 90;
    var L = 640, H = 250, sx = 36, dx = 14, su = 26, giu = 34;
    var n = serie.length;
    if (!n) return h`<p class="sotto">Ancora nessuna seduta.</p>`;
    var X = function (i) { return n === 1 ? (sx + L - dx) / 2 : scala(i, 0, n - 1, sx + 6, L - dx - 6); };
    var Y = function (p) { return scala(p, 0, 100, H - giu, su); };

    var griglia = [0, 25, 50, 75, 100].map(function (p) {
      return h`<line class="griglia" x1="${sx}" x2="${L - dx}" y1="${Y(p)}" y2="${Y(p)}"/><text x="${sx - 6}" y="${Y(p) + 4}" text-anchor="end">${p}</text>`;
    });
    var confini = [];
    for (var i = 1; i < n; i++) {
      if (serie[i].stoId && serie[i].stoId !== serie[i - 1].stoId) {
        var cx = (X(i) + X(i - 1)) / 2;
        confini.push(h`<line class="confine" x1="${cx}" x2="${cx}" y1="${su}" y2="${H - giu}"/>`);
      }
    }
    var punti = serie.filter(function (m) { return m.pct != null; });
    var tracciato = '';
    serie.forEach(function (m, i) {
      if (m.pct == null) return;
      tracciato += (tracciato ? ' L' : 'M') + X(i).toFixed(1) + ' ' + Y(m.pct).toFixed(1);
    });
    var passo = Math.max(1, Math.ceil(n / 7));
    var etichette = serie.map(function (m, i) {
      if (i % passo !== 0 && i !== n - 1) return '';
      return h`<text x="${X(i)}" y="${H - giu + 18}" text-anchor="middle">${Modello.formatoData(m.data).slice(0, 5)}</text>`;
    });
    var cerchi = serie.map(function (m, i) {
      if (m.pct == null) return '';
      return h`<circle class="punto ${m.pct >= soglia ? 'sopra' : ''}" cx="${X(i)}" cy="${Y(m.pct)}" r="${n > 40 ? 3 : 4.5}"><title>${Modello.formatoData(m.data)}: ${m.pct}%${m.percentuale ? '' : ` (${m.v}/${m.tot})`}</title></circle>`;
    });
    var bandiere = (opzioni.criteri || []).map(function (d) {
      var i = serie.findIndex(function (m) { return m.data === d; });
      if (i < 0) return '';
      return h`<line class="confine" x1="${X(i)}" x2="${X(i)}" y1="${su - 4}" y2="${Y(serie[i].pct == null ? 100 : serie[i].pct)}"/>
        <path class="criterio" d="M${X(i)} ${su - 4} v-16 h11 l-3.5 4 3.5 4 h-11z"><title>Criterio raggiunto il ${Modello.formatoData(d)}</title></path>`;
    });
    return h`<svg class="grafico" viewBox="0 0 ${L} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Percentuale di risposte corrette per seduta">
      ${griglia}${confini}
      <line class="soglia" x1="${sx}" x2="${L - dx}" y1="${Y(soglia)}" y2="${Y(soglia)}"/>
      <path class="linea" d="${tracciato}"/>
      ${cerchi}${bandiere}${etichette}
    </svg>
    <div class="legenda"><span><i style="background:var(--acqua-forte)"></i>% corrette</span><span><i style="background:var(--arancio)"></i>soglia ${soglia}% · criterio</span>${confini.length ? h`<span>┆ cambio di STO</span>` : ''}</div>`;
  }

  /** Learn unit giornaliere: prove totali e corrette, con i criteri del giorno. */
  function learnUnit(giorni) {
    var L = 640, H = 240, sx = 36, dx = 12, su = 18, giu = 34;
    var n = giorni.length;
    if (!n) return h`<p class="sotto">Nessun dato nel periodo.</p>`;
    var max = Math.max(10, Math.max.apply(null, giorni.map(function (g) { return g.totali; })));
    var tacca = max > 150 ? 50 : max > 60 ? 20 : 10;
    max = Math.ceil(max / tacca) * tacca;
    var Y = function (v) { return scala(v, 0, max, H - giu, su); };
    var larga = (L - sx - dx) / n;
    var barra = Math.max(2, Math.min(22, larga * 0.7));
    var X = function (i) { return sx + larga * i + larga / 2; };
    var griglia = [];
    for (var v = 0; v <= max; v += tacca) {
      griglia.push(h`<line class="griglia" x1="${sx}" x2="${L - dx}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${sx - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`);
    }
    var passo = Math.max(1, Math.ceil(n / 7));
    var barre = giorni.map(function (g, i) {
      var t = h`<title>${Modello.formatoData(g.data)}: ${g.corrette} corrette su ${g.totali}${g.criteri ? ' · ' + g.criteri + ' criteri' : ''}${g.fonte === 'storico' ? ' (storico)' : ''}</title>`;
      return h`<rect class="barra-tot" x="${X(i) - barra / 2}" y="${Y(g.totali)}" width="${barra}" height="${Math.max(0, Y(0) - Y(g.totali))}" rx="2">${t}</rect>
        <rect class="barra-ok" x="${X(i) - barra / 2}" y="${Y(g.corrette)}" width="${barra}" height="${Math.max(0, Y(0) - Y(g.corrette))}" rx="2">${t}</rect>
        ${g.criteri ? h`<circle class="criterio" cx="${X(i)}" cy="${Y(g.totali) - 8}" r="${Math.min(6, 3 + g.criteri)}"><title>${g.criteri} criteri raggiunti</title></circle>` : ''}
        ${(i % passo === 0 || i === n - 1) ? h`<text x="${X(i)}" y="${H - giu + 18}" text-anchor="middle">${Modello.formatoData(g.data).slice(0, 5)}</text>` : ''}`;
    });
    return h`<svg class="grafico" viewBox="0 0 ${L} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Learn unit giornaliere">
      ${griglia}${barre}
    </svg>
    <div class="legenda"><span><i style="background:var(--acqua)"></i>corrette</span><span><i style="background:var(--superficie-2);border:1px solid var(--bordo)"></i>prove totali</span><span><i style="background:var(--arancio);border-radius:50%"></i>criteri raggiunti</span></div>`;
  }

  return { programma: programma, learnUnit: learnUnit };
})();
