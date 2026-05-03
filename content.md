**FIAB Cosenzaciclabile** propone questo strumento a **famiglie**, **comunità scolastiche** e **amministratori locali** per guardare insieme lo spazio urbano intorno alle scuole usando **elementi verificabili** (percorsi, attraversamenti, rete per chi va a piedi o in bici, qualità dell’aria in stima da modello) messi sulla **mappa** e confrontabili.

L’obiettivo è **valorizzare un’iniziativa di mappatura partecipativa**, dare priorità a dove servono ascolto, progettazione condivisa e piccole grandi scelte che rendono **più sicuri** gli spostamenti casa–scuola, **più salubre** l’ambiente vicino ai plessi e **più equa** la città per chi non usa l’auto.

---

## Perché parametri oggettivi

Le decisioni sul territorio meritano basi **condivisibili**: cosa c’è oggi in strada, dove manca continuità tra marciapiedi e piste, dove l’esposizione all’inquinamento è più critica nelle ore di entrata e uscita. Parametri **documentabili** e **tecnicamente riscontrabili** (anche con fonti aperte e aggiornabili) aiutano **famiglie e scuole** a portare dati al tavolo e **enti locali** a orientare risorse, comunicazione e progetti con maggiore equità e trasparenza.

Questa pagina **non sostituisce** conteggi ufficiali di traffico, piani viari o rilievi ARPA: **integra** il dibattito con una visione geografica chiara e ripetibile.

---

## Cosa puoi fare qui

- **Esplorare** le sedi scolastiche e un’area di attenzione di **300 metri** intorno a ciascuna: distanze tipiche a piedi o in bicicletta, coerenti con la letteratura su esposizione al traffico vicino alle scuole.
- **Confrontare** la **mappa termica** (heatmap) con piste, pedonalità e **itinerario critico**: serve a **individuare dove agire prima** in termini di sensibilizzazione, progettazione e dialogo con il territorio — **non** è una misura strumentale di traffico in tempo reale (come si calcola: sezione seguente).
- **Leggere** indicatori di **qualità dell’aria** da modello (tre punti di riferimento): utili come **segnale orientativo**, da affiancare dove possibile a dati di stazione.

Il pannello **«Elenco Dati e Mappe»** in alto a destra sulla mappa consente di scegliere **tipo di carta** e **livelli** da sovrapporre.

---

## Metodologia della heatmap (mappa termica)

La heatmap risponde a una domanda operativa: **dove molteplici contesti scolastici e i loro “cerchi” di attenzione si avvicinano o si sovrappongono**, suggerendo **priorità geografiche** per ascolto, progetti e valutazioni condivise. Non misura il traffico veicolare né la qualità dell’aria: **motiva** le valutazioni perché è **trasparente**, **ripetibile** e legata a **dati pubblici sulle sedi** (punti scuola nel progetto) e all’**itinerario critico** tracciato dal gruppo.

### Cosa entra nel calcolo

1. **Punti scuola** — ogni sede del dataset ha coordinate note; intorno a ciascuna si lavora mentalmente con il **buffer di 300 m** disegnato sulla mappa (distanze tipiche a piedi o in bici e letteratura sull’esposizione al traffico vicino alle scuole).

2. **Intensità su ogni scuola** — Per ogni plesso si parte da un peso di base e si **aumenta il peso** se esistono **altre scuole entro 600 m** (il doppio del buffer): più sono vicine, più cresce il contributo. Se un’altra scuola cade anche **entro 300 m**, si aggiunge un ulteriore contributo legato alla distanza (più è vicina, più pesa). Il risultato è **tappato** a un massimo così da non far esplodere artificialmente i valori. Questo rende visibili i **poli** in cui la domanda di mobilità scolastica si concentra nello spazio.

3. **Zone “tra” due scuole** — Per ogni **coppia** di sedi con distanza **maggiore di zero ma inferiore a 600 m**, si calcola un punto a **metà strada** e un’intensità che cresce quando le due scuole sono **più vicine** (legame quadratico con la distanza). Se **altre** scuole hanno ancora i loro 600 m che intersecano **entrambe** le sedi della coppia, l’intensità viene **rafforzata**: così emergono **hub** dove non c’è solo una scuola isolata, ma una **rete di plessi vicini**.

4. **Itinerario critico** — Ogni vertice della linea dell’itinerario critico sulla mappa aggiunge un **contributo fisso moderato** alla heatmap, così la lettura collega **priorità lungo il corridoio** evidenziato dal gruppo con la **geografia delle scuole**.

5. **Disegno sulla carta** — I punti con intensità passano al modulo **Leaflet.heat** (raggio, sfocatura e scala di colori FIAB), che **interpola** visivamente tra i punti: le zone più calde sono quindi sia **dovute ai dati** sia **lisce** per effetto di visualizzazione (come ogni heatmap).

### Perché questo schema sostiene le valutazioni

- **Tracciabilità** — Le regole sono implementate nel codice della pagina (`render.js`): chi vuole può verificare numeri, costanti e ordine delle operazioni.
- **Coerenza con il progetto** — Usa le **stesse sedi** e lo **stesso raggio di attenzione** (300 m) che già usate nel resto della mappa, più l’itinerario critico come **segnale di contesto**.
- **Onestà interpretativa** — Aree calde indicano **concentrazione e prossimità** di esigenze scolastiche nel territorio, non un verdetto su “pericolosità” o congestione misurata.
- **Utilità politica e didattica** — Supporta domande del tipo: «Dove conviene organizzare per prime assemblee, percorsi educativi o richieste di intervento?» senza sostituire conteggi ARPA, piani del traffico o decisioni amministrative.

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

Il dettaglio metodologico, le fonti dati, gli script di aggiornamento e la tabella completa **licenze / repository** sono nel **[README del progetto](README.md)** nel repository.

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
