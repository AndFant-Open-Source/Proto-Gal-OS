# ProtoGal — edizione per singolo GAL

**Registro di protocollo e repertorio contratti: una piattaforma per ogni GAL**

ProtoGal è un'applicazione web per tenere in ordine la corrispondenza e i contratti di un
**Gruppo di Azione Locale (GAL)** o di un piccolo ente pubblico, senza installare programmi sui
computer: si usa dal browser.

**In questa edizione ogni GAL ha la propria piattaforma**: un proprio progetto Supabase (database,
utenti e archivio file) e un proprio sito. Non esiste una gestione di più GAL: nessun utente,
nemmeno l'amministratore, può vedere o gestire un ente diverso dal proprio, perché i dati stanno su
server separati. Dentro la piattaforma lavorano le persone del GAL, con i ruoli amministratore,
operatore e lettore.

## A cosa serve

Ogni lettera, PEC o documento che l'ente riceve o invia viene **registrato con un numero
progressivo**, una data e una descrizione, insieme ai file allegati. Lo stesso vale per i contratti
che l'ente firma. In qualsiasi momento si può ritrovare un documento, sapere chi lo ha registrato e
cosa è stato modificato.

**Casi d'uso tipici**

- La segreteria riceve una PEC: la registra come protocollo **in entrata** (es. `A/0015/2026`),
  allega il file e la assegna a un ufficio.
- L'ente invia una comunicazione: la registra **in uscita** (es. `U/0015/2026`), scarica il PDF con il
  numero di protocollo **stampigliato** sul margine e lo **blocca**, così una successiva rinumerazione
  non potrà mai cambiare il numero già comunicato al destinatario.
- Dopo la firma di un contratto, lo iscrive nel **repertorio contratti** (es. `C/0001/2026`) con
  contraente, importo, CIG, CUP e scadenza; i contratti in scadenza sono evidenziati.
- Un nuovo GAL che vuole usare il programma riceve **un'installazione tutta sua**: si crea un
  progetto Supabase, si esegue lo schema e si pubblica il sito con i dati di quell'ente.

**Funzionalità principali**

- Protocollo in entrata e in uscita, numerazione progressiva per anno
- Allegati (PDF, P7M, documenti Office, immagini, e-mail) con stampigliatura del numero sui PDF
- Blocco dei protocolli già comunicati e rinumerazione progressiva che li rispetta
- Repertorio contratti con numerazione separata
- Fascicoli (`F/0001/2026`) con titolario di classificazione, per raccogliere i documenti di una pratica
- Protocollo PEC (`P-A/…`, `P-U/…`) importato da Google Drive, con data di protocollo uguale alla data della PEC ([guida](docs/protocollo-pec.md))
- Annullamento dei protocolli con motivo, senza riuso del numero
- Ruoli: amministratore, operatore, lettore
- Storico di ogni azione, esportazione in Excel e PDF, report

**Schermate**: *da aggiungere in `docs/immagini/`.*

## Documentazione

| Documento | Contenuto |
|-----------|-----------|
| [docs/installazione.md](docs/installazione.md) | Installazione da zero, sviluppo, produzione, configurazione |
| [docs/architettura.md](docs/architettura.md) | Come è fatto il software e dove stanno le regole di sicurezza |
| [docs/protocollo-pec.md](docs/protocollo-pec.md) | Protocollo PEC: uso, installazione dell'importazione da Google Drive |
| [supabase/README.md](supabase/README.md) | Struttura del database, permessi e regole di sicurezza |
| [docs/licenza-e-titolarita.md](docs/licenza-e-titolarita.md) | Licenza, titolarità e passi per il rilascio |
| [docs/conformita-linee-guida-agid.md](docs/conformita-linee-guida-agid.md) | Verifica rispetto alle Linee guida AgID sul riuso |
| [SECURITY.md](SECURITY.md) | Come segnalare un problema di sicurezza |

## Struttura del repository

```
src/                 codice dell'applicazione (React + TypeScript)
supabase/            struttura del database: schema completo (schema.sql)
docs/                documentazione
public/.well-known/  security.txt
LICENSES/            testi delle licenze (AGPL-3.0, CC-BY-4.0, MIT)
publiccode.yml       scheda per il catalogo Developers Italia
REUSE.toml           licenza e titolarità di ogni file
```

Ramo unico `main`: ogni modifica sul ramo principale viene pubblicata in produzione.

## Prerequisiti e dipendenze

- **Node.js 20+** e npm (solo per compilare)
- **Supabase**: database PostgreSQL, autenticazione e archivio file. È software libero
  (Apache-2.0): si può usare il servizio cloud o installarlo sui propri server
- Un servizio di hosting per file statici (es. Vercel, Netlify, Nginx)

Librerie principali: React, Tailwind CSS, Radix UI, pdf-lib, jsPDF, SheetJS, date-fns, zod.
**Nessuna dipendenza da software commerciale**: tutte le librerie sono software libero (MIT, ISC,
Apache-2.0, BSD). L'elenco completo è in `package.json`.

## Installazione rapida

```bash
git clone https://github.com/AndFant-Open-Source/Proto-Gal-OS.git
cd Proto-Gal-OS
npm install
cp .env.example .env     # compilare con i dati del proprio progetto Supabase
npm run dev              # http://localhost:5173
```

Prima del primo avvio vanno eseguiti gli script del database: la procedura completa è in
[docs/installazione.md](docs/installazione.md).

## Stato del progetto

**Beta** — in uso presso [ENTE DA INDICARE].

Limitazioni note:

- È un **registro di protocollo interno**: non produce la segnatura XML né il registro giornaliero
  da inviare in conservazione previsti per il protocollo informatico ufficiale.
- La creazione di nuovi utenti avviene dalla dashboard di Supabase (invito via e-mail); dall'app si
  gestiscono ruoli e stato.
- Non sono ancora presenti test automatici.

## Titolarità, licenza e manutenzione

- **Titolare dei diritti**: Andrea Fantini — © 2026
- **Licenza**: software libero rilasciato sotto **GNU Affero General Public License v3.0 o
  successive** (`AGPL-3.0-or-later`, testo ufficiale in [LICENSE](LICENSE)) **con i termini
  aggiuntivi** previsti dalla sezione 7 e descritti in [TERMINI-AGGIUNTIVI.md](TERMINI-AGGIUNTIVI.md):
  - chi usa o ridistribuisce il programma deve mantenere nell'interfaccia l'avviso
    *"ProtoGal © 2026 Andrea Fantini — software libero AGPL-3.0"* (oppure *"Basato su ProtoGal …"*
    per le versioni modificate);
  - le versioni modificate devono essere riconoscibili come tali e non presentarsi come l'originale;
  - le versioni modificate distribuite a terzi devono avere un nome diverso da "ProtoGal".

  Chiunque, comprese le pubbliche amministrazioni, può usare, studiare, modificare e ridistribuire
  il programma gratuitamente; chi lo modifica e lo rende disponibile via rete deve pubblicare il
  codice delle modifiche.

  La documentazione è rilasciata sotto **Creative Commons Attribuzione 4.0** (`CC-BY-4.0`).
  I componenti in `src/components/ui/` derivano da [shadcn/ui](https://ui.shadcn.com) e mantengono
  la licenza MIT.
- **Manutenzione**: [MANUTENTORE DA INDICARE — nome dell'azienda o dell'ente incaricato]
- **Segnalazioni di sicurezza**: **non usare le issue pubbliche**. Scrivere in forma riservata a
  [E-MAIL SICUREZZA DA INDICARE] (vedi [SECURITY.md](SECURITY.md)).
