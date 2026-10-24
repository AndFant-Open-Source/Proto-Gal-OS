# Installazione

Guida per installare ProtoGal da zero, in sviluppo e in produzione
(Linee guida AgID su acquisizione e riuso del software, Allegato A §A.8).

## Prerequisiti

| Componente | Versione | Note |
|------------|----------|------|
| Node.js | 20 o superiore | Necessario solo per compilare; l'app compilata è un insieme di file statici |
| npm | 10 o superiore | Incluso in Node.js |
| Supabase | — | Database PostgreSQL, autenticazione e archivio file. Software libero (Apache-2.0): si può usare il servizio cloud supabase.com oppure installarlo sui propri server |
| Hosting di file statici | — | Qualsiasi servizio (Vercel, Netlify, un server web Nginx/Apache). Il repository include la configurazione per Vercel (`vercel.json`) |

Nessuna dipendenza da software commerciale è obbligatoria: Supabase e tutte le librerie usate sono
software libero (licenze MIT, ISC, Apache-2.0, BSD).

## 1. Database (Supabase)

**Un progetto Supabase per ogni GAL.** Ripetere questi passi per ciascun ente: i dati restano
separati perché stanno su server diversi.

1. Creare un progetto Supabase **nuovo**, intestato all'account del GAL (regione consigliata:
   **Europe West – Frankfurt**, per la residenza dei dati nell'UE).
2. In *Authentication → Sign In / Providers* **disattivare la registrazione libera** ("Allow new
   users to sign up"): gli utenti si creano solo su invito.
3. Eseguire nella SQL Editor l'intero file [`supabase/schema.sql`](../supabase/schema.sql).
   Crea tabelle, regole di sicurezza e archivio file privato.
4. Creare il primo amministratore:
   1. *Authentication → Users → Invite user*: inserire l'e-mail dell'amministratore del GAL.
   2. Copiare l'UUID dell'utente creato ed eseguire:

      ```sql
      INSERT INTO protocollo_profili (id, nome_completo, ruolo)
      VALUES ('UUID-DELL-UTENTE', 'Nome Cognome', 'admin');
      ```
5. Per ogni altra persona del GAL: invito da *Invite user*, poi lo stesso comando con ruolo
   `operatore` o `lettore`. Ruoli e stato si gestiscono poi dall'app (*Gestione Utenti*).

## 2. Ambiente di sviluppo

```bash
git clone https://github.com/Gal-Etrusco-Cimino/ProtoGal.git
cd ProtoGal
npm install
cp .env.example .env    # su Windows: copy .env.example .env
```

Compilare `.env` (vedi i commenti nel file). Usare **solo** la chiave pubblica `anon` di Supabase,
mai la `service_role`.

```bash
npm run dev
```

L'applicazione è disponibile su `http://localhost:5173`. Su Windows si può usare anche `avvia.bat`.

## 3. Compilazione

```bash
npm run build
```

Esegue il controllo dei tipi TypeScript e produce i file statici nella cartella `dist/`.

## 4. Produzione

**Vercel** (configurazione già presente in `vercel.json`):

1. Importare il repository in Vercel.
2. Impostare le stesse variabili del file `.env` in *Settings → Environment Variables*.
3. Ogni push sul ramo `main` pubblica una nuova versione.

**Altro hosting**: pubblicare il contenuto di `dist/` e configurare il server perché ogni percorso
non trovato restituisca `index.html` (applicazione a pagina singola).

Dopo la pubblicazione verificare che `https://<indirizzo>/.well-known/security.txt` risponda e che
i campi del file `public/.well-known/security.txt` siano compilati.

## Configurazione

| Variabile | Obbligatoria | Descrizione |
|-----------|:---:|-------------|
| `VITE_SUPABASE_URL` | sì | URL del progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | sì | Chiave pubblica `anon` |
| `VITE_NOME_ENTE` | sì | Nome dell'ente mostrato nell'interfaccia |
| `VITE_ANNO_CORRENTE` | no | Anno predefinito |
| `VITE_UFFICI` | no | Uffici dell'ente separati da `;` |
| `VITE_URL_CODICE_SORGENTE` | no | Link al codice sorgente mostrato a piè di pagina |
