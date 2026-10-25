# Registro delle modifiche — ProtoGal OS (edizione per singolo GAL)

Le versioni seguono il [versionamento semantico](https://semver.org/lang/it/).

## [Non rilasciato]

### Aggiunto
- **Protocollo PEC**: serie separate `P-A/0001/2026` e `P-U/0001/2026`. Le PEC elencate nel
  foglio Google GAL_Indice_PEC vengono importate da Google Drive (Edge Function `pec-importa`,
  account di servizio in sola lettura) con EML, PDF e allegati copiati nell'archivio; si
  verificano nella coda "Da protocollare" e si protocollano con **data di protocollo uguale alla
  data della PEC** (certificata se disponibile). Controllo delle impronte SHA-256, duplicati,
  PEC in ritardo con conferma, ricevute agganciate alla PEC inviata. Protocolli PEC sempre
  bloccati. Guida: `docs/protocollo-pec.md`.
- **Annullamento** dei protocolli (solo amministratore, motivo obbligatorio): il numero resta
  occupato e il protocollo non è più modificabile né eliminabile.
- **Fascicoli** (`F/0001/2026`): raccolgono protocolli e contratti di una stessa pratica, con
  classificazione da **titolario**, responsabile, ufficio, riferimento esterno (per il futuro
  collegamento con altre applicazioni del GAL), apertura e chiusura. Riquadro "Fascicoli" nel
  dettaglio di protocolli e contratti, filtro per fascicolo nel registro, scaricamento del
  fascicolo in ZIP con documenti timbrati e indice PDF. Chiusura, riapertura e titolario riservati
  all'amministratore; storico registrato dal database.
  Per i database già installati eseguire `supabase/aggiornamenti/2026-10-fascicoli.sql`.
- **Importa backup** (amministrazione): carica il file ZIP creato con «Backup dati» di Proto Gal
  multi-GAL. Protocolli, allegati, contratti e storico mantengono numeri, date e autori; le persone
  si ricollegano a quelle della piattaforma; i contatori vengono allineati. Ripetibile senza duplicati.
  Per i database già installati eseguire `supabase/aggiornamenti/2026-10-importazione-backup.sql`.
- Pagina **Copyright e licenza**; nella barra laterale resta solo il link.

### Cambiato
- Allegati fino a **50 MB** per file.
- Cruscotto, report ed esportazioni distinguono la serie ordinaria dalla serie PEC; la
  rinumerazione riguarda solo la serie ordinaria.
- I numeri oltre 9999 non vengono più troncati (es. `A/10000/2026`).
  Per i database già installati eseguire `supabase/aggiornamenti/2026-10-protocollo-pec.sql`.

## [1.0.0] — 2026-10-23

Prima versione dell'edizione per singolo GAL, derivata da ProtoGal 1.1.0.

### Cambiato rispetto a ProtoGal
- **Una piattaforma per ente**: ogni GAL ha il proprio progetto Supabase e il proprio sito.
  Rimossi selezione del GAL, gestione dei GAL e associazioni utente↔GAL; il nome dell'ente
  viene dalla configurazione (`VITE_NOME_ENTE`).
- **Database in un unico file** `supabase/schema.sql` (al posto di schema iniziale + migrazioni),
  pensato per progetti nuovi: crea anche l'archivio file privato.
- Numero, anno e data di protocolli e contratti assegnati sempre dal database all'inserimento.
- Vede i dati solo chi ha un **profilo attivo**: un account senza profilo o disattivato non vede
  nulla e l'app mostra "Accesso non abilitato".

### Corretto (dalla revisione del codice di ProtoGal)
- Storico collegato ai profili: il nome di chi ha agito compare anche su un database nuovo.
- Esportazioni Excel/PDF e ricerca delle lacune non più limitate a 1000 righe.
- Archivio file: ammessi solo i formati previsti, non più qualsiasi file come "octet-stream".
- Pagina Numerazione: interrogazioni in parallelo, calcolo delle lacune senza costo quadratico.
