// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Canale, StatoProtocollo, TipoFlusso, TipoContratto, FormaStipula, StatoContratto } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatData(dateStr: string | undefined, includeTime = false): string {
  if (!dateStr) return '—';
  try {
    const date = parseISO(dateStr);
    return format(date, includeTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy', { locale: it });
  } catch {
    return dateStr;
  }
}

/**
 * Data/ora da inviare al database con il fuso locale esplicito (es. 2026-10-12T00:00:00+02:00).
 * Con toISOString() (UTC) il 12 ottobre a mezzanotte diventa "2026-10-11T22:00Z": se la colonna
 * non è timestamptz il database scarta il fuso e salva l'11 ottobre.
 */
export function dataConFusoLocale(data: Date): string {
  return format(data, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const LABEL_STATO: Record<StatoProtocollo, string> = {
  ricevuto: 'Ricevuto',
  in_lavorazione: 'In lavorazione',
  evaso: 'Evaso',
  archiviato: 'Archiviato',
  annullato: 'Annullato',
};

export const LABEL_CANALE: Record<Canale, string> = {
  pec: 'PEC',
  email: 'Email',
  cartaceo: 'Cartaceo',
  digitale: 'Digitale',
};

export const LABEL_FLUSSO: Record<TipoFlusso, string> = {
  arrivo: 'Arrivo',
  partenza: 'Partenza',
};

export const LABEL_TIPO_CONTRATTO: Record<TipoContratto, string> = {
  lavori: 'Lavori',
  servizi: 'Servizi',
  forniture: 'Forniture',
  incarico_professionale: 'Incarico professionale',
  convenzione: 'Convenzione / Accordo',
  altro: 'Altro',
};

export const LABEL_FORMA_STIPULA: Record<FormaStipula, string> = {
  scrittura_privata: 'Scrittura privata',
  scrittura_privata_autenticata: 'Scrittura privata autenticata',
  atto_pubblico_amministrativo: 'Atto pubblico amministrativo',
  corrispondenza_commerciale: 'Corrispondenza commerciale',
  altro: 'Altro',
};

export const LABEL_STATO_CONTRATTO: Record<StatoContratto, string> = {
  in_corso: 'In corso',
  concluso: 'Concluso',
  risolto: 'Risolto',
  annullato: 'Annullato',
};

export const COLORE_STATO_CONTRATTO: Record<StatoContratto, string> = {
  in_corso: 'bg-blue-100 text-blue-800 border-blue-200',
  concluso: 'bg-green-100 text-green-800 border-green-200',
  risolto: 'bg-amber-100 text-amber-800 border-amber-200',
  annullato: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function formatImporto(importo: number | null | undefined): string {
  if (importo === null || importo === undefined) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(importo);
}

/** Nome file utilizzabile come chiave di Supabase Storage (niente accenti/simboli) */
export function nomeFileSicuro(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_');
}

/** MIME dedotto dall'estensione, se il browser non lo fornisce */
export function tipoMimeFile(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const MIME_FALLBACK: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png',
    tif: 'image/tiff', tiff: 'image/tiff',
    eml: 'message/rfc822',
    msg: 'application/vnd.ms-outlook',
    p7m: 'application/pkcs7-mime',
  };
  return file.type || (ext ? (MIME_FALLBACK[ext] ?? '') : '');
}

export const COLORE_STATO: Record<StatoProtocollo, string> = {
  ricevuto: 'bg-blue-100 text-blue-800 border-blue-200',
  in_lavorazione: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  evaso: 'bg-green-100 text-green-800 border-green-200',
  archiviato: 'bg-gray-100 text-gray-700 border-gray-200',
  annullato: 'bg-red-50 text-red-700 border-red-200 line-through',
};

export const MESI_IT = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
];

const UFFICI_PREDEFINITI = [
  'Direzione',
  'Amministrazione',
  'Segreteria',
  'Programmazione e Sviluppo',
  'Comunicazione',
  'Contabilità',
  'Risorse Umane',
  'Legale',
];

/**
 * Uffici dell'ente, configurabili senza modificare il codice (riuso da parte di altre PA):
 * VITE_UFFICI=Direzione;Segreteria;Ufficio tecnico
 */
export const UFFICI: string[] = (() => {
  const configurati = (import.meta.env.VITE_UFFICI ?? '')
    .split(';')
    .map((u: string) => u.trim())
    .filter(Boolean);
  return configurati.length > 0 ? configurati : UFFICI_PREDEFINITI;
})();

export const FORMATI_ALLEGATI_ACCETTATI = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/tiff': ['.tif', '.tiff'],
  'message/rfc822': ['.eml'],
  'application/vnd.ms-outlook': ['.msg'],
  'application/pkcs7-mime': ['.p7m'],
};

export const DIMENSIONE_MAX_ALLEGATO = 50 * 1024 * 1024; // 50 MB, come il limite dell'archivio
