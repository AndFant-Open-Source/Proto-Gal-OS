// SPDX-FileCopyrightText: 2023 shadcn
// SPDX-License-Identifier: MIT
// Componente derivato da shadcn/ui (https://ui.shadcn.com), licenza MIT: vedi LICENSES/MIT.txt
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[#003399] text-white hover:bg-[#002d87]',
        secondary: 'border-transparent bg-gray-100 text-gray-700 hover:bg-gray-200',
        destructive: 'border-transparent bg-red-100 text-red-700 hover:bg-red-200',
        outline: 'text-gray-700',
        ricevuto: 'border-blue-200 bg-blue-100 text-blue-800',
        in_lavorazione: 'border-yellow-200 bg-yellow-100 text-yellow-800',
        evaso: 'border-green-200 bg-green-100 text-green-800',
        archiviato: 'border-gray-200 bg-gray-100 text-gray-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
