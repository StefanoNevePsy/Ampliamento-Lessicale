/**
 * La Standard Celeration Chart nelle Visualizzazioni della cartella del
 * paziente: si sceglie un target, un'attività del programma o un set giocato.
 * I cambi di fase si salvano nel paziente (patient.fasi) e si sincronizzano.
 */
(function () {
    'use strict';
    const A = window._vizApi;
    if (!A || !window.TiceSCC || !window.TiceSCCGrafico) return;

    // Gli insiemi di sedute su cui ha senso una celerazione
    function gruppi(p) {
        const h = p.history || [];
        const out = [];
        const att = (p.programma && p.programma.attivita) || [];
        att.forEach((a) => {
            const sa = h.filter((s) => s.attivitaId === a.id);
            if (sa.length) out.push({ chiave: 'a:' + a.id, nome: a.nome + ' (tutta l\'attività)', sedute: sa, gruppo: 'Programma', att: a });
            (a.target || []).forEach((t) => {
                const st = h.filter((s) => s.targetId === t.id);
                if (st.length) out.push({ chiave: 't:' + t.id, nome: a.nome + ' · ' + t.testo, sedute: st, gruppo: 'Programma', att: a, target: t });
            });
        });
        const libere = {};
        h.filter((s) => !s.attivitaId).forEach((s) => {
            const k = 's:' + (s.setName || '—') + '::' + (s.mode || '—');
            (libere[k] = libere[k] || { chiave: k, nome: (s.setName || '—') + (s.mode && s.mode !== 'quaderno' ? ' · ' + s.mode : ''), sedute: [], gruppo: 'Set e giochi' }).sedute.push(s);
        });
        return out.concat(Object.values(libere).sort((a, b) => b.sedute.length - a.sedute.length));
    }
    // Obiettivo in risposte al giorno, dal criterio dell'attività (se le prove sono fisse)
    function obiettivo(att, sedute) {
        if (!att || !att.prove || !att.criterio) return null;
        const perGiorno = TiceSCC.mediana(TiceSCC.punti(sedute).punti.map((p) => p.sedute)) || 1;
        const v = Math.round(att.prove * att.criterio.soglia / 100 * perGiorno * 10) / 10;
        const x = Math.max(1, Math.round(att.prove * (100 - att.criterio.soglia) / 100 * perGiorno * 10) / 10);
        return { v, x };
    }
    function fasiPer(p, g) {
        const chiavi = [g.chiave, ''];
        if (g.att) chiavi.push('a:' + g.att.id);
        return (p.fasi || []).filter((f) => chiavi.includes(f.chiave || ''));
    }
    function nomiTarget(p) {
        const n = {};
        ((p.programma && p.programma.attivita) || []).forEach((a) => (a.target || []).forEach((t) => { n[t.id] = t.testo; }));
        return n;
    }
    async function aggiungiFase(p, chiave, f) {
        const nuova = { id: 'fs_' + Math.random().toString(36).slice(2, 12), data: f.data, etichetta: f.etichetta || 'cambio', chiave, creato: new Date().toISOString() };
        (p.fasi = p.fasi || []).push(nuova);
        await DB.savePatient(p);
        return nuova;
    }
    async function togliFase(p, id) {
        p.fasi = (p.fasi || []).filter((f) => f.id !== id);
        await DB.savePatient(p);
    }
    window.TiceSCCDati = { gruppi, obiettivo, fasiPer, nomiTarget, aggiungiFase, togliFase };

    function vizSCC(container, patient) {
        // il filtro temporale restringe le sedute; le fasi si salvano sul paziente vero
        const vero = (state.patients || []).find((x) => x.id === patient.id) || patient;
        const gg = gruppi(patient);
        if (!gg.length) { container.innerHTML = '<p class="scc-vuoto">Nessuna seduta.</p>'; return; }
        let g = gg.find((x) => x.chiave === state._sccGruppo) || gg.find((x) => x.target && x.target.stato === 'attivo') || gg[0];
        const opzioni = [...new Set(gg.map((x) => x.gruppo))].map((gr) => `<optgroup label="${gr}">${gg.filter((x) => x.gruppo === gr).map((x) =>
            `<option value="${A._esc(x.chiave)}" ${x === g ? 'selected' : ''}>${A._esc(x.nome)} (${x.sedute.length})</option>`).join('')}</optgroup>`).join('');
        container.innerHTML = `<div class="scc-scelta"><label style="font-size:0.8rem;color:var(--text-secondary)">Grafico di</label><select data-scc-gruppo>${opzioni}</select></div><div class="scc"></div>`;
        container.querySelector('[data-scc-gruppo]').onchange = (e) => { state._sccGruppo = e.target.value; vizSCC(container, patient); };
        TiceSCCGrafico.pannello(container.querySelector('.scc'), {
            titolo: g.nome, sedute: g.sedute, fasi: fasiPer(vero, g), nomi: nomiTarget(vero),
            obiettivo: obiettivo(g.att, g.sedute), puoModificare: true, nomeFile: (patient.name || 'paziente') + ' - ' + g.nome,
            alAggiungiFase: (f) => aggiungiFase(vero, g.chiave, f), alTogliFase: (id) => togliFase(vero, id)
        });
    }
    A.VIZ_VIEWS.push({ id: 'scc', label: 'Celeration chart (SCC)', icon: 'fa-chart-line', fn: vizSCC, group: 'Clinico' });
    // la vecchia vista "Celeration" (tutte le attività insieme) resta, con un nome più chiaro
    const vecchia = A.VIZ_VIEWS.find((v) => v.id === 'celeration');
    if (vecchia) vecchia.label = 'Celeration globale';
})();
