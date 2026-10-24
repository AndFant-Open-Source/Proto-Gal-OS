<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Segnalazione di problemi di sicurezza

**Non aprire issue pubbliche per segnalare vulnerabilità.**

Le segnalazioni di sicurezza vanno inviate in forma riservata all'indirizzo:

> **[E-MAIL SICUREZZA DA INDICARE]**

Indicare, se possibile:

- versione del software (visibile a piè di pagina, es. `ProtoGal v1.1.0`);
- descrizione del problema e dei passi per riprodurlo;
- impatto stimato (es. accesso ai dati da parte di un utente non abilitato, modifica non autorizzata di un protocollo).

Il manutentore conferma la ricezione entro 2 giorni lavorativi. I dettagli della vulnerabilità
restano riservati fino al rilascio della correzione e vengono pubblicati successivamente, come
previsto dalle Linee guida AgID su acquisizione e riuso del software (Allegato B §B.2.3).

## Misure di sicurezza adottate

- Un progetto Supabase separato per ogni GAL: i dati di enti diversi non stanno mai nello stesso
  database. Row Level Security su tutte le tabelle: vede i dati solo chi ha un profilo attivo
  (`supabase/schema.sql`).
- Numero e data di protocollazione assegnati dal database e modificabili solo dagli amministratori, con controllo
  lato database (trigger) e non solo nell'interfaccia.
- Allegati in un bucket privato, accessibili solo tramite URL firmati temporanei.
- Nessuna credenziale nel repository: le chiavi stanno nel file `.env`, escluso da git.
  Nel browser si usa solo la chiave pubblica `anon` di Supabase; la chiave `service_role` non
  deve mai essere inserita nell'applicazione.
