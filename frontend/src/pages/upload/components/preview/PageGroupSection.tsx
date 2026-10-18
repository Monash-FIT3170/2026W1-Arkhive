// Shared "one labeled box per file/document" section — used by UploadPage
// and ProjectWorkspacePage's Files view to lay out a group of PreviewCards.

import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';

type Props = {
  label: string;
  children: ReactNode;
};

export default function PageGroupSection({ label, children }: Props) {
  return (
    <section className="rounded-lg border border-base-300 bg-base-200/40 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-base-content/70">
        <FileText className="w-4 h-4" />
        {label}
      </h3>
      <div className="flex flex-wrap gap-4">{children}</div>
    </section>
  );
}
