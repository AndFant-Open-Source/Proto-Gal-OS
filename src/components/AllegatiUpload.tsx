// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { UploadCloud, X, File as FileIcon, AlertCircle } from 'lucide-react';
import { FORMATI_ALLEGATI_ACCETTATI, DIMENSIONE_MAX_ALLEGATO, formatBytes, cn } from '@/lib/utils';

interface AllegatiUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

function chiaveFile(f: File): string {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

export function AllegatiUpload({ files, onChange, disabled }: AllegatiUploadProps) {
  const [errori, setErrori] = useState<string[]>([]);

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      const nuoviErrori: string[] = [];
      rejected.forEach(({ file, errors }) => {
        errors.forEach((e) => {
          if (e.code === 'file-too-large')
            nuoviErrori.push(`${file.name}: supera i 50 MB`);
          else if (e.code === 'file-invalid-type')
            nuoviErrori.push(`${file.name}: formato non supportato`);
          else nuoviErrori.push(`${file.name}: ${e.message}`);
        });
      });
      // Evita di aggiungere due volte lo stesso file
      const nuovi = accepted.filter((f) => !files.some((g) => chiaveFile(g) === chiaveFile(f)));
      setErrori(nuoviErrori);
      onChange([...files, ...nuovi]);
    },
    [files, onChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: FORMATI_ALLEGATI_ACCETTATI,
    maxSize: DIMENSIONE_MAX_ALLEGATO,
    disabled,
  });

  const rimuovi = (file: File) => {
    onChange(files.filter((f) => chiaveFile(f) !== chiaveFile(file)));
    setErrori([]);
  };

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          'cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          isDragActive
            ? 'border-[#003399] bg-blue-50'
            : 'border-gray-300 hover:border-[#003399] hover:bg-gray-50',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        {/* Azzerare il valore all'apertura permette di riselezionare lo stesso file
            dopo averlo rimosso (altrimenti il browser non emette l'evento change) */}
        <input
          {...getInputProps({
            onClick: (e) => { (e.target as HTMLInputElement).value = ''; },
          })}
        />
        <UploadCloud className="mx-auto mb-2 h-8 w-8 text-gray-400" />
        <p className="text-sm text-gray-600">
          {isDragActive
            ? 'Rilascia i file qui...'
            : 'Trascina i file qui oppure clicca per selezionarli'}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          PDF, P7M, DOC, DOCX, XLS, XLSX, JPG, PNG, TIF, EML, MSG — max 50 MB per file
        </p>
      </div>

      {errori.length > 0 && (
        <div className="rounded-md bg-red-50 p-3">
          {errori.map((err, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {err}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={chiaveFile(file)}
              className="flex items-center gap-3 rounded-md border bg-gray-50 px-3 py-2 text-sm"
            >
              <FileIcon className="h-4 w-4 flex-shrink-0 text-gray-500" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-xs text-gray-400">{formatBytes(file.size)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => rimuovi(file)}
                  className="text-gray-400 hover:text-red-500"
                  title="Rimuovi file"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
