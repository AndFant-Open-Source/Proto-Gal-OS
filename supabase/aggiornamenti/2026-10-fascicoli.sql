-- SPDX-License-Identifier: AGPL-3.0-or-later
-- SPDX-FileCopyrightText: 2026 Andrea Fantini
-- Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
--
-- Aggiornamento ottobre 2026: titolario e fascicoli.
-- Da eseguire UNA volta nella SQL Editor dei progetti installati prima di questa versione,
-- DOPO 2026-10-importazione-backup.sql. Le nuove installazioni non ne hanno bisogno.
-- Solo aggiunte: non modifica né cancella protocolli, contratti, allegati o storico.

-- ----------------------------------------------------------------
-- 9. Titolario e fascicoli (F/0001/2026)
--    Un fascicolo raccoglie i documenti di una pratica: protocolli e contratti.
--    Collegare o scollegare un documento non modifica il documento.
-- ----------------------------------------------------------------

-- Voci di classificazione (es. 2 Bandi → 2.1 SRD07): gestite dall'amministratore
CREATE TABLE IF NOT EXISTS protocollo_titolario (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codice      text NOT NULL UNIQUE CHECK (codice ~ '^[0-9A-Za-z]+(\.[0-9A-Za-z]+)*$'),
  descrizione text NOT NULL CHECK (length(trim(descrizione)) > 0),
  padre_id    uuid REFERENCES protocollo_titolario(id) ON DELETE RESTRICT,
  attivo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protocollo_titolario_padre_check CHECK (padre_id IS NULL OR padre_id <> id)
);

DROP TRIGGER IF EXISTS trg_titolario_updated_at ON protocollo_titolario;
CREATE TRIGGER trg_titolario_updated_at
  BEFORE UPDATE ON protocollo_titolario
  FOR EACH ROW EXECUTE FUNCTION aggiorna_updated_at();

