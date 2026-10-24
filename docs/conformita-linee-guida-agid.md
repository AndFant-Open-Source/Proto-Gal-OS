# Conformità alle Linee guida AgID su acquisizione e riuso del software

Verifica di ProtoGal rispetto agli artt. 68–69 del CAD (D.Lgs. 82/2005) e alle *Linee guida su
acquisizione e riuso di software per le pubbliche amministrazioni* (AgID), in particolare il
capitolo 3 e gli Allegati A (pubblicazione), B (manutenzione) e C (licenze).

Data della verifica: 22 ottobre 2026 — versione 1.1.0.

Legenda: ✅ conforme · 🟡 predisposto, serve un'azione o una decisione dell'ente · ❌ non conforme ·
— non applicabile. "MUST", "SHOULD" e "MAY" sono i livelli di obbligo usati dalle Linee guida:
obbligatorio, raccomandato, facoltativo.

## Sintesi

Il software è **tecnicamente pronto per il rilascio come software libero**. Il codice è stato
adeguato alle prescrizioni tecniche dell'Allegato A; titolare (Andrea Fantini) e licenza
(AGPL-3.0-or-later con termini aggiuntivi, [licenza-e-titolarita.md](licenza-e-titolarita.md))
sono definiti. Restano due adempimenti che **non sono tecnici** e spettano al titolare:

1. rendere **pubblico** il repository, oggi privato (art. 69 c. 1: "repertorio pubblico");
2. **registrare** il software su Developers Italia (art. 69 c. 2-bis; All. A §A.11).

## Art. 69 CAD — obblighi di riuso

| Requisito | Prima | Ora | Note |
|-----------|:---:|:---:|------|
| Codice sorgente in repertorio pubblico (c. 1) | ❌ | 🟡 | Repository GitHub **privato**: va reso pubblico |
| Rilasciato sotto licenza aperta (c. 1) | ❌ | ✅ | AGPL-3.0-or-later (approvata OSI) con termini aggiuntivi ammessi dalla sezione 7 |
| Completo della documentazione (c. 1) | 🟡 | ✅ | `docs/`, `supabase/README.md`, README |
| Titolarità dei diritti (c. 2) | ❌ | ✅ | Andrea Fantini, autore: software sviluppato in autonomia. Se fosse stato commissionato da un ente, vedi [licenza-e-titolarita.md](licenza-e-titolarita.md) §4 |
| Pubblicazione su piattaforma AgID / Developers Italia (c. 2-bis) | ❌ | 🟡 | `publiccode.yml` pronto; registrazione da fare |

## Allegato A — Pubblicazione come open source

| § | Requisito | Livello | Prima | Ora | Note |
|---|-----------|:---:|:---:|:---:|------|
| A.2 | Piattaforma di code hosting conforme | MUST | ✅ | ✅ | GitHub è tra quelle indicate |
| A.2 | Accesso in lettura senza autenticazione | MUST | ❌ | 🟡 | Rendere pubblico il repository |
| A.2 | Area intestata al progetto, non all'incaricato; ente con massimi poteri | MUST | ❌ | 🟡 | Oggi è sotto l'utente personale `AndFantini`: consigliato trasferirlo a un'organizzazione |
| A.2 | Link al repository nell'interfaccia pubblica | MUST | ❌ | ✅ | A piè di pagina nel login e nel menu, con versione e licenza |
| A.3 | Compatibilità della licenza con i componenti di terzi | MUST | — | ✅ | Tutte le dipendenze di produzione verificate: MIT, ISC, Apache-2.0, BSD, 0BSD, Zlib |
| A.3 | Licenza distinta per file di terzi | MAY | ❌ | ✅ | `src/components/ui/` (shadcn/ui) marcati MIT con nota di copyright |
| A.4 | File `LICENSE` con testo integrale | MUST | ❌ | ✅ | Testo ufficiale GNU AGPL v3 |
| A.4 | Codice SPDX all'inizio di ogni file sorgente | MUST | ❌ | ✅ | Tutti i file `.ts`, `.tsx`, `.sql`, `.css`, `.js`, `.html`; `REUSE.toml` per gli altri |
| A.4 | Titolare dei diritti indicato | MUST | ❌ | ✅ | Andrea Fantini, in ogni file sorgente e in `REUSE.toml`; se lo sviluppo fosse stato commissionato da un ente, vedi [licenza-e-titolarita.md](licenza-e-titolarita.md) §4 |
| A.5 | Rilascio di codice, struttura DB, script di installazione, documentazione | MUST | 🟡 | ✅ | Struttura DB in un unico `supabase/schema.sql` |
| A.5 | Esclusione dei dati di produzione | MUST | ✅ | ✅ | Nessun dato reale nel repository; `.env` escluso |
| A.6 | Codice integrale, leggibile, non offuscato né minificato | MUST | ✅ | ✅ | Il sorgente è TypeScript leggibile; la minificazione riguarda solo la build |
| A.6 | Codice indentato e commentato, stile coerente | MUST | ✅ | ✅ | |
| A.6 | Struttura delle cartelle chiara | MUST | 🟡 | ✅ | Schema del database in `supabase/`; documentazione in `docs/` |
| A.6 | Specificità dell'ente configurabili | SHOULD | 🟡 | ✅ | Nome ente, uffici e link al codice da `.env` (prima gli uffici erano nel codice) |
| A.6 | Uso di package manager | SHOULD | ✅ | ✅ | npm con `package-lock.json` |
| A.7 | README completo (descrizione, prerequisiti, installazione, stato, titolare, manutentore, e-mail di sicurezza) | MUST | ❌ | 🟡 | Riscritto; restano i segnaposto di titolare, manutentore ed e-mail e vanno aggiunte le schermate dell'interfaccia |
| A.7 | Link a Continuous Integration / metriche | SHOULD | ❌ | ❌ | Non presente: vedi "Miglioramenti consigliati" |
| A.8 | Documentazione di installazione, sviluppo, produzione, architettura | MUST | 🟡 | ✅ | `docs/installazione.md`, `docs/architettura.md` |
| A.8 | Documentazione in formato testuale versionabile (no PDF/DOCX) | MUST | ✅ | ✅ | Markdown |
| A.9 | Rilascio contestuale allo sviluppo o entro 15 giorni dall'uso in produzione | MUST | ❌ | 🟡 | Il software è già in uso: rilasciare appena rese pubbliche le informazioni |
| A.10 | Nessuna credenziale nel repository, anche nella storia | MUST | ✅ | ✅ | Verificata tutta la storia git, compreso un `.docx` eliminato: nessuna chiave o password |
| A.10 | Rimozione del codice morto | MUST | ❌ | ✅ | Rimosse 7 librerie inutilizzate, 1 funzione, 1 file vuoto anomalo, configurazione locale `.claude/` |
| A.10 | `/.well-known/security.txt` | SHOULD | ❌ | 🟡 | File presente; compilare e-mail e indirizzo |
| A.11 | `publiccode.yml` nella radice | MUST | ❌ | 🟡 | Presente; compilare titolare, contatti, codice IPA |
| A.11 | Registrazione su Developers Italia | MUST | ❌ | 🟡 | Da fare dopo la pubblicazione |

