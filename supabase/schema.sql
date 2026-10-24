-- SPDX-License-Identifier: AGPL-3.0-or-later
-- SPDX-FileCopyrightText: 2026 Andrea Fantini
-- Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
-- ================================================================
-- PROTOGAL — EDIZIONE PER SINGOLO GAL — Schema completo del database
--
-- Ogni GAL ha il PROPRIO progetto Supabase: questo database contiene
-- i dati di un solo ente. Non esiste il concetto di "più GAL": nessun
-- utente, nemmeno l'amministratore, può vedere o gestire un altro ente.
--
-- Uso: progetto Supabase NUOVO → SQL Editor → eseguire l'intero file.
-- È idempotente: rieseguirlo non cancella dati.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Archivio file (Storage): bucket privato, max 20 MB, formati ammessi
-- ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'allegati-protocollo', 'allegati-protocollo', false, 20971520,
  ARRAY[
    'application/pdf', 'application/pkcs7-mime', 'application/x-pkcs7-mime',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'image/tiff',
    'message/rfc822', 'application/vnd.ms-outlook'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------
-- 2. Funzione di servizio: updated_at automatico
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION aggiorna_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------
-- 3. Profili utente (persone del GAL) e ruoli
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocollo_profili (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo text NOT NULL,
  ruolo         text NOT NULL CHECK (ruolo IN ('admin', 'operatore', 'lettore')),
  ufficio       text,
  attivo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profili_updated_at ON protocollo_profili;
CREATE TRIGGER trg_profili_updated_at
  BEFORE UPDATE ON protocollo_profili
  FOR EACH ROW EXECUTE FUNCTION aggiorna_updated_at();

-- Funzioni di autorizzazione (SECURITY DEFINER: leggono i profili senza
-- subire l'RLS ed evitano ricorsioni; search_path fisso per sicurezza)
CREATE OR REPLACE FUNCTION protocollo_utente_attivo()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protocollo_profili
    WHERE id = auth.uid() AND attivo = true
  );
$$;

CREATE OR REPLACE FUNCTION protocollo_is_operatore()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protocollo_profili
    WHERE id = auth.uid() AND ruolo IN ('admin', 'operatore') AND attivo = true
  );
$$;

CREATE OR REPLACE FUNCTION protocollo_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protocollo_profili
    WHERE id = auth.uid() AND ruolo = 'admin' AND attivo = true
  );
$$;

ALTER TABLE protocollo_profili ENABLE ROW LEVEL SECURITY;

-- Ogni utente vede il proprio profilo; i colleghi attivi si vedono tra loro.
-- Un account senza profilo (es. registrato da solo) non vede nessuno.
DROP POLICY IF EXISTS "profili_lettura" ON protocollo_profili;
CREATE POLICY "profili_lettura" ON protocollo_profili
  FOR SELECT USING (id = auth.uid() OR protocollo_utente_attivo());

DROP POLICY IF EXISTS "profili_aggiornamento_admin" ON protocollo_profili;
CREATE POLICY "profili_aggiornamento_admin" ON protocollo_profili
  FOR UPDATE USING (protocollo_is_admin()) WITH CHECK (protocollo_is_admin());

-- ----------------------------------------------------------------
-- 4. Registro di protocollo
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocollo_registro (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero               integer NOT NULL CHECK (numero > 0),
  anno                 integer NOT NULL,
  tipo_flusso          text NOT NULL CHECK (tipo_flusso IN ('arrivo', 'partenza')),
  -- A/0015/2026 (entrata) — U/0015/2026 (uscita): calcolato dal database
  numero_completo      text GENERATED ALWAYS AS (
                         CASE tipo_flusso WHEN 'arrivo' THEN 'A' ELSE 'U' END || '/' ||
                         lpad(numero::text, 4, '0') || '/' || anno::text
                       ) STORED,
  data_registrazione   timestamptz NOT NULL DEFAULT now(),
  data_documento       date,
  canale               text NOT NULL CHECK (canale IN ('pec', 'email', 'cartaceo', 'digitale')),
  oggetto              text NOT NULL,
  mittente_nome        text,
  mittente_email       text,
  mittente_pec         text,
  destinatario_nome    text,
  destinatario_email   text,
  destinatario_pec     text,
  ufficio_assegnatario text,
  operatore_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stato                text NOT NULL DEFAULT 'ricevuto'
                       CHECK (stato IN ('ricevuto', 'in_lavorazione', 'evaso', 'archiviato')),
  note                 text,
  protocollo_collegato text,
  bloccato             boolean NOT NULL DEFAULT false,
  bloccato_da          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  bloccato_il          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protocollo_registro_anno_tipo_numero_key UNIQUE (anno, tipo_flusso, numero)
);

