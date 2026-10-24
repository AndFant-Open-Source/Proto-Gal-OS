# Architettura

Descrizione per chi vuole riusare, integrare o modificare ProtoGal
(Linee guida AgID, Allegato A §A.8).

## Schema generale

```
Browser (React + TypeScript, file statici)
   │  HTTPS — chiave pubblica "anon" + sessione dell'utente
   ▼
Supabase
   ├── Auth ........ login con e-mail e password
   ├── PostgreSQL .. tabelle protocollo_*, Row Level Security, trigger, funzioni
   └── Storage ..... bucket privato "allegati-protocollo" (URL firmati temporanei)
```

Non esiste un server applicativo proprio: **tutte le regole di sicurezza stanno nel database**
(policy RLS, trigger e funzioni `SECURITY DEFINER`). L'interfaccia nasconde i comandi non
consentiti, ma è il database a impedirli: chi chiamasse direttamente le API con la chiave pubblica
otterrebbe gli stessi rifiuti.

## Regole applicate dal database

| Regola | Dove |
|--------|------|
| Ogni GAL ha un database separato; dentro, vede i dati solo chi ha un profilo attivo | progetto Supabase per GAL + policy RLS con `protocollo_utente_attivo()` |
| Numerazione progressiva senza duplicati, anche con più utenti contemporanei | `get_prossimo_numero_protocollo()`, `contratti_prossimo_numero()` |
| Numero, anno e data assegnati dal database all'inserimento; modificabili solo dall'admin | trigger `protocollo_proteggi_campi`, `contratti_proteggi_campi` |
| Protocolli bloccati esclusi dalla rinumerazione, non modificabili né eliminabili | trigger + `protocollo_rinumera()` |
| Storico delle eliminazioni registrato dal database | trigger `protocollo_log_eliminazione`, `contratti_log_eliminazione` |

## Struttura del codice

```
src/
  App.tsx              rotte e controllo dei ruoli
  main.tsx             avvio
  components/          componenti riutilizzabili (tabella, form contratto, upload, layout)
    ui/                componenti di base derivati da shadcn/ui (licenza MIT)
  hooks/               accesso ai dati (useProtocolli, useContratti, useAuth)
  lib/                 client Supabase, numerazione, stampigliatura PDF, utilità
  pages/               una pagina per file; contratti/ e admin/ per le sezioni dedicate
  types/               tipi TypeScript condivisi
supabase/              schema completo del database (vedi supabase/README.md)
public/.well-known/    security.txt
docs/                  documentazione
LICENSES/              testi delle licenze
```

## Numerazione

| Registro | Formato | Contatore |
|----------|---------|-----------|
| Protocollo in entrata | `A/0015/2026` | per anno e tipo |
| Protocollo in uscita | `U/0015/2026` | per anno e tipo |
| Repertorio contratti | `C/0001/2026` | per anno |

Il numero completo è una colonna generata dal database (`numero_completo`): non può essere scritto
dall'applicazione ed è sempre coerente con numero, tipo e anno.

## Stampigliatura

`src/lib/stampigliatura.ts` usa `pdf-lib` nel browser: il file originale non viene modificato,
si scarica una copia con il timbro sul margine sinistro (anche per pagine ruotate).

## Dipendenze principali

| Libreria | Licenza | Uso |
|----------|---------|-----|
| React, React Router | MIT | interfaccia |
| @supabase/supabase-js | MIT | accesso al backend |
| Radix UI, Tailwind CSS, lucide-react | MIT / ISC | componenti grafici |
| pdf-lib, jsPDF, jspdf-autotable | MIT | stampigliatura e stampe PDF |
| xlsx (SheetJS CE) | Apache-2.0 | esportazione Excel |
| date-fns, zod, recharts, react-dropzone, sonner | MIT | utilità |

Tutte le licenze sono compatibili con la AGPL-3.0.