## Allegato B — Manutenzione

| Requisito | Stato | Note |
|-----------|:---:|------|
| Modifiche pubblicate nel repository prima del collaudo o della produzione | 🟡 | Già oggi ogni modifica passa da GitHub: basterà rendere il repository pubblico |
| Aggiornamento delle dipendenze, priorità ai fix di sicurezza | ✅ | Eseguito in ottobre 2026 (audit npm: restano 2 avvisi moderati su `react-router`, non sfruttabili nell'uso attuale) |
| Ruolo di manutentore indicato in README e `publiccode.yml` | 🟡 | Segnaposto da compilare |
| Risposta alle segnalazioni entro 2 giorni lavorativi | 🟡 | Organizzativo: attivare le Issues GitHub e definire chi risponde |

## Allegato C — Licenze

| Requisito | Stato | Note |
|-----------|:---:|------|
| Licenza certificata OSI | ✅ | AGPL-3.0 è approvata OSI |
| Licenza consigliata per software usato via rete | ✅ | AGPL-3.0-or-later (§3.5.3) |
| Documentazione sotto CC-BY-4.0 | ✅ | Indicato in `REUSE.toml` |
| Identificazione con codice SPDX | ✅ | |

## Altri obblighi da considerare (fuori dal perimetro delle Linee guida sul riuso)

Non sono stati verificati in questa analisi, ma riguardano un software usato da una PA:

- **Accessibilità** (L. 4/2004 e Linee guida AgID sull'accessibilità): per le applicazioni web delle
  PA va pubblicata una dichiarazione di accessibilità. Non è stata fatta una verifica WCAG 2.1 AA.
- **Protezione dei dati** (GDPR): il registro contiene dati personali di mittenti e destinatari.
  L'ente deve indicare il trattamento nel proprio registro dei trattamenti e nominare il fornitore
  del servizio cloud (Supabase) responsabile del trattamento. I dati risiedono nell'UE se il progetto
  Supabase è nella regione Frankfurt.
- **Protocollo informatico** (DPCM 3 dicembre 2013 e Linee guida AgID sul documento informatico):
  ProtoGal nasce come **registro di protocollo interno**. Non implementa gli elementi del protocollo
  informatico "ufficiale": segnatura XML, registro giornaliero di protocollo inviato in conservazione,
  integrazione con la PEC dell'ente. Se il GAL è tenuto alla gestione documentale ai sensi del CAD,
  questi aspetti vanno valutati prima di considerarlo il protocollo ufficiale dell'ente.

## Miglioramenti consigliati (non obbligatori)

- Test automatici e Continuous Integration su GitHub Actions (build e controllo dei tipi a ogni modifica).
- `CONTRIBUTING.md` con le regole per contribuire.
- Aggiornare `react-router-dom` alla versione 7 per chiudere gli ultimi avvisi di sicurezza moderati.