CREATE TABLE IF NOT EXISTS protocollo_fascicoli_sequenze (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anno          integer NOT NULL UNIQUE,
  ultimo_numero integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS protocollo_fascicoli (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              integer NOT NULL CHECK (numero > 0),
  anno                integer NOT NULL,
  -- F/0004/2026: almeno 4 cifre, senza troncare oltre 9999
  numero_completo     text GENERATED ALWAYS AS (
                        'F/' || lpad(numero::text, greatest(4, length(numero::text)), '0') || '/' || anno::text
                      ) STORED,
  oggetto             text NOT NULL CHECK (length(trim(oggetto)) > 0),
  titolario_id        uuid REFERENCES protocollo_titolario(id) ON DELETE RESTRICT,
  responsabile        text,
  ufficio             text,
  stato               text NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto', 'chiuso')),
  data_apertura       date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
  data_chiusura       date,
  -- Codice con cui la pratica è nota fuori dal protocollo (ID domanda, CUP, codice progetto)
  riferimento_esterno text,
  note                text,
  creato_da           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protocollo_fascicoli_anno_numero_key UNIQUE (anno, numero),
  CONSTRAINT protocollo_fascicoli_date_check CHECK (data_chiusura IS NULL OR data_chiusura >= data_apertura)
);
CREATE INDEX IF NOT EXISTS idx_fascicoli_anno ON protocollo_fascicoli (anno);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fascicoli_riferimento_esterno
  ON protocollo_fascicoli (lower(riferimento_esterno)) WHERE riferimento_esterno IS NOT NULL;

DROP TRIGGER IF EXISTS trg_fascicoli_updated_at ON protocollo_fascicoli;
CREATE TRIGGER trg_fascicoli_updated_at
  BEFORE UPDATE ON protocollo_fascicoli
  FOR EACH ROW EXECUTE FUNCTION aggiorna_updated_at();

-- Numero e anno dal server; chiusura e riapertura solo admin; fascicolo chiuso modificabile solo da admin
CREATE OR REPLACE FUNCTION fascicoli_proteggi_campi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR protocollo_importazione_in_corso() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.anno := extract(year FROM NEW.data_apertura)::int;
    NEW.creato_da := auth.uid();
    NEW.stato := 'aperto';
    NEW.data_chiusura := NULL;
    INSERT INTO protocollo_fascicoli_sequenze (anno, ultimo_numero)
      VALUES (NEW.anno, 1)
      ON CONFLICT (anno) DO UPDATE
        SET ultimo_numero = protocollo_fascicoli_sequenze.ultimo_numero + 1,
            updated_at    = now()
    RETURNING ultimo_numero INTO NEW.numero;
    RETURN NEW;
  END IF;

  NEW.numero := OLD.numero;
  NEW.anno := OLD.anno;
  NEW.creato_da := OLD.creato_da;
  NEW.created_at := OLD.created_at;

  IF OLD.stato = 'chiuso' AND NOT protocollo_is_admin() THEN
    RAISE EXCEPTION 'Il fascicolo % è chiuso: solo un amministratore può modificarlo', OLD.numero_completo
      USING ERRCODE = '42501';
  END IF;

  IF NEW.stato IS DISTINCT FROM OLD.stato THEN
    IF NOT protocollo_is_admin() THEN
      RAISE EXCEPTION 'Solo un amministratore può chiudere o riaprire un fascicolo' USING ERRCODE = '42501';
    END IF;
    IF NEW.stato = 'chiuso' THEN
      NEW.data_chiusura := coalesce(NEW.data_chiusura, (now() AT TIME ZONE 'Europe/Rome')::date);
    ELSE
      NEW.data_chiusura := NULL;
    END IF;
  END IF;

  IF extract(year FROM NEW.data_apertura)::int <> NEW.anno THEN
    RAISE EXCEPTION 'La data di apertura deve appartenere all''anno %', NEW.anno USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fascicoli_proteggi_campi ON protocollo_fascicoli;
CREATE TRIGGER trg_fascicoli_proteggi_campi
  BEFORE INSERT OR UPDATE ON protocollo_fascicoli
  FOR EACH ROW EXECUTE FUNCTION fascicoli_proteggi_campi();

-- Documenti del fascicolo: un protocollo OPPURE un contratto per riga
CREATE TABLE IF NOT EXISTS protocollo_fascicoli_documenti (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: un fascicolo con documenti non si può eliminare
  fascicolo_id  uuid NOT NULL REFERENCES protocollo_fascicoli(id) ON DELETE RESTRICT,
  protocollo_id uuid REFERENCES protocollo_registro(id) ON DELETE CASCADE,
  contratto_id  uuid REFERENCES protocollo_contratti(id) ON DELETE CASCADE,
  inserito_da   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protocollo_fascicoli_documenti_uno_check CHECK (num_nonnulls(protocollo_id, contratto_id) = 1),
  CONSTRAINT protocollo_fascicoli_documenti_protocollo_key UNIQUE (fascicolo_id, protocollo_id),
  CONSTRAINT protocollo_fascicoli_documenti_contratto_key UNIQUE (fascicolo_id, contratto_id)
);
CREATE INDEX IF NOT EXISTS idx_fascicoli_documenti_protocollo ON protocollo_fascicoli_documenti (protocollo_id);
CREATE INDEX IF NOT EXISTS idx_fascicoli_documenti_contratto  ON protocollo_fascicoli_documenti (contratto_id);

CREATE OR REPLACE FUNCTION fascicoli_documenti_autore()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT protocollo_importazione_in_corso() THEN
    NEW.inserito_da := auth.uid();
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fascicoli_documenti_autore ON protocollo_fascicoli_documenti;
CREATE TRIGGER trg_fascicoli_documenti_autore
  BEFORE INSERT ON protocollo_fascicoli_documenti
  FOR EACH ROW EXECUTE FUNCTION fascicoli_documenti_autore();

-- Storico: le operazioni sui fascicoli si registrano nel database, non dal browser
ALTER TABLE protocollo_log_azioni
  ADD COLUMN IF NOT EXISTS fascicolo_id uuid REFERENCES protocollo_fascicoli(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_log_fascicolo ON protocollo_log_azioni (fascicolo_id);

CREATE OR REPLACE FUNCTION fascicoli_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_azione   text;
  v_modifiche jsonb := '{}'::jsonb;
  v_campo    text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_azione := 'FASCICOLO_CREAZIONE';
    v_modifiche := jsonb_build_object('oggetto', NEW.oggetto);
  ELSIF NEW.stato IS DISTINCT FROM OLD.stato THEN
    v_azione := CASE NEW.stato WHEN 'chiuso' THEN 'FASCICOLO_CHIUSURA' ELSE 'FASCICOLO_RIAPERTURA' END;
  ELSE
    v_azione := 'FASCICOLO_MODIFICA';
    FOREACH v_campo IN ARRAY ARRAY['oggetto', 'titolario_id', 'responsabile', 'ufficio',
                                   'data_apertura', 'riferimento_esterno', 'note'] LOOP
      IF to_jsonb(NEW) -> v_campo IS DISTINCT FROM to_jsonb(OLD) -> v_campo THEN
        v_modifiche := v_modifiche || jsonb_build_object(v_campo, to_jsonb(NEW) -> v_campo);
      END IF;
    END LOOP;
    IF v_modifiche = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO protocollo_log_azioni (fascicolo_id, utente_id, azione, dettaglio)
  VALUES (NEW.id, (SELECT id FROM protocollo_profili WHERE id = auth.uid()), v_azione,
          nullif(v_modifiche, '{}'::jsonb));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fascicoli_log ON protocollo_fascicoli;
CREATE TRIGGER trg_fascicoli_log
  AFTER INSERT OR UPDATE ON protocollo_fascicoli
  FOR EACH ROW EXECUTE FUNCTION fascicoli_log();

DROP TRIGGER IF EXISTS trg_fascicoli_log_eliminazione ON protocollo_fascicoli;
CREATE TRIGGER trg_fascicoli_log_eliminazione
  AFTER DELETE ON protocollo_fascicoli
  FOR EACH ROW EXECUTE FUNCTION protocollo_log_eliminazione();

-- Collegamento e scollegamento: visibili nello storico del documento e del fascicolo
CREATE OR REPLACE FUNCTION fascicoli_documenti_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_riga       protocollo_fascicoli_documenti;
  v_fascicolo  text;
BEGIN
  v_riga := CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  SELECT numero_completo INTO v_fascicolo FROM protocollo_fascicoli WHERE id = v_riga.fascicolo_id;

  INSERT INTO protocollo_log_azioni (protocollo_id, contratto_id, fascicolo_id, utente_id, azione, dettaglio)
  VALUES (
    -- Se il documento è in eliminazione (cascata) il riferimento resta solo nel dettaglio
    (SELECT id FROM protocollo_registro WHERE id = v_riga.protocollo_id),
    (SELECT id FROM protocollo_contratti WHERE id = v_riga.contratto_id),
    v_riga.fascicolo_id,
    (SELECT id FROM protocollo_profili WHERE id = auth.uid()),
    CASE TG_OP WHEN 'DELETE' THEN 'FASCICOLO_SCOLLEGA' ELSE 'FASCICOLO_COLLEGA' END,
    jsonb_build_object('fascicolo', v_fascicolo)
  );
  RETURN v_riga;
END;
$$;

DROP TRIGGER IF EXISTS trg_fascicoli_documenti_log ON protocollo_fascicoli_documenti;
CREATE TRIGGER trg_fascicoli_documenti_log
  AFTER INSERT OR DELETE ON protocollo_fascicoli_documenti
  FOR EACH ROW EXECUTE FUNCTION fascicoli_documenti_log();

-- Accessi: tutti i profili attivi leggono; operatori creano e collegano; admin chiude,
-- elimina e gestisce il titolario. Nei fascicoli chiusi non si collega né scollega.
ALTER TABLE protocollo_titolario            ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_fascicoli_sequenze   ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_fascicoli            ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_fascicoli_documenti  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "titolario_lettura" ON protocollo_titolario;
DROP POLICY IF EXISTS "titolario_admin"   ON protocollo_titolario;
CREATE POLICY "titolario_lettura" ON protocollo_titolario FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "titolario_admin"   ON protocollo_titolario FOR ALL
  USING (protocollo_is_admin()) WITH CHECK (protocollo_is_admin());

DROP POLICY IF EXISTS "fascicoli_seq_lettura" ON protocollo_fascicoli_sequenze;
DROP POLICY IF EXISTS "fascicoli_seq_admin"   ON protocollo_fascicoli_sequenze;
CREATE POLICY "fascicoli_seq_lettura" ON protocollo_fascicoli_sequenze FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "fascicoli_seq_admin"   ON protocollo_fascicoli_sequenze FOR ALL
  USING (protocollo_is_admin()) WITH CHECK (protocollo_is_admin());

DROP POLICY IF EXISTS "fascicoli_lettura"      ON protocollo_fascicoli;
DROP POLICY IF EXISTS "fascicoli_inserimento"  ON protocollo_fascicoli;
DROP POLICY IF EXISTS "fascicoli_modifica"     ON protocollo_fascicoli;
DROP POLICY IF EXISTS "fascicoli_eliminazione" ON protocollo_fascicoli;
CREATE POLICY "fascicoli_lettura"      ON protocollo_fascicoli FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "fascicoli_inserimento"  ON protocollo_fascicoli FOR INSERT WITH CHECK (protocollo_is_operatore());
CREATE POLICY "fascicoli_modifica"     ON protocollo_fascicoli FOR UPDATE
  USING (protocollo_is_operatore()) WITH CHECK (protocollo_is_operatore());
CREATE POLICY "fascicoli_eliminazione" ON protocollo_fascicoli FOR DELETE USING (protocollo_is_admin());

DROP POLICY IF EXISTS "fascicoli_documenti_lettura"      ON protocollo_fascicoli_documenti;
DROP POLICY IF EXISTS "fascicoli_documenti_inserimento"  ON protocollo_fascicoli_documenti;
DROP POLICY IF EXISTS "fascicoli_documenti_eliminazione" ON protocollo_fascicoli_documenti;
CREATE POLICY "fascicoli_documenti_lettura" ON protocollo_fascicoli_documenti
  FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "fascicoli_documenti_inserimento" ON protocollo_fascicoli_documenti
  FOR INSERT WITH CHECK (
    protocollo_is_operatore()
    AND EXISTS (SELECT 1 FROM protocollo_fascicoli f WHERE f.id = fascicolo_id AND f.stato = 'aperto')
  );
CREATE POLICY "fascicoli_documenti_eliminazione" ON protocollo_fascicoli_documenti
  FOR DELETE USING (
    protocollo_is_operatore()
    AND EXISTS (SELECT 1 FROM protocollo_fascicoli f WHERE f.id = fascicolo_id AND f.stato = 'aperto')
  );

-- Storico: riferimento al numero del fascicolo ed eliminazione dei fascicoli
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
  ELSIF NEW.fascicolo_id IS NOT NULL THEN
    SELECT numero_completo INTO NEW.numero_completo_rif
      FROM protocollo_fascicoli WHERE id = NEW.fascicolo_id;
  END IF;
  RETURN NEW;
END;
$$;

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
    CASE TG_TABLE_NAME
      WHEN 'protocollo_contratti' THEN 'ELIMINAZIONE_CONTRATTO'
      WHEN 'protocollo_fascicoli' THEN 'ELIMINAZIONE_FASCICOLO'
      ELSE 'ELIMINAZIONE'
    END,
    jsonb_build_object('numero_completo', OLD.numero_completo, 'oggetto', OLD.oggetto),
    OLD.numero_completo
  );
  RETURN OLD;
END;
$$;

NOTIFY pgrst, 'reload schema';