CREATE INDEX IF NOT EXISTS idx_registro_anno            ON protocollo_registro (anno);
CREATE INDEX IF NOT EXISTS idx_registro_data            ON protocollo_registro (data_registrazione);
CREATE INDEX IF NOT EXISTS idx_registro_numero_completo ON protocollo_registro (numero_completo);

DROP TRIGGER IF EXISTS trg_registro_updated_at ON protocollo_registro;
CREATE TRIGGER trg_registro_updated_at
  BEFORE UPDATE ON protocollo_registro
  FOR EACH ROW EXECUTE FUNCTION aggiorna_updated_at();

-- Contatori per anno e tipo (arrivo/partenza)
CREATE TABLE IF NOT EXISTS protocollo_sequenze (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anno          integer NOT NULL,
  tipo_flusso   text NOT NULL CHECK (tipo_flusso IN ('arrivo', 'partenza')),
  ultimo_numero integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protocollo_sequenze_anno_tipo_key UNIQUE (anno, tipo_flusso)
);

-- Prossimo numero (uso interno ai trigger: incrementa il contatore)
CREATE OR REPLACE FUNCTION protocollo_incrementa(p_anno integer, p_tipo_flusso text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero integer;
BEGIN
  INSERT INTO protocollo_sequenze (anno, tipo_flusso, ultimo_numero)
    VALUES (p_anno, p_tipo_flusso, 1)
    ON CONFLICT (anno, tipo_flusso) DO UPDATE
      SET ultimo_numero = protocollo_sequenze.ultimo_numero + 1,
          updated_at    = now()
  RETURNING ultimo_numero INTO v_numero;
  RETURN v_numero;
END;
$$;
REVOKE ALL ON FUNCTION protocollo_incrementa(integer, text) FROM PUBLIC, anon, authenticated;

-- Protezione dei dati di registrazione
--  - INSERT: numero, anno, data e operatore li assegna il database, nella stessa
--    transazione (nessun numero scelto dal client, nessun numero perso se fallisce)
--  - UPDATE: numero, anno, data solo admin; protocollo bloccato immutabile;
--    sblocco solo admin; cambio arrivo↔partenza = nuovo numero della serie
CREATE OR REPLACE FUNCTION protocollo_proteggi_campi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SQL Editor / service role (importazioni, manutenzione): nessun vincolo
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.data_registrazione := now();
    NEW.operatore_id := auth.uid();
    NEW.anno := extract(year FROM now() AT TIME ZONE 'Europe/Rome')::int;
    NEW.numero := protocollo_incrementa(NEW.anno, NEW.tipo_flusso);
    IF NEW.bloccato THEN
      NEW.bloccato_da := auth.uid();
      NEW.bloccato_il := now();
    ELSE
      NEW.bloccato_da := NULL;
      NEW.bloccato_il := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Blocco / sblocco
  IF NEW.bloccato IS DISTINCT FROM OLD.bloccato THEN
    IF NEW.bloccato THEN
      NEW.bloccato_da := auth.uid();
      NEW.bloccato_il := now();
    ELSE
      IF NOT protocollo_is_admin() THEN
        RAISE EXCEPTION 'Solo un amministratore può sbloccare un protocollo' USING ERRCODE = '42501';
      END IF;
      NEW.bloccato_da := NULL;
      NEW.bloccato_il := NULL;
    END IF;
  ELSE
    NEW.bloccato_da := OLD.bloccato_da;
    NEW.bloccato_il := OLD.bloccato_il;
  END IF;

  IF OLD.bloccato AND NEW.bloccato AND (
       NEW.numero             IS DISTINCT FROM OLD.numero
    OR NEW.anno               IS DISTINCT FROM OLD.anno
    OR NEW.tipo_flusso        IS DISTINCT FROM OLD.tipo_flusso
    OR NEW.data_registrazione IS DISTINCT FROM OLD.data_registrazione
  ) THEN
    RAISE EXCEPTION 'Protocollo % bloccato: numero, tipo e data non possono essere modificati', OLD.numero_completo
      USING ERRCODE = '42501';
  END IF;

  IF NOT protocollo_is_admin() AND (
       NEW.numero             IS DISTINCT FROM OLD.numero
    OR NEW.anno               IS DISTINCT FROM OLD.anno
    OR NEW.data_registrazione IS DISTINCT FROM OLD.data_registrazione
    OR NEW.operatore_id       IS DISTINCT FROM OLD.operatore_id
  ) THEN
    RAISE EXCEPTION 'Solo un amministratore può modificare numero, anno o data di protocollazione'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.tipo_flusso IS DISTINCT FROM OLD.tipo_flusso AND NEW.numero = OLD.numero THEN
    NEW.numero := protocollo_incrementa(NEW.anno, NEW.tipo_flusso);
  END IF;

  IF (NEW.data_registrazione IS DISTINCT FROM OLD.data_registrazione OR NEW.anno IS DISTINCT FROM OLD.anno)
     AND extract(year FROM NEW.data_registrazione AT TIME ZONE 'Europe/Rome')::int <> NEW.anno THEN
    RAISE EXCEPTION 'La data di protocollazione deve appartenere all''anno %', NEW.anno USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protocollo_proteggi_campi ON protocollo_registro;
CREATE TRIGGER trg_protocollo_proteggi_campi
  BEFORE INSERT OR UPDATE ON protocollo_registro
  FOR EACH ROW EXECUTE FUNCTION protocollo_proteggi_campi();

-- Un protocollo bloccato non può essere eliminato
CREATE OR REPLACE FUNCTION protocollo_blocca_eliminazione()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.bloccato AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Protocollo % bloccato: sbloccalo prima di eliminarlo', OLD.numero_completo
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protocollo_blocca_eliminazione ON protocollo_registro;
CREATE TRIGGER trg_protocollo_blocca_eliminazione
  BEFORE DELETE ON protocollo_registro
  FOR EACH ROW EXECUTE FUNCTION protocollo_blocca_eliminazione();

-- Allegati dei protocolli (file nello Storage: cartella <id protocollo>/)
CREATE TABLE IF NOT EXISTS protocollo_allegati (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocollo_id    uuid NOT NULL REFERENCES protocollo_registro(id) ON DELETE CASCADE,
  nome_file        text NOT NULL,
  storage_path     text NOT NULL,
  dimensione_bytes bigint,
  tipo_mime        text,
  caricato_da      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_allegati_protocollo ON protocollo_allegati (protocollo_id);

-- ----------------------------------------------------------------
-- 5. Repertorio contratti (C/0001/2026)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocollo_contratti (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                    integer NOT NULL CHECK (numero > 0),
  anno                      integer NOT NULL,
  numero_completo           text GENERATED ALWAYS AS (
                              'C/' || lpad(numero::text, 4, '0') || '/' || anno::text
                            ) STORED,
  data_repertorio           timestamptz NOT NULL DEFAULT now(),
  data_stipula              date,
  tipo_contratto            text NOT NULL DEFAULT 'servizi'
                            CHECK (tipo_contratto IN ('lavori', 'servizi', 'forniture',
                                   'incarico_professionale', 'convenzione', 'altro')),
  forma_stipula             text
                            CHECK (forma_stipula IN ('scrittura_privata', 'scrittura_privata_autenticata',
                                   'atto_pubblico_amministrativo', 'corrispondenza_commerciale', 'altro')),
  oggetto                   text NOT NULL,
  contraente_nome           text NOT NULL,
  contraente_codice_fiscale text,
  contraente_pec            text,
  importo                   numeric(14, 2) CHECK (importo IS NULL OR importo >= 0),
  cig                       text,
  cup                       text,
  data_inizio               date,
  data_fine                 date,
  stato                     text NOT NULL DEFAULT 'in_corso'
                            CHECK (stato IN ('in_corso', 'concluso', 'risolto', 'annullato')),
  protocollo_collegato      text,
  note                      text,
  operatore_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protocollo_contratti_anno_numero_key UNIQUE (anno, numero),
  CONSTRAINT protocollo_contratti_date_check
    CHECK (data_fine IS NULL OR data_inizio IS NULL OR data_fine >= data_inizio)
);
CREATE INDEX IF NOT EXISTS idx_contratti_anno      ON protocollo_contratti (anno);
CREATE INDEX IF NOT EXISTS idx_contratti_data_fine ON protocollo_contratti (data_fine);

DROP TRIGGER IF EXISTS trg_contratti_updated_at ON protocollo_contratti;
CREATE TRIGGER trg_contratti_updated_at
  BEFORE UPDATE ON protocollo_contratti
  FOR EACH ROW EXECUTE FUNCTION aggiorna_updated_at();

CREATE TABLE IF NOT EXISTS protocollo_contratti_sequenze (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anno          integer NOT NULL UNIQUE,
  ultimo_numero integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION contratti_proteggi_campi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.data_repertorio := now();
    NEW.operatore_id := auth.uid();
    NEW.anno := extract(year FROM now() AT TIME ZONE 'Europe/Rome')::int;
    INSERT INTO protocollo_contratti_sequenze (anno, ultimo_numero)
      VALUES (NEW.anno, 1)
      ON CONFLICT (anno) DO UPDATE
        SET ultimo_numero = protocollo_contratti_sequenze.ultimo_numero + 1,
            updated_at    = now()
    RETURNING ultimo_numero INTO NEW.numero;
    RETURN NEW;
  END IF;

  IF NOT protocollo_is_admin() AND (
       NEW.numero          IS DISTINCT FROM OLD.numero
    OR NEW.anno            IS DISTINCT FROM OLD.anno
    OR NEW.data_repertorio IS DISTINCT FROM OLD.data_repertorio
    OR NEW.operatore_id    IS DISTINCT FROM OLD.operatore_id
  ) THEN
    RAISE EXCEPTION 'Solo un amministratore può modificare numero, anno o data di repertorio'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.data_repertorio IS DISTINCT FROM OLD.data_repertorio OR NEW.anno IS DISTINCT FROM OLD.anno)
     AND extract(year FROM NEW.data_repertorio AT TIME ZONE 'Europe/Rome')::int <> NEW.anno THEN
    RAISE EXCEPTION 'La data di repertorio deve appartenere all''anno %', NEW.anno USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contratti_proteggi_campi ON protocollo_contratti;
CREATE TRIGGER trg_contratti_proteggi_campi
  BEFORE INSERT OR UPDATE ON protocollo_contratti
  FOR EACH ROW EXECUTE FUNCTION contratti_proteggi_campi();

-- Allegati dei contratti (file nello Storage: cartella contratti/<id contratto>/)
CREATE TABLE IF NOT EXISTS protocollo_contratti_allegati (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contratto_id     uuid NOT NULL REFERENCES protocollo_contratti(id) ON DELETE CASCADE,
  nome_file        text NOT NULL,
  storage_path     text NOT NULL,
  dimensione_bytes bigint,
  tipo_mime        text,
  caricato_da      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contratti_allegati_contratto ON protocollo_contratti_allegati (contratto_id);

-- ----------------------------------------------------------------
-- 6. Storico delle azioni (non modificabile dall'app)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocollo_log_azioni (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocollo_id       uuid REFERENCES protocollo_registro(id) ON DELETE SET NULL,
  contratto_id        uuid REFERENCES protocollo_contratti(id) ON DELETE SET NULL,
  -- Chiave verso i profili: permette di mostrare il nome di chi ha agito
  utente_id           uuid REFERENCES protocollo_profili(id) ON DELETE SET NULL,
  azione              text NOT NULL,
  dettaglio           jsonb,
  numero_completo_rif text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_log_protocollo ON protocollo_log_azioni (protocollo_id);
CREATE INDEX IF NOT EXISTS idx_log_contratto  ON protocollo_log_azioni (contratto_id);

-- Riferimento al numero, conservato anche se protocollo o contratto vengono eliminati
CREATE OR REPLACE FUNCTION protocollo_log_riferimenti()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.protocollo_id IS NOT NULL THEN
    SELECT numero_completo INTO NEW.numero_completo_rif
      FROM protocollo_registro WHERE id = NEW.protocollo_id;
  ELSIF NEW.contratto_id IS NOT NULL THEN
    SELECT numero_completo INTO NEW.numero_completo_rif
      FROM protocollo_contratti WHERE id = NEW.contratto_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_riferimenti ON protocollo_log_azioni;
CREATE TRIGGER trg_log_riferimenti
  BEFORE INSERT ON protocollo_log_azioni
  FOR EACH ROW EXECUTE FUNCTION protocollo_log_riferimenti();

-- Eliminazioni registrate dal database (non dipendono dal browser)
CREATE OR REPLACE FUNCTION protocollo_log_eliminazione()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO protocollo_log_azioni (utente_id, azione, dettaglio, numero_completo_rif)
  VALUES (
    auth.uid(),
    CASE TG_TABLE_NAME WHEN 'protocollo_contratti' THEN 'ELIMINAZIONE_CONTRATTO' ELSE 'ELIMINAZIONE' END,
    jsonb_build_object('numero_completo', OLD.numero_completo, 'oggetto', OLD.oggetto),
    OLD.numero_completo
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protocollo_log_eliminazione ON protocollo_registro;
CREATE TRIGGER trg_protocollo_log_eliminazione
  AFTER DELETE ON protocollo_registro
  FOR EACH ROW EXECUTE FUNCTION protocollo_log_eliminazione();

DROP TRIGGER IF EXISTS trg_contratti_log_eliminazione ON protocollo_contratti;
CREATE TRIGGER trg_contratti_log_eliminazione
  AFTER DELETE ON protocollo_contratti
  FOR EACH ROW EXECUTE FUNCTION protocollo_log_eliminazione();

-- ----------------------------------------------------------------
-- 7. Rinumerazione progressiva atomica (esclude i protocolli bloccati)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION protocollo_rinumera(p_anno integer, p_tipo_flusso text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefisso  text;
  v_sbloccati integer;
  v_bloccati  integer;
  v_massimo   integer;
BEGIN
  IF NOT protocollo_is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori' USING ERRCODE = '42501';
  END IF;
  IF p_tipo_flusso NOT IN ('arrivo', 'partenza') THEN
    RAISE EXCEPTION 'Tipo flusso non valido' USING ERRCODE = '22023';
  END IF;
  v_prefisso := CASE p_tipo_flusso WHEN 'arrivo' THEN 'A' ELSE 'U' END;

  -- Blocca il contatore: le nuove registrazioni attendono la fine
  PERFORM 1 FROM protocollo_sequenze WHERE anno = p_anno AND tipo_flusso = p_tipo_flusso FOR UPDATE;

  SELECT count(*) FILTER (WHERE NOT bloccato), count(*) FILTER (WHERE bloccato)
    INTO v_sbloccati, v_bloccati
    FROM protocollo_registro WHERE anno = p_anno AND tipo_flusso = p_tipo_flusso;

  CREATE TEMP TABLE IF NOT EXISTS _rinumera (id uuid, numero integer, numero_completo text, nuovo integer) ON COMMIT DROP;
  DELETE FROM _rinumera;
  INSERT INTO _rinumera
  SELECT o.id, o.numero, o.numero_completo, l.n
  FROM (
    SELECT id, numero, numero_completo,
           row_number() OVER (ORDER BY data_registrazione, created_at, id) AS rn
    FROM protocollo_registro
    WHERE anno = p_anno AND tipo_flusso = p_tipo_flusso AND NOT bloccato
  ) o
  JOIN (
    SELECT n, row_number() OVER (ORDER BY n) AS rn
    FROM generate_series(1, greatest(v_sbloccati + v_bloccati, 1)) AS n
    WHERE n NOT IN (SELECT numero FROM protocollo_registro
                    WHERE anno = p_anno AND tipo_flusso = p_tipo_flusso AND bloccato)
  ) l ON l.rn = o.rn;

  INSERT INTO protocollo_log_azioni (protocollo_id, utente_id, azione, dettaglio)
  SELECT id, auth.uid(), 'RINUMERAZIONE',
         jsonb_build_object('vecchio_numero', numero_completo,
                            'nuovo_numero', v_prefisso || '/' || lpad(nuovo::text, 4, '0') || '/' || p_anno)
  FROM _rinumera WHERE numero <> nuovo;

  UPDATE protocollo_registro SET numero = numero + 1000000
    WHERE anno = p_anno AND tipo_flusso = p_tipo_flusso AND NOT bloccato;
  UPDATE protocollo_registro r SET numero = t.nuovo FROM _rinumera t WHERE r.id = t.id;

  SELECT coalesce(max(numero), 0) INTO v_massimo
    FROM protocollo_registro WHERE anno = p_anno AND tipo_flusso = p_tipo_flusso;
  INSERT INTO protocollo_sequenze (anno, tipo_flusso, ultimo_numero)
    VALUES (p_anno, p_tipo_flusso, v_massimo)
    ON CONFLICT (anno, tipo_flusso) DO UPDATE
      SET ultimo_numero = EXCLUDED.ultimo_numero, updated_at = now();

  RETURN v_sbloccati;
END;
$$;
REVOKE ALL ON FUNCTION protocollo_rinumera(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION protocollo_rinumera(integer, text) TO authenticated;

-- ----------------------------------------------------------------
-- 8. Row Level Security: solo utenti con profilo ATTIVO
--    lettura: tutti i ruoli · scrittura: admin e operatori · eliminazione: admin
-- ----------------------------------------------------------------
ALTER TABLE protocollo_registro           ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_sequenze           ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_allegati           ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_contratti          ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_contratti_sequenze ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_contratti_allegati ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_log_azioni         ENABLE ROW LEVEL SECURITY;

-- Registro e contratti
DROP POLICY IF EXISTS "registro_lettura"      ON protocollo_registro;
DROP POLICY IF EXISTS "registro_inserimento"  ON protocollo_registro;
DROP POLICY IF EXISTS "registro_modifica"     ON protocollo_registro;
DROP POLICY IF EXISTS "registro_eliminazione" ON protocollo_registro;
CREATE POLICY "registro_lettura"      ON protocollo_registro FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "registro_inserimento"  ON protocollo_registro FOR INSERT WITH CHECK (protocollo_is_operatore());
CREATE POLICY "registro_modifica"     ON protocollo_registro FOR UPDATE
  USING (protocollo_is_operatore()) WITH CHECK (protocollo_is_operatore());
CREATE POLICY "registro_eliminazione" ON protocollo_registro FOR DELETE USING (protocollo_is_admin());

DROP POLICY IF EXISTS "contratti_lettura"      ON protocollo_contratti;
DROP POLICY IF EXISTS "contratti_inserimento"  ON protocollo_contratti;
DROP POLICY IF EXISTS "contratti_modifica"     ON protocollo_contratti;
DROP POLICY IF EXISTS "contratti_eliminazione" ON protocollo_contratti;
CREATE POLICY "contratti_lettura"      ON protocollo_contratti FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "contratti_inserimento"  ON protocollo_contratti FOR INSERT WITH CHECK (protocollo_is_operatore());
CREATE POLICY "contratti_modifica"     ON protocollo_contratti FOR UPDATE
  USING (protocollo_is_operatore()) WITH CHECK (protocollo_is_operatore());
CREATE POLICY "contratti_eliminazione" ON protocollo_contratti FOR DELETE USING (protocollo_is_admin());

-- Contatori: lettura per l'anteprima del prossimo numero; scrittura diretta solo admin
DROP POLICY IF EXISTS "sequenze_lettura" ON protocollo_sequenze;
DROP POLICY IF EXISTS "sequenze_admin"   ON protocollo_sequenze;
CREATE POLICY "sequenze_lettura" ON protocollo_sequenze FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "sequenze_admin"   ON protocollo_sequenze FOR ALL
  USING (protocollo_is_admin()) WITH CHECK (protocollo_is_admin());

DROP POLICY IF EXISTS "contratti_seq_lettura" ON protocollo_contratti_sequenze;
DROP POLICY IF EXISTS "contratti_seq_admin"   ON protocollo_contratti_sequenze;
CREATE POLICY "contratti_seq_lettura" ON protocollo_contratti_sequenze FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "contratti_seq_admin"   ON protocollo_contratti_sequenze FOR ALL
  USING (protocollo_is_admin()) WITH CHECK (protocollo_is_admin());

-- Allegati
DROP POLICY IF EXISTS "allegati_lettura"      ON protocollo_allegati;
DROP POLICY IF EXISTS "allegati_inserimento"  ON protocollo_allegati;
DROP POLICY IF EXISTS "allegati_eliminazione" ON protocollo_allegati;
CREATE POLICY "allegati_lettura"      ON protocollo_allegati FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "allegati_inserimento"  ON protocollo_allegati FOR INSERT WITH CHECK (protocollo_is_operatore());
CREATE POLICY "allegati_eliminazione" ON protocollo_allegati FOR DELETE USING (protocollo_is_operatore());

DROP POLICY IF EXISTS "contratti_allegati_lettura"      ON protocollo_contratti_allegati;
DROP POLICY IF EXISTS "contratti_allegati_inserimento"  ON protocollo_contratti_allegati;
DROP POLICY IF EXISTS "contratti_allegati_eliminazione" ON protocollo_contratti_allegati;
CREATE POLICY "contratti_allegati_lettura"      ON protocollo_contratti_allegati FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "contratti_allegati_inserimento"  ON protocollo_contratti_allegati FOR INSERT WITH CHECK (protocollo_is_operatore());
CREATE POLICY "contratti_allegati_eliminazione" ON protocollo_contratti_allegati FOR DELETE USING (protocollo_is_operatore());

-- Storico: lettura per tutti i ruoli attivi; si scrive solo a proprio nome
DROP POLICY IF EXISTS "log_lettura"     ON protocollo_log_azioni;
DROP POLICY IF EXISTS "log_inserimento" ON protocollo_log_azioni;
CREATE POLICY "log_lettura"     ON protocollo_log_azioni FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "log_inserimento" ON protocollo_log_azioni FOR INSERT
  WITH CHECK (utente_id = auth.uid() AND protocollo_utente_attivo());

-- Archivio file
DROP POLICY IF EXISTS "protogal_allegati_lettura"      ON storage.objects;
DROP POLICY IF EXISTS "protogal_allegati_caricamento"  ON storage.objects;
DROP POLICY IF EXISTS "protogal_allegati_eliminazione" ON storage.objects;
CREATE POLICY "protogal_allegati_lettura" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'allegati-protocollo' AND public.protocollo_utente_attivo());
CREATE POLICY "protogal_allegati_caricamento" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'allegati-protocollo' AND public.protocollo_is_operatore());
CREATE POLICY "protogal_allegati_eliminazione" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'allegati-protocollo' AND public.protocollo_is_operatore());

-- Aggiorna la cache dello schema di PostgREST
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- VERIFICA: deve elencare le 9 tabelle del protocollo
-- ----------------------------------------------------------------
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'protocollo_%'
ORDER BY table_name;

-- ================================================================
-- PRIMO AMMINISTRATORE (dopo aver invitato l'utente da
-- Authentication → Users → Invite user). Sostituire UUID e nome:
--
-- INSERT INTO protocollo_profili (id, nome_completo, ruolo)
-- VALUES ('UUID-DELL-UTENTE', 'Nome Cognome', 'admin');
-- ================================================================
