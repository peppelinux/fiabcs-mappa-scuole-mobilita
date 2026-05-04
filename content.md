**FIAB Cosenzaciclabile** propone questo strumento a **famiglie**, **comunità scolastiche** e **amministratori locali** per guardare insieme lo spazio urbano intorno alle scuole usando **elementi verificabili** (percorsi, attraversamenti, rete per chi va a piedi o in bici, qualità dell’aria) posizionati sulla **mappa** e confrontabili.

L’obiettivo è **valorizzare un’iniziativa di mappatura partecipativa**, dare priorità a dove servono ascolto, progettazione condivisa e piccole grandi scelte che rendono **più sicuri** gli spostamenti casa–scuola, **più salubre** l’ambiente vicino ai plessi e **più equa** la città per chi non usa l’auto.

---

## Perché partire da dati condivisibili

Le decisioni sul territorio meritano basi che **tutti possano controllare**: cosa c’è oggi in strada, dove manca continuità tra marciapiedi e piste, dove l’esposizione all’inquinamento è più critica nelle ore di entrata e uscita. In questo progetto usiamo **dati aperti** (mappa collaborativa, modelli orientativi) così **famiglie e scuole** possono portare elementi concreti al tavolo e **enti locali** possono orientare risorse e comunicazione con trasparenza.

Questa pagina **non sostituisce** conteggi ufficiali di traffico, piani viari o rilievi ARPA ma **integra** il dibattito con una visione geografica chiara.

---

## Cosa puoi fare qui

- **Esplorare** le sedi scolastiche e un’area di attenzione di **300 metri** intorno a ciascuna: distanze tipiche a piedi o in bicicletta, coerenti con la letteratura su esposizione al traffico vicino alle scuole.
- **Confrontare** la **mappa delle priorità** (i colori “caldi” sulla mappa) con piste, pedonalità e **itinerario critico**: aiuta a **vedere dove concentrare** ascolto, progettazione e dialogo — **non** è traffico misurato sul campo (in sintesi sotto; il dettaglio numerico per chi sviluppa o verifica è nel **[README](README.md)** del repository).
- **Leggere** indicatori di **qualità dell’aria** da modello (tre punti di riferimento): utili come **segnale orientativo**, da affiancare dove possibile a dati di stazione.

Il pannello **«Elenco Dati e Mappe»** in alto a destra sulla mappa consente di scegliere **tipo di carta** e **livelli** da sovrapporre.

---

## Mappa delle priorità (colori “caldi” sulla mappa)

La domanda che questa visualizzazione prova a rispondere è semplice: **dove ci sono molte scuole vicine tra loro** (e i rispettivi “intorni” da **300 metri** che già vedi come cerchi sulla mappa), così da suggerire **dove vale la pena concentrare** ascolto, progetti e confronto sul territorio.

**Cosa non è:** non misura il traffico in tempo reale, né la qualità dell’aria al suolo, né dice da sola se un punto è “pericoloso”. I colori più accesi indicano soprattutto **vicinanza e densità** di contesti scolastici nello spazio.

**Cosa c’è dietro, in parole povere**

- Ogni **sede** conta, con lo stesso raggio di **300 m** che usi già per leggere la mappa.
- Se **altre scuole** sono abbastanza vicine (fino a circa **il doppio** di quel raggio, quindi fino a **600 m**), il colore si **intensifica**: più plessi vicini, più la zona tende al caldo.
- Tra due scuole vicine viene valorizzato anche lo **spazio in mezzo**: così emergono “corridoi” dove la domanda di mobilità non è solo su un edificio isolato.
- La **linea arancione** dell’itinerario critico dà un **contributo costante** lungo il percorso, così la mappa collega le priorità che il gruppo segnala con la geografia delle scuole.
- I colori si **sfumano** tra un punto e l’altro: è normale che le zone calde sembrino “macchie” morbide — aiuta l’occhio, ma non va letto come una misura al metro.

Per **chi vuole riprodurre o verificare** i numeri esatti, i nomi dei file, la libreria che disegna il calore e come viene costruito l’itinerario critico su OpenStreetMap, tutto è nel **[README](README.md)** del repository (sezione sulla heatmap e sugli script).

---

## Territorio

Area di lavoro: tessuto urbano e periurbano di **Cosenza**, **Rende** (inclusa **Andreotta** e i collegamenti rilevanti per gli spostamenti scolastici verso Arcavacata e il campus) e gli assi che collegano le sedi alla rete ciclopedonale.

---

## In sintesi: cosa osserviamo

- Continuità e sicurezza di **percorsi pedonali** e **piste / corsie** per chi pedala.
- **Intersezioni** e **attraversamenti** comprensibili e protetti, tempi d’attesa non eccessivi.
- Contesto di **velocità** e volume veicolare, spazio per pedoni e ciclisti.
- Qualità dell’ambiente stradale (es. **marciapiedi**, ostacoli, comfort per spostamenti attivi).
- **Qualità dell’aria** nelle ore di punta scolastica, letta con strumenti replicabili.

Dettaglio tecnico, fonti dati, script di aggiornamento e **licenze / repository** sono nel **[README del progetto](README.md)** nel repository.

---

## Punti critici per sicurezza e salute (nei pressi della scuola)

| Rischio | Perché conta per bambine, bambini e adolescenti |
|--------|--------------------------------------------------|
| Traffico veloce e convivenza con pedoni e ciclisti | Maggiore rischio di urto; percezione di insicurezza che scoraggia spostamenti attivi. |
| Attraversamenti insufficienti | Concentrazione di attraversamenti non protetti all’ingresso e all’uscita. |
| Rete ciclopedonale assente o frammentata | Si finisce in contesti non adatti all’età. |
| Qualità dell’aria | Esposizione a picchi di inquinanti lungo le strade molto trafficate. |
| Sosta caotica e manovre | Aumentano conflitti con chi arriva a piedi o in bici. |

---

## Trasparenza

Carta di base e molti livelli derivano da **OpenStreetMap** (database aperto, verificabile e migliorabile da tutti). I testi e il codice originale di questo progetto sono rilasciati in **CC BY 4.0** (vedi file **`LICENSE`**). Per elenco tecnico di API, librerie, script e note legali sui marchi **FIAB**, consultare il **[README](README.md)**.
