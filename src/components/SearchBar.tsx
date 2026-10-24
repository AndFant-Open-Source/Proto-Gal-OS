// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Cerca...' }: SearchBarProps) {
  const [interno, setInterno] = useState(value);

  useEffect(() => {
    setInterno(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (interno !== value) onChange(interno);
    }, 400);
    return () => clearTimeout(timer);
  }, [interno, onChange, value]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        className="pl-9 pr-9"
        placeholder={placeholder}
        value={interno}
        onChange={(e) => setInterno(e.target.value)}
      />
      {interno && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          onClick={() => { setInterno(''); onChange(''); }}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
