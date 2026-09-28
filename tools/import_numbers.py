#!/usr/bin/env python3
"""
Import dei quaderni Numbers del Centro TICE nel formato del Quaderno TICE.

    pip install numbers-parser
    python import_numbers.py "Mario_R.numbers" --codice PZ-014 --etichetta "M. R."

Produce `import-PZ-014.json`, da caricare nell'app (Admin > Importa). L'app
mostra un'anteprima e chiede conferma dei valori dedotti prima di salvare.

Cosa riconosce (vedi docs/quaderno-tice.md):
  - un foglio per area, una tabella per programma, intestazione su tre righe
    ("Programma: ...", "Criterio: ... / Strategia ...", nomi delle colonne);
  - STO scritti su piu' righe, STO successivi e STO paralleli nella stessa tabella;
  - tabelle in percentuale (V+P = 100) e in conteggi;
  - decisioni scritte a mano (CRITERIO, REPERTORIO, "Passa a 1" T/D", ...);
  - le tabelle "Frequenze" e "Learn unit giornaliere" come storico;
  - il foglio "Programmi terminati".

Quando un dato non si puo' ricavare con certezza, non lo inventa: lo segnala in
"daConfermare" e l'app lo chiede a chi importa.
"""

import argparse
import datetime as dt
import json
import os
import re
import secrets
import string
import sys

try:
    from numbers_parser import Document
except ImportError:
    sys.exit("Serve numbers-parser:  pip install numbers-parser")

ALFABETO = string.ascii_letters + string.digits
TOTALI_TIPICI = (5, 10, 12, 15, 20, 25, 30, 40, 50)

FOGLI_STORICO = ("frequenze", "learn unit")
FOGLI_SALTATI = ("modeli grafici", "modelli grafici")
FOGLIO_TERMINATI = "programmi terminati"
RE_DECISIONE = re.compile(r"criterio|repertorio|stop|passa a|sospes|probe", re.I)


def nuovo_id(prefisso, n=10):
    return prefisso + "_" + "".join(secrets.choice(ALFABETO) for _ in range(n))


def testo(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"\s+", " ", str(v)).strip()


