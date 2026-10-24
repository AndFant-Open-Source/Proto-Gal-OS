# Registro delle modifiche — ProtoGal OS (edizione per singolo GAL)

Le versioni seguono il [versionamento semantico](https://semver.org/lang/it/).

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
