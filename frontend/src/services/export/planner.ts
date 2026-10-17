import type { ExtractedPage } from '../../models/TableData';
import { buildZip, textEncode } from './zip';
import { getTemplate, type ExportTemplate } from './templates';
import type { ExportOptions, ExportUnit } from './model';

/**
 * Planning and delivery.
 *
 *   planExport()  -> PlannedFile[]   cheap and pure: names + which unit/template. plan.length is the exact file count.
 *   renderPlan()  -> ExportFile[]    runs each template's pure render()
 *   deliver()     -> 1 file: download it. 2+ files: bundle into ONE zip and download that.
 */

export type MergeStrategy = 'single' | 'per-file' | 'per-page';

// Structural subset of ValidationFileGroup, so the planner doesn't depend on utils/fileGrouping.
export interface PlannerPage {
  globalIndex: number;
  pageIndexInFile: number;
  extractedPage: ExtractedPage;
}
export interface PlannerFileGroup {
  fileId: string;
  fileName: string;
  pages: PlannerPage[];
}

export interface PlanInput {
  fileGroups: PlannerFileGroup[];
  selectedPages: Set<number>;
  strategy: MergeStrategy;
  templateIds: string[];
  baseName: string;
  /** User renames from the modal, keyed by fileId. */
  fileNames?: Record<string, string>;
}

export interface PlannedFile {
  filename: string;
  template: ExportTemplate;
  unit: ExportUnit;
}

export interface ExportFile {
  filename: string;
  mime: string;
  content: string | Uint8Array;
}

// ───────────── Naming ─────────────

export function cleanName(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uniqueName(filename: string, used: Set<string>): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  let candidate = filename;
  let n = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${stem} (${n++})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

// ───────────── Plan ─────────────

function buildUnits({
  fileGroups,
  selectedPages,
  strategy,
  baseName,
  fileNames = {},
}: PlanInput): ExportUnit[] {
  const base = baseName.trim() || 'export';
  const displayName = (g: PlannerFileGroup) => fileNames[g.fileId] || g.fileName;
  const toUnitPages = (g: PlannerFileGroup) =>
    g.pages
      .filter((p) => selectedPages.has(p.globalIndex))
      .map((p) => ({
        source: displayName(g),
        pageNumber: p.pageIndexInFile + 1,
        page: p.extractedPage,
      }));

  if (strategy === 'single') {
    const pages = fileGroups.flatMap(toUnitPages);
    return pages.length > 0 ? [{ name: base, pages }] : [];
  }

  if (strategy === 'per-file') {
    return fileGroups
      .map((g) => ({ name: `${base}_${cleanName(displayName(g))}`, pages: toUnitPages(g) }))
      .filter((u) => u.pages.length > 0);
  }

  return fileGroups.flatMap((g) =>
    toUnitPages(g).map((up) => ({
      name: `${base}_${cleanName(displayName(g))}_Page${up.pageNumber}`,
      pages: [up],
    }))
  );
}

export function planExport(input: PlanInput): PlannedFile[] {
  const templates = input.templateIds
    .map(getTemplate)
    .filter((t): t is ExportTemplate => t !== undefined);

  const used = new Set<string>();
  const plan: PlannedFile[] = [];
  for (const unit of buildUnits(input)) {
    for (const template of templates) {
      const filename = uniqueName(
        `${unit.name}_${template.fileSuffix}.${template.extension}`,
        used
      );
      plan.push({ filename, template, unit });
    }
  }
  return plan;
}

// ───────────── Render + deliver ─────────────

export function renderPlan(plan: PlannedFile[], opts: ExportOptions): ExportFile[] {
  return plan.map(({ filename, template, unit }) => ({
    filename,
    mime: template.mime,
    content: template.render(unit, opts),
  }));
}

const toBytes = (c: string | Uint8Array): Uint8Array => (typeof c === 'string' ? textEncode(c) : c);

/** Pure: one file stays as it is; several become a single zip. */
export function toDeliverable(files: ExportFile[], zipName = 'export.zip'): ExportFile {
  if (files.length === 0) throw new Error('There is nothing to export.');
  if (files.length === 1) return files[0];
  return {
    filename: zipName.toLowerCase().endsWith('.zip') ? zipName : `${zipName}.zip`,
    mime: 'application/zip',
    content: buildZip(files.map((f) => ({ name: f.filename, data: toBytes(f.content) }))),
  };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** The only place in the export stack that touches the DOM. */
export function deliver(files: ExportFile[], zipName = 'export.zip'): void {
  const file = toDeliverable(files, zipName);
  const part = typeof file.content === 'string' ? file.content : (file.content as BlobPart);
  triggerDownload(new Blob([part], { type: file.mime }), file.filename);
}