def numero(v):
    """Numero o None. '\\0', '-', '' e simili non sono numeri: non si indovinano."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def data_iso(v):
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    s = testo(v)
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$", s)
    if m:
        g, mm, a = (int(x) for x in m.groups())
        if a < 100:
            a += 2000
        try:
            return dt.date(a, mm, g).isoformat()
        except ValueError:
            return None
    return None


def area_leggibile(nome_foglio):
    s = testo(nome_foglio).lower()
    s = s[:1].upper() + s[1:]
    return s.replace("rep. generali", "Repertori generali").replace("Rep. generali", "Repertori generali")


def leggi_criterio(t):
    """'90/100% per 2 sessioni consecutive', '90/100% x 2', '100% x 2'."""
    t = testo(t)
    soglia = 90
    sedute = 2
    m = re.search(r"(\d{2,3})\s*(?:/\s*100)?\s*%", t)
    if m:
        soglia = int(m.group(1))
    m = re.search(r"(?:x|per)\s*(\d+)", t, re.I)
    if m:
        sedute = int(m.group(1))
    return {"soglia": soglia, "sedute": sedute}


def leggi_strategia(riga1, colonne):
    valori = [testo(x).lower() for x in riga1]
    if any("time delay" in v or v in ("td", "t/d") for v in valori):
        return "timedelay"
    if any("indipendente" in v for v in valori):
        return "indipendente"
    # Nessuna strategia scritta: se c'e' una colonna dei promptati si lavorava in T/D
    return "timedelay" if colonne.get("p") is not None else "indipendente"


def mappa_colonne(intestazioni):
    col = {"sto": 0, "data": None, "v": None, "p": None, "evento": None, "decisione": None}
    nome_p = None
    for i, h in enumerate(intestazioni):
        t = testo(h).lower()
        if not t:
            continue
        if t == "data" or t.startswith("gg/"):
            col["data"] = i
        elif "corrett" in t:
            col["v"] = i
        elif "prompt" in t or "echo" in t:
            col["p"] = i
            nome_p = "Echo" if "echo" in t else None
        elif t.startswith("x:") or "event" in t:
            col["evento"] = i
        elif "decision" in t:
            col["decisione"] = i
    return col, nome_p


def etichette_evento(intestazione):
    """'X: NO PIPI ✔️ PIPì'  ->  ['PIPì', 'NO PIPI'] (prima il si', poi il no)."""
    t = testo(intestazione)
    m = re.match(r"^\s*X\s*:\s*(.+?)\s*✔️?\s*(.+)$", t)
    if m:
        return [m.group(2).strip(), m.group(1).strip()]
    return ["Sì", "No"]


def e_tabella_programma(tab):
    if tab.num_rows < 4:
        return False
    return testo(tab.cell(0, 0).value).lower().startswith("programma")


# ---------------------------------------------------------------------------
# Programmi
# ---------------------------------------------------------------------------
def leggi_programma(tab, area, terminato, avvisi):
    r0 = [tab.cell(0, c).value for c in range(tab.num_cols)]
    r1 = [tab.cell(1, c).value for c in range(tab.num_cols)]
    r2 = [tab.cell(2, c).value for c in range(tab.num_cols)]
    colonne, nome_p = mappa_colonne(r2)

    descr = re.sub(r"^programma\s*:?\s*", "", testo(r0[0]), flags=re.I)
    crit_txt = next((testo(x) for x in r1[1:] if "%" in testo(x)), "")
    prog = {
        "id": nuovo_id("pr"),
        "area": area,
        "nome": testo(tab.name),
        "descrizione": descr,
        "criterio": leggi_criterio(crit_txt),
        "strategia": leggi_strategia(r1, colonne),
        "prove": None,
        "scala": "conteggio",
        "evento": None,
        "stato": "terminato" if terminato else "attivo",
        "sto": [],
    }
    if nome_p:
        prog["nomeP"] = nome_p
    if any("event" in testo(x).lower() for x in r1) or colonne["evento"] is not None:
        prog["evento"] = etichette_evento(r2[colonne["evento"]]) if colonne["evento"] is not None else ["Sì", "No"]

    if colonne["data"] is None or colonne["v"] is None:
        avvisi.append(f"{area} / {prog['nome']}: colonne DATA o CORRETTE non trovate, tabella saltata.")
        return None, []

    # --- Righe -> blocchi di STO ------------------------------------------
    # Uno STO nuovo comincia quando c'e' testo nella colonna STO e:
    #   - e' la prima riga utile, oppure
    #   - la riga precedente era vuota o conteneva una decisione, oppure
    #   - lo STO corrente ha gia' diverse righe di dati (i testi su piu' righe
    #     stanno all'inizio del blocco), oppure
    #   - la data torna indietro (STO paralleli: es. ANIMALI e PAROLE COMUNI).
    sto_corrente = None
    righe_dati_sto = 0
    prec_vuota = True
    prec_decisione = False
    ultima_data = None
    voci = []

    for r in range(3, tab.num_rows):
        cella = lambda c: tab.cell(r, c).value if c is not None else None
        t_sto = testo(cella(colonne["sto"]))
        d = data_iso(cella(colonne["data"]))
        v = numero(cella(colonne["v"]))
        p = numero(cella(colonne["p"])) if colonne["p"] is not None else None
        dec = testo(cella(colonne["decisione"])) if colonne["decisione"] is not None else ""
        if not dec:
            # A volte la decisione e' scritta in una colonna senza intestazione
            # (es. "CRITERIO" accanto ai promptati): la si cerca nelle altre celle.
            mappate = {c for c in colonne.values() if c is not None}
            for c in range(tab.num_cols):
                if c in mappate:
                    continue
                t = testo(tab.cell(r, c).value)
                if t and RE_DECISIONE.search(t):
                    dec = t
                    break
        ev_raw = cella(colonne["evento"]) if colonne["evento"] is not None else None
        v_raw = cella(colonne["v"])

        vuota = not t_sto and not d and v is None and p is None and not dec
        if vuota:
            prec_vuota = True
            continue

        torna_indietro = bool(d and ultima_data and d < ultima_data and righe_dati_sto >= 3)
        if t_sto:
            nuovo = (sto_corrente is None or prec_vuota or prec_decisione
                     or righe_dati_sto >= 3 or torna_indietro)
            if nuovo:
                sto_corrente = {"id": nuovo_id("st"), "testo": t_sto, "stato": "chiuso",
                                "inizio": d, "fine": None}
                prog["sto"].append(sto_corrente)
                righe_dati_sto = 0
            else:
                sto_corrente["testo"] += " — " + t_sto
        elif sto_corrente is None:
            sto_corrente = {"id": nuovo_id("st"), "testo": "(senza titolo)", "stato": "chiuso",
                            "inizio": d, "fine": None}
            prog["sto"].append(sto_corrente)

        if d and (v is not None or p is not None or dec):
            if not sto_corrente["inizio"] or d < sto_corrente["inizio"]:
                sto_corrente["inizio"] = d
            voce = {
                "programmaId": prog["id"], "stoId": sto_corrente["id"],
                "strategia": prog["strategia"], "data": d,
                "v": v, "p": p if p is not None else (0 if colonne["p"] is not None else None),
                "x": None, "decisione": dec or None, "nota": "",
            }
            if v is None and testo(v_raw):
                voce["nota"] = f"valore non leggibile nel file originale: {testo(v_raw)!r}"
                avvisi.append(f"{area} / {prog['nome']} {d}: valore {testo(v_raw)!r} non numerico, lasciato vuoto.")
            if testo(ev_raw):
                voce["nota"] = (voce["nota"] + " " if voce["nota"] else "") + f"evento: {testo(ev_raw)}"
            u = dec.upper()
            if "CRITERIO" in u:
                sto_corrente["stato"] = "criterio"
                sto_corrente["fine"] = d
            elif "REPERTORIO" in u:
                sto_corrente["stato"] = "repertorio"
                sto_corrente["fine"] = d
            voci.append(voce)
            righe_dati_sto += 1
            ultima_data = d
        elif dec:
            u = dec.upper()
            if "CRITERIO" in u:
                sto_corrente["stato"] = "criterio"
            elif "REPERTORIO" in u:
                sto_corrente["stato"] = "repertorio"

        prec_vuota = False
        prec_decisione = bool(dec)

    # Quale STO e' in corso. Gli STO scritti ma senza ancora dati sono il piano
    # successivo (es. ORIENTAMENTO: SHAPES PUZZLE, poi RICREA IMMAGINE).
    con_dati = {x["stoId"] for x in voci}
    ultimo_con_dati = max((i for i, st in enumerate(prog["sto"]) if st["id"] in con_dati), default=-1)
    for i, st in enumerate(prog["sto"]):
        if i > ultimo_con_dati and st["id"] not in con_dati:
            st["stato"] = "pianificato"
    if not terminato and prog["sto"]:
        if ultimo_con_dati >= 0 and prog["sto"][ultimo_con_dati]["stato"] == "chiuso":
            prog["sto"][ultimo_con_dati]["stato"] = "attivo"
        elif not any(st["stato"] == "attivo" for st in prog["sto"]):
            prossimo = next((st for st in prog["sto"] if st["stato"] == "pianificato"), None)
            if prossimo:
                prossimo["stato"] = "attivo"
    return prog, voci


def deduci_scala(prog, voci, da_confermare, avvisi):
    """Percentuali o conteggi, e quante prove per seduta. Mai inventato in silenzio."""
    utili = [x for x in voci if x["v"] is not None]
    if not utili:
        return
    ha_p = any(x["p"] is not None for x in utili)
    somme = [x["v"] + (x["p"] or 0) for x in utili]
    nome = f"{prog['area'] or 'Terminati'} / {prog['nome']}"

    a_cento = sum(1 for s in somme if abs(s - 100) <= 1)
    if ha_p and a_cento / len(somme) >= 0.8:
        prog["scala"] = "percentuale"
        for x in utili:
            tot = x["v"] + (x["p"] or 0)
            if abs(tot - 100) > 1:
                pct = round(100 * x["v"] / tot) if tot else 0
                avvisi.append(f"{nome} {x['data']}: {int(x['v'])}+{int(x['p'] or 0)} = {int(tot)}, non 100. "
                              f"Probabile refuso: importato come {pct}% corrette.")
                x["nota"] = (x["nota"] + " " if x["nota"] else "") + \
                    f"nel file: {int(x['v'])} corrette + {int(x['p'] or 0)} promptate (somma {int(tot)})"
                x["v"], x["p"] = pct, 100 - pct
            x["x"] = max(0.0, 100 - x["v"] - (x["p"] or 0))
        return

    massimo = max(somme)
    if not ha_p and massimo > 20 and massimo <= 100:
        # Una sola colonna con valori oltre 20: sono percentuali (57, 91, 100…)
        prog["scala"] = "percentuale"
        for x in utili:
            x["p"] = 0
            x["x"] = max(0.0, 100 - x["v"])
        return

    # Conteggi: il totale per seduta non e' scritto. Lo si deduce dal massimo.
    candidato = next((t for t in TOTALI_TIPICI if t >= massimo), int(massimo))
    pieni = sum(1 for s in somme if s == candidato)
    quota = pieni / len(somme)
    prog["prove"] = candidato
    if ha_p and quota >= 0.8:
        motivo = f"{pieni}/{len(somme)} righe sommano esattamente a {candidato}"
        certo = True
    elif ha_p:
        motivo = (f"il massimo di corrette+promptate e' {int(massimo)}; nelle righe sotto "
                  f"{candidato} la differenza viene contata come errori")
        certo = False
    else:
        motivo = (f"il foglio registra solo le corrette (massimo {int(massimo)}): "
                  f"il numero di prove non e' scritto")
        certo = False
    da_confermare.append({
        "programmaId": prog["id"], "programma": nome, "campo": "prove",
        "proposta": candidato, "motivo": motivo, "certo": certo,
    })
    # x resta None: l'app lo calcola come prove - v - p dopo la conferma


# ---------------------------------------------------------------------------
# Storico learn unit / frequenze
# ---------------------------------------------------------------------------
MAPPA_STORICO = [
    ("data", ("data", "gg/mese")),
    ("criteri", ("criteri",)),
    ("assessment", ("assessment",)),
    ("corrette", ("risposte corrette",)),
    ("totali", ("risposte totali",)),
    ("durata", ("durata",)),
    ("operatori", ("psico", "psicolog")),
    ("tipologia", ("tipologia",)),
    ("compilatore", ("iniziali",)),
]


def leggi_storico(tab, fonte):
    intest = [testo(tab.cell(0, c).value).lower() for c in range(tab.num_cols)]
    idx = {}
    for chiave, parole in MAPPA_STORICO:
        for i, h in enumerate(intest):
            if any(h.startswith(p) or p in h for p in parole) and i not in idx.values():
                idx[chiave] = i
                break
    if "data" not in idx:
        return []
    righe = []
    for r in range(1, tab.num_rows):
        d = data_iso(tab.cell(r, idx["data"]).value)
        if not d:
            continue
        riga = {"data": d, "fonte": fonte}
        for chiave in ("criteri", "assessment", "corrette", "totali", "durata"):
            if chiave in idx:
                n = numero(tab.cell(r, idx[chiave]).value)
                if n is not None:
                    riga[chiave] = int(n) if n.is_integer() else n
        for chiave in ("operatori", "tipologia", "compilatore"):
            if chiave in idx:
                s = testo(tab.cell(r, idx[chiave]).value)
                if s:
                    riga[chiave] = s
        righe.append(riga)
    return righe


# ---------------------------------------------------------------------------
# Sedute: una per giorno (o piu', se lo stesso programma compare due volte)
# ---------------------------------------------------------------------------
def componi_sedute(voci, operatori_per_data, paziente_id):
    per_giorno = {}
    for x in sorted(voci, key=lambda x: x["data"]):
        giorno = per_giorno.setdefault(x["data"], [])
        # la n-esima misura di un programma in quel giorno va nella n-esima seduta
        n = sum(1 for s in giorno for y in s["voci"] if y["programmaId"] == x["programmaId"])
        while len(giorno) <= n:
            giorno.append({"voci": []})
        giorno[n]["voci"].append(x)

    sedute = []
    for data in sorted(per_giorno):
        for i, s in enumerate(per_giorno[data]):
            op = operatori_per_data.get(data, "")
            nomi = [p.strip() for p in re.split(r"[+/,]| e ", op) if p.strip()] if op else []
            voci_pulite = []
            for x in s["voci"]:
                y = {k: v for k, v in x.items() if k != "data"}
                for k in ("v", "p", "x"):
                    if isinstance(y[k], float) and y[k].is_integer():
                        y[k] = int(y[k])
                voci_pulite.append(y)
            sedute.append({
                "schema": 1,
                "id": nuovo_id("sd", 14),
                "pazienteId": paziente_id,
                "data": data,
                "inizio": None, "fine": None,
                "operatore": None,
                "operatoreNome": nomi[0] if nomi else "Importato",
                "coOperatori": nomi[1:],
                "voci": voci_pulite,
                "nota": (f"seconda misura del giorno" if i else ""),
                "fonte": "import-numbers",
                "eliminata": False,
            })
    return sedute


# ---------------------------------------------------------------------------
def importa(percorso, codice, etichetta, aula):
    doc = Document(percorso)
    avvisi, da_confermare = [], []
    programmi, voci, storico = [], [], []
    paziente_id = nuovo_id("pz")

    for foglio in doc.sheets:
        nome = testo(foglio.name)
        basso = nome.lower()
        if any(basso.startswith(s) for s in FOGLI_SALTATI):
            avvisi.append(f"Foglio '{nome}' saltato: contiene modelli, non dati.")
            continue
        if any(s in basso for s in FOGLI_STORICO):
            for tab in foglio.tables:
                righe = leggi_storico(tab, f"{nome} / {testo(tab.name)}")
                if righe:
                    storico.extend(righe)
                else:
                    avvisi.append(f"'{nome} / {testo(tab.name)}': nessuna data riconosciuta, saltata.")
            continue

        terminato = basso.startswith(FOGLIO_TERMINATI)
        area = None if terminato else area_leggibile(nome)
        for tab in foglio.tables:
            if not e_tabella_programma(tab):
                avvisi.append(f"'{nome} / {testo(tab.name)}' non sembra un programma, saltata.")
                continue
            prog, vv = leggi_programma(tab, area, terminato, avvisi)
            if not prog:
                continue
            deduci_scala(prog, vv, da_confermare, avvisi)
            programmi.append(prog)
            voci.extend(vv)

    # Operatori del giorno dalle tabelle di learn unit, se ci sono
    operatori_per_data = {}
    for r in storico:
        if r.get("operatori"):
            operatori_per_data.setdefault(r["data"], r["operatori"])

    oggi = dt.date.today().isoformat()
    nomi = {pr["id"]: f"{pr['area'] or 'Terminati'} / {pr['nome']}" for pr in programmi}
    for x in voci:
        if x["data"] > oggi or x["data"] < "2015-01-01":
            avvisi.append(f"{nomi[x['programmaId']]}: data {x['data']} nel futuro o troppo vecchia, "
                          f"probabile refuso nel foglio originale.")

    storico.sort(key=lambda r: r["data"])
    sedute = componi_sedute(voci, operatori_per_data, paziente_id)

    paziente = {
        "schema": 1,
        "id": paziente_id,
        "codice": codice,
        "etichetta": etichetta,
        "aula": aula,
        "programmi": programmi,
        "learnUnitStoriche": storico,
        "note": "",
    }
    return {
        "formato": "quaderno-tice-import",
        "schema": 1,
        "origine": {"file": os.path.basename(percorso), "importato": dt.datetime.now().isoformat(timespec="seconds")},
        "paziente": paziente,
        "sedute": sedute,
        "avvisi": avvisi,
        "daConfermare": da_confermare,
    }


def iniziali_da_file(percorso):
    base = os.path.splitext(os.path.basename(percorso))[0]
    parti = [p for p in re.split(r"[_\s\-]+", base) if p and p.lower() not in ("old", "vecchio", "copia")]
    return ". ".join(p[0].upper() for p in parti[:2]) + "." if parti else "?"


def riassunto(pacchetto):
    p = pacchetto["paziente"]
    print(f"\nPaziente {p['codice']} ({p['etichetta']}) — {len(p['programmi'])} programmi, "
          f"{len(pacchetto['sedute'])} sedute, {len(p['learnUnitStoriche'])} righe di storico")
    per_area = {}
    for pr in p["programmi"]:
        per_area.setdefault(pr["area"] or "Terminati", []).append(pr)
    voci = [v for s in pacchetto["sedute"] for v in s["voci"]]
    for area, progs in per_area.items():
        print(f"\n  {area}")
        for pr in progs:
            n = sum(1 for v in voci if v["programmaId"] == pr["id"])
            scala = "%" if pr["scala"] == "percentuale" else f"su {pr['prove']}"
            stati = ", ".join(f"{s['stato']}" for s in pr["sto"])
            print(f"    {pr['nome']:<32} {pr['strategia']:<12} crit {pr['criterio']['soglia']}%x{pr['criterio']['sedute']}"
                  f"  {n:>3} misure  {scala:<7} STO: {len(pr['sto'])} [{stati}]")
    if pacchetto["daConfermare"]:
        print("\n  Da confermare nell'app:")
        for d in pacchetto["daConfermare"]:
            segno = "✓" if d["certo"] else "?"
            print(f"    {segno} {d['programma']}: {d['proposta']} prove — {d['motivo']}")
    if pacchetto["avvisi"]:
        print("\n  Avvisi:")
        for a in pacchetto["avvisi"]:
            print(f"    - {a}")


def main():
    ap = argparse.ArgumentParser(description="Importa un quaderno Numbers nel Quaderno TICE.")
    ap.add_argument("file", help="file .numbers")
    ap.add_argument("--codice", help="codice del paziente, es. PZ-014 (default: generato)")
    ap.add_argument("--etichetta", help="come mostrarlo nell'app, es. 'M. R.' (default: iniziali dal nome file)")
    ap.add_argument("--aula", default="", help="aula, es. 'Aula 1'")
    ap.add_argument("--out", help="file di uscita (default: import-<codice>.json)")
    a = ap.parse_args()

    codice = a.codice or "PZ-" + "".join(secrets.choice(string.digits) for _ in range(4))
    etichetta = a.etichetta or iniziali_da_file(a.file)
    pacchetto = importa(a.file, codice, etichetta, a.aula)
    out = a.out or f"import-{codice}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(pacchetto, f, ensure_ascii=False, indent=1)
    riassunto(pacchetto)
    print(f"\nScritto {out}")


if __name__ == "__main__":
    main()
