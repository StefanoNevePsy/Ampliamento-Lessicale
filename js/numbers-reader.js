/**
 * Lettore di file Apple Numbers (.numbers) nel browser.
 *
 * Il formato (IWA) è uno zip con i file Index/*.iwa (a volte dentro un
 * Index.zip annidato). Ogni .iwa è una sequenza di blocchi Snappy; decompressi
 * contengono oggetti Protobuf identificati da un numero, che si riferiscono
 * l'uno all'altro. Da qui si ricostruiscono fogli → tabelle → celle.
 *
 * Legge solo i valori (testo, numeri, date, booleani, durate): niente stili né
 * formule. Riferimento: il progetto open source numbers-parser.
 *
 * Uso: NumbersReader.leggi(arrayBuffer) → Promise<[{nome, tabelle:[{nome, righe}]}]>
 * dove righe è una matrice di valori: string | number | Date | boolean | null.
 * Richiede JSZip (globale nel browser, o passato come secondo argomento).
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.NumbersReader = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Snappy (blocco grezzo, senza framing) ----------
  function snappy(src) {
    var pos = 0, lunghezza = 0, shift = 0, b;
    do { b = src[pos++]; lunghezza += (b & 0x7f) * Math.pow(2, shift); shift += 7; } while (b & 0x80);
    var out = new Uint8Array(lunghezza), o = 0;
    while (pos < src.length) {
      var tag = src[pos++], tipo = tag & 3, len, dist;
      if (tipo === 0) {
        len = tag >>> 2;
        if (len >= 60) {
          var nb = len - 59; len = 0;
          for (var i = 0; i < nb; i++) len |= src[pos++] << (8 * i);
          len >>>= 0;
        }
        len += 1;
        out.set(src.subarray(pos, pos + len), o); pos += len; o += len;
        continue;
      }
      if (tipo === 1) { len = ((tag >>> 2) & 7) + 4; dist = ((tag >>> 5) << 8) | src[pos++]; }
      else if (tipo === 2) { len = (tag >>> 2) + 1; dist = src[pos] | (src[pos + 1] << 8); pos += 2; }
      else { len = (tag >>> 2) + 1; dist = (src[pos] | (src[pos + 1] << 8) | (src[pos + 2] << 16) | (src[pos + 3] << 24)) >>> 0; pos += 4; }
      if (!dist || dist > o) throw new Error('File Numbers danneggiato (snappy)');
      for (var k = 0; k < len; k++, o++) out[o] = out[o - dist];
    }
    return out;
  }

  // ---------- Protobuf generico ----------
  // Un messaggio diventa { numeroCampo: [valori...] }. I varint restano numeri
  // (sicuri fino a 2^53: gli identificativi di Numbers ci stanno); i campi
  // length-delimited restano Uint8Array, da decodificare quando serve.
  function pb(buf) {
    var m = {}, pos = 0;
    function varint() {
      var v = 0, mul = 1, b;
      do { b = buf[pos++]; v += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
      return v;
    }
    while (pos < buf.length) {
      var chiave = varint(), campo = Math.floor(chiave / 8), wt = chiave & 7, val;
      if (wt === 0) val = varint();
      else if (wt === 1) { val = buf.subarray(pos, pos + 8); pos += 8; }
      else if (wt === 2) { var l = varint(); val = buf.subarray(pos, pos + l); pos += l; }
      else if (wt === 5) { val = buf.subarray(pos, pos + 4); pos += 4; }
      else throw new Error('File Numbers danneggiato (protobuf ' + wt + ')');
      (m[campo] || (m[campo] = [])).push(val);
    }
    return m;
  }
  function uno(m, f) { return m && m[f] ? m[f][0] : undefined; }
  function sub(m, f) { var v = uno(m, f); return v ? pb(v) : null; }
  function subs(m, f) { return (m && m[f] ? m[f] : []).map(pb); }
  function ref(m, f) { var r = sub(m, f); return r ? uno(r, 1) : undefined; }
  function refs(m, f) { return subs(m, f).map(function (r) { return uno(r, 1); }); }
  var utf8 = new TextDecoder('utf-8');
  function str(m, f) { var v = uno(m, f); return v ? utf8.decode(v) : ''; }

  // ---------- IWA → mappa degli oggetti ----------
  function leggiIwa(bytes, oggetti) {
    var pos = 0, parti = [], totale = 0;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos] !== 0) throw new Error('File Numbers danneggiato (iwa)');
      var len = bytes[pos + 1] | (bytes[pos + 2] << 8) | (bytes[pos + 3] << 16);
      var blocco = snappy(bytes.subarray(pos + 4, pos + 4 + len));
      parti.push(blocco); totale += blocco.length; pos += 4 + len;
    }
    var dati = new Uint8Array(totale), o = 0;
    parti.forEach(function (p) { dati.set(p, o); o += p.length; });
    pos = 0;
    while (pos < dati.length) {
      var l = 0, mul = 1, b;
      do { b = dati[pos++]; l += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
      var info = pb(dati.subarray(pos, pos + l)); pos += l;
      var id = uno(info, 1);
      subs(info, 2).forEach(function (mi, i) {
        var n = uno(mi, 3) || 0;
        if (i === 0 && !(id in oggetti)) oggetti[id] = { tipo: uno(mi, 1), dati: dati.subarray(pos, pos + n) };
        pos += n;
      });
    }
  }

  // ---------- valori delle celle ----------
  var EPOCA = Date.UTC(2001, 0, 1);
  function decimal128(b) {
    var esp = (((b[15] & 0x7f) << 7) | (b[14] >> 1)) - 6176;
    var m = BigInt(b[14] & 1);
    for (var i = 13; i >= 0; i--) m = m * 256n + BigInt(b[i]);
    var v = Number(m) * Math.pow(10, esp);
    // arrotonda gli artefatti binari (0.1*3 ecc.) mantenendo 15 cifre
    v = Number(v.toPrecision(15));
    return b[15] & 0x80 ? -v : v;
  }

  function cella(buf, stringhe, ricchi) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] !== 5) throw new Error('Versione di Numbers non supportata (cella v' + buf[0] + ')');
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var flags = dv.getInt32(8, true), o = 12, d128 = null, dbl = null, sec = null, sid = null, rid = null;
    if (flags & 0x1) { d128 = decimal128(buf.subarray(o, o + 16)); o += 16; }
    if (flags & 0x2) { dbl = dv.getFloat64(o, true); o += 8; }
    if (flags & 0x4) { sec = dv.getFloat64(o, true); o += 8; }
    if (flags & 0x8) { sid = dv.getInt32(o, true); o += 4; }
    if (flags & 0x10) { rid = dv.getInt32(o, true); o += 4; }
    switch (buf[1]) {
      case 0: return null;
      case 2: case 10: return d128;
      case 3: return stringhe[sid] != null ? stringhe[sid] : '';
      case 5: return new Date(EPOCA + sec * 1000);
      case 6: return dbl > 0;
      case 7: return dbl; // durata in secondi
      case 8: return null; // errore di formula
      case 9: return ricchi(rid);
      default: return null;
    }
  }

  // ---------- modello del documento ----------
  function documento(oggetti) {
    function obj(id) { var o = oggetti[id]; return o ? pb(o.dati) : null; }
    function tipo(id) { return oggetti[id] && oggetti[id].tipo; }

    // TableDataList: key → messaggio della voce (entries=3, anche nei segmenti=4)
    function lista(id) {
      var l = obj(id), voci = {};
      if (!l) return voci;
      function aggiungi(e) { voci[uno(e, 1)] = e; }
      subs(l, 3).forEach(aggiungi);
      refs(l, 4).forEach(function (sid) { subs(obj(sid), 3).forEach(aggiungi); });
      return voci;
    }

    function tabella(modelId) {
      var tm = obj(modelId);
      var nRighe = uno(tm, 6) || 0, nCol = uno(tm, 7) || 0;
      var ds = sub(tm, 4);
      var stringhe = {};
      var ls = lista(ref(ds, 4));
      Object.keys(ls).forEach(function (k) { stringhe[k] = str(ls[k], 3); });
      var ricchiLista = null, ricchiCache = {};
      function ricchi(k) {
        if (k in ricchiCache) return ricchiCache[k];
        if (!ricchiLista) ricchiLista = lista(ref(ds, 17));
        var e = ricchiLista[k], testo = '';
        if (e) {
          var payload = obj(ref(e, 9));
          var storage = payload && obj(ref(payload, 1));
          testo = storage ? str(storage, 3) : '';
        }
        return (ricchiCache[k] = testo);
      }

      // quale buffer appartiene a quale riga
      var mappa = {}, idx = 0;
      refs(sub(ds, 1), 2).forEach(function (bid) {
        subs(obj(bid), 2).forEach(function (h) { mappa[uno(h, 1) || 0] = idx++; });
      });
      // buffer di tutte le righe di tutti i tile, in ordine
      var bufferRighe = [];
      subs(sub(ds, 3), 1).forEach(function (t) {
        var tile = obj(ref(t, 2));
        subs(tile, 5).forEach(function (ri) {
          var dati = uno(ri, 6) || new Uint8Array(0);
          var offRaw = uno(ri, 7) || new Uint8Array(0);
          var larghi = !!uno(ri, 8);
          var dvo = new DataView(offRaw.buffer, offRaw.byteOffset, offRaw.byteLength);
          var off = [];
          for (var i = 0; i + 1 < offRaw.length; i += 2) { var x = dvo.getInt16(i, true); off.push(x >= 0 && larghi ? x * 4 : x); }
          var celle = [];
          for (var c = 0; c < nCol && c < off.length; c++) {
            if (off[c] < 0) { celle.push(null); continue; }
            var fine = dati.length;
            for (var j = c + 1; j < off.length; j++) if (off[j] >= 0) { fine = off[j]; break; }
            celle.push(dati.subarray(off[c], fine));
          }
          bufferRighe.push(celle);
        });
      });

      var righe = [];
      for (var r = 0; r < nRighe; r++) {
        var riga = new Array(nCol).fill(null);
        var b = mappa[r] != null ? bufferRighe[mappa[r]] : null;
        if (b) for (var c2 = 0; c2 < nCol; c2++) riga[c2] = cella(b[c2], stringhe, ricchi);
        righe.push(riga);
      }
      return { nome: str(tm, 8), righe: righe };
    }

    // tabelle di ogni foglio: TableInfoArchive (6000) con genitore = foglio
    var tabellePerFoglio = {};
    Object.keys(oggetti).forEach(function (id) {
      if (tipo(id) !== 6000) return;
      var ti = obj(id);
      var genitore = ref(sub(ti, 1), 2);
      (tabellePerFoglio[genitore] || (tabellePerFoglio[genitore] = [])).push({ info: Number(id), modello: ref(ti, 2) });
    });

    var doc = obj(1);
    if (!doc) throw new Error('Non sembra un file Numbers');
    return refs(doc, 1).map(function (fid) {
      var foglio = obj(fid);
      var ordine = refs(foglio, 2);
      var tab = (tabellePerFoglio[fid] || []).slice().sort(function (a, b) {
        var ia = ordine.indexOf(a.info), ib = ordine.indexOf(b.info);
        return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.info - b.info;
      });
      return { nome: str(foglio, 1), tabelle: tab.map(function (t) { return tabella(t.modello); }) };
    });
  }

  async function leggi(dati, JSZipArg) {
    var Z = JSZipArg || (typeof JSZip !== 'undefined' ? JSZip : null);
    if (!Z) throw new Error('JSZip non disponibile');
    var zip = await Z.loadAsync(dati);
    var nomi = Object.keys(zip.files);
    if (!nomi.some(function (n) { return /(^|\/)Index\/.*\.iwa$/.test(n); })) {
      var annidato = nomi.find(function (n) { return /(^|\/)Index\.zip$/.test(n); });
      if (!annidato) throw new Error('Non sembra un file Numbers (manca Index). Se il file viene da Drive, scaricalo come .numbers originale.');
      zip = await Z.loadAsync(await zip.file(annidato).async('uint8array'));
      nomi = Object.keys(zip.files);
    }
    var oggetti = {};
    var iwa = nomi.filter(function (n) { return /\.iwa$/.test(n) && !zip.files[n].dir; });
    // Document.iwa per primo non serve: gli identificativi sono unici fra i file
    for (var i = 0; i < iwa.length; i++) leggiIwa(await zip.file(iwa[i]).async('uint8array'), oggetti);
    return documento(oggetti);
  }

  return { leggi: leggi, _snappy: snappy, _pb: pb, _decimal128: decimal128 };
});
