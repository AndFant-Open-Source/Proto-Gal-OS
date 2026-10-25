# Database — edizione per singolo GAL

Ogni GAL ha il **proprio progetto Supabase**. Il database contiene i dati di un solo ente: non
esistono tabelle o campi "GAL", quindi nessun utente, nemmeno l'amministratore, può vedere o
gestire un altro ente.

## Installazione

1. Creare un progetto Supabase nuovo (regione consigliata: Europe West — Frankfurt).
2. Aprire la **SQL Editor** ed eseguire l'intero file [`schema.sql`](schema.sql).
   Crea anche l'archivio file privato `allegati-protocollo`. Rieseguirlo non cancella dati.
3. Creare il primo amministratore: vedi [docs/installazione.md](../docs/installazione.md).

## Tabelle

Tutte le tabelle hanno il prefisso `protocollo_` e la Row Level Security attiva. Vedono i dati solo
gli utenti con un **profilo attivo**; un account senza profilo, o disattivato, non vede nulla.

| Tabella | Contenuto |
|---------|-----------|
| `protocollo_profili` | Persone del GAL, ruolo (`admin`, `operatore`, `lettore`) e stato attivo |
| `protocollo_registro` | Registro di protocollo (`A/0001/2026` entrata, `U/0001/2026` uscita) |
| `protocollo_allegati` | Allegati dei protocolli (file nella cartella `<id protocollo>/`) |
| `protocollo_sequenze` | Contatori per anno e tipo (arrivo/partenza) |
| `protocollo_contratti` | Repertorio contratti (`C/0001/2026`) |
| `protocollo_contratti_allegati` | Allegati dei contratti (cartella `contratti/<id contratto>/`) |
| `protocollo_contratti_sequenze` | Contatori del repertorio per anno |
| `protocollo_log_azioni` | Storico delle azioni, con il nome di chi ha agito; non modificabile dall'app |

## Permessi

| Operazione | Lettore | Operatore | Admin |
|------------|:---:|:---:|:---:|
| Consultare registro, repertorio, allegati, storico | ✅ | ✅ | ✅ |
| Registrare protocolli e contratti, caricare allegati, bloccare | ❌ | ✅ | ✅ |
| Modificare numero o data, sbloccare, rinumerare, eliminare | ❌ | ❌ | ✅ |
| Gestire ruoli e stato degli utenti | ❌ | ❌ | ✅ |

## Regole applicate dal database

- **Numero, anno e data** di protocolli e contratti li assegna il database all'inserimento, nella
  stessa transazione: nessuno può scegliere il numero e, se il salvataggio fallisce, il numero non
  viene consumato.
- **Protocolli bloccati**: numero, tipo e data immutabili, esclusi dalla rinumerazione, non
  eliminabili.
- **Rinumerazione** (`protocollo_rinumera(anno, tipo)`): "tutto o niente", solo admin; ogni numero
  cambiato resta nello storico.
- **Eliminazioni** registrate nello storico dal database.

## Aggiornamenti dei database già installati

Le nuove installazioni usano solo `schema.sql`. Chi ha installato una versione precedente esegue
nella SQL Editor, una volta, i file della cartella `aggiornamenti/` più recenti della propria
installazione:

| File | Contenuto |
|------|-----------|
| `aggiornamenti/2026-10-importazione-backup.sql` | Funzione `protocollo_importa_backup` per la pagina «Importa backup» (solo admin) |
| `aggiornamenti/2026-10-fascicoli.sql` | Titolario e fascicoli (da eseguire dopo il precedente) |
| `aggiornamenti/2026-10-protocollo-pec.sql` | Protocollo PEC, annullamento, allegati fino a 50 MB (da eseguire dopo il precedente) |

La funzione `functions/pec-importa` (importazione delle PEC da Google Drive) si installa a parte:
vedi [docs/protocollo-pec.md](../docs/protocollo-pec.md).
