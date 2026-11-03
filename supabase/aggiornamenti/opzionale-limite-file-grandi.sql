-- SPDX-License-Identifier: AGPL-3.0-or-later
-- SPDX-FileCopyrightText: 2026 Andrea Fantini
-- Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
-- ================================================================
-- PROTOGAL OS — OPZIONALE: archivio con file oltre i 50 MB
--
-- Da eseguire SOLO sui progetti che ne hanno davvero bisogno, e solo
-- su un piano a pagamento: sul piano gratuito 50 MB è il massimo
-- consentito per file, e alzare il limite qui non lo supera.
--
-- Perché può servire: certe PEC con allegati pesanti (progetti,
-- cartografie, raccolte di foto) superano i 50 MB. Senza questo
-- aggiornamento il caricamento di quelle PEC viene rifiutato; le
-- altre proseguono senza problemi e le rifiutate si possono
-- ricaricare dopo, rilanciando l'acquisizione.
--
-- I limiti da alzare sono DUE e vanno alzati entrambi:
--  1. quello del progetto, dalla dashboard:
--     Project Settings → Storage → Upload file size limit;
--  2. quello del bucket, con questo script.
-- Vale il più basso dei due.
--
-- Il valore qui sotto è 150 MB, scelto per stare sopra il file più
-- grande osservato (circa 120 MB) con un margine. Cambiarlo se serve:
-- il numero è in byte (150 * 1024 * 1024).
--
-- Non modifica lo schema né i documenti già archiviati: cambia solo
-- il limite del bucket. Per tornare indietro si riesegue con
-- 52428800 (50 MB).
-- ================================================================

UPDATE storage.buckets
   SET file_size_limit = 157286400
 WHERE id = 'allegati-protocollo';

-- Verifica: deve risultare 157286400
SELECT id, file_size_limit FROM storage.buckets WHERE id = 'allegati-protocollo';
