# Protocollo PEC

Il modulo **Protocollo PEC** protocolla le PEC in entrata e in uscita senza aprire la casella:
un programma esterno legge le PEC in locale e le copia su Google Drive, ProtoGal le importa dal
foglio **GAL_Indice_PEC** e le protocolla nelle serie **P-A/0001/2026** (entrata) e
**P-U/0001/2026** (uscita), separate dai protocolli ordinari A/… e U/….

- **Data di protocollo = data della PEC**: quella certificata (file `daticert.xml` dentro l'EML)
  se presente, altrimenti la data dell'email, segnalata come "non certificata". Data e autore
  reali della protocollazione restano nello storico ("Protocollata il").
- Google Drive e il foglio sono **solo una sorgente**: numeri e stati stanno nel database del
  protocollo. ProtoGal legge Drive in sola lettura e non scrive né cancella nulla su Google.
- EML originale, PDF della PEC e allegati vengono **copiati nell'archivio del protocollo**
  (massimo 50 MB per file). Il PDF si scarica con il timbro `Prot. P-A/0001/2026 (PEC Arrivo)`.
- I protocolli PEC sono **sempre bloccati**: numero e data non cambiano, non si rinumerano, non si
  eliminano. Un amministratore può solo **annullarli** con un motivo; il numero resta occupato.
- Le **ricevute** (accettazione, consegna, mancata consegna) non diventano protocolli: vengono
  agganciate alla PEC inviata e compaiono nel suo dettaglio.

ProtoGal è un registro interno: non sostituisce il protocollo informatico ufficiale né la
conservazione a norma.

## Come si usa

1. **Protocollo PEC → Importazioni → Importa da Google Drive** (operatore o amministratore).
   Le PEC nuove del foglio entrano nella coda; quelle già importate si saltano.
2. **Protocollo PEC → Da protocollare**, scheda *Da verificare*: aprire ogni PEC, controllare
   entrata/uscita, oggetto, file e segnalazioni, poi **Segna come pronta** oppure **Scarta** (es.
   email che non vanno protocollate).
   - **Anomalie** (rosso): file mancanti o diversi da quelli dell'indice, duplicati, data
     assente. Impediscono la protocollazione. Un amministratore può **togliere la PEC dalla
     coda**: dopo aver sistemato i file su Drive, la prossima importazione la riprende.
   - **Avvisi** (giallo): data non certificata, numero di allegati diverso, PDF creato dal
     protocollo… Non bloccano.
   - **In ritardo** (viola): PEC più vecchia dell'ultima già protocollata nella stessa serie.
     Riceverà comunque il numero successivo; serve una conferma esplicita.
3. Scheda *Pronte*: selezionare le PEC e **Protocolla selezionate**. Si vedono i numeri previsti
   e si può scegliere un fascicolo. I numeri si assegnano in ordine di data della PEC, tutti
   insieme: se una PEC non può essere protocollata non viene assegnato nessun numero.
4. **PEC in entrata** e **PEC in uscita**: registro della serie PEC, con gli stessi filtri,
   esportazioni e dettaglio dei protocolli ordinari.

## Installazione (una volta sola)

### 1. Database

Nella SQL Editor del progetto Supabase eseguire
[`supabase/aggiornamenti/2026-10-protocollo-pec.sql`](../supabase/aggiornamenti/2026-10-protocollo-pec.sql)
(dopo `2026-10-fascicoli.sql`). Le installazioni nuove lo hanno già in `schema.sql`.

### 2. Limite dei file in Supabase

*Project Settings → Storage → Upload file size limit*: **50 MB** (il massimo del piano
gratuito). Senza questo passaggio i file oltre il limite precedente non vengono salvati.

### 3. Account di servizio Google (sola lettura)

Con l'account Google che contiene le PEC su Drive:

1. Aprire <https://console.cloud.google.com>, creare un progetto (es. *ProtoGal PEC*).
2. *API e servizi → Libreria*: attivare **Google Drive API** e **Google Sheets API**.
3. *IAM e amministrazione → Account di servizio → Crea account di servizio* (es. `protogal-pec`).
   Nessun ruolo da assegnare.
4. Aprire l'account creato → *Chiavi → Aggiungi chiave → Crea nuova chiave → JSON*: viene
   scaricato un file. **È una chiave riservata**: non va inviata per email, messa su GitHub o
   incollata in chat.
5. Copiare l'indirizzo dell'account di servizio (`…@….iam.gserviceaccount.com`).
6. In Google Drive **condividere con quell'indirizzo, come Visualizzatore**:
   - la cartella che contiene le PEC (quella principale: le sottocartelle seguono);
   - il foglio **GAL_Indice_PEC**.

### 4. Segreti della funzione

In Supabase, *Edge Functions → Secrets* (o *Project Settings → Edge Functions*), aggiungere:

| Nome | Valore |
|------|--------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | l'intero contenuto del file JSON scaricato al punto 3.4 |
| `PEC_SPREADSHEET_ID` | l'ID del foglio: la parte tra `/d/` e `/edit` nell'indirizzo del foglio |

Poi cancellare il file JSON dal computer. Se la chiave venisse esposta, eliminarla dalla console
Google e crearne una nuova.

### 5. Funzione di importazione

La funzione si trova in [`supabase/functions/pec-importa/`](../supabase/functions/pec-importa/)
(file `index.ts` e `pec.ts`).

**Con il terminale** (Node.js installato), dalla cartella del repository:

```bash
npx supabase login
npx supabase functions deploy pec-importa --project-ref ID-DEL-PROGETTO
```

L'ID del progetto è la parte iniziale dell'indirizzo Supabase (`https://ID-DEL-PROGETTO.supabase.co`).

**Dalla dashboard**: *Edge Functions → Deploy a new function → Via Editor*, nome `pec-importa`,
creare i due file `index.ts` e `pec.ts` copiandone il contenuto, poi *Deploy*.

### 6. Prova

*Protocollo PEC → Importazioni → Importa da Google Drive*. Se la configurazione è incompleta la
pagina spiega cosa manca (chiave, foglio non condiviso, funzione non installata).

## Formato del foglio

Le colonne sono cercate **per nome**, in qualsiasi ordine.

- **Indice**: ID acquisizione, Direzione proposta (ENTRATA/USCITA), Data email (non certificata),
  Mittente, Destinatari, CC, Oggetto, Corpo testo (anteprima), Message-ID, N. allegati, Link
  originale EML, Link cartella Drive, SHA256 originale, Note verifica, Link PDF PEC (senza timbro)
  — quest'ultima facoltativa: senza PDF ProtoGal crea una scheda con i dati dell'indice.
- **Allegati**: ID acquisizione, Posizione, Nome allegato, Link diretto Google Drive, SHA256 allegato.

Le impronte SHA-256 del foglio vengono confrontate con i file scaricati: se non coincidono la PEC
va in anomalia. Le colonne *Numero protocollo* e *Data protocollazione* del foglio non vengono
compilate da ProtoGal: il riferimento è il registro dell'app.
