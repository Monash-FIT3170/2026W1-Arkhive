import { useState } from 'react';
import { getProject } from '../services/projectService';
import { getDownloadUrl } from '../services/documentService';
import type { Project, ProjectDetail } from '../models/Project';

export type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; detail: ProjectDetail; thumbnailUrl: string | null };

export function pageCount(detail: ProjectDetail): number {
  return detail.documents.reduce((sum, doc) => sum + (doc.pages?.length ?? 0), 0);
}

/**
 * Which project cards are expanded, and the lazily-fetched preview data for
 * each. A project's detail (and thumbnail) is only ever fetched the first
 * time its card is expanded, and is cached here for the rest of the page's
 * lifetime so re-toggling never re-fetches.
 */
export function useProjectPreview() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});

  async function toggleExpand(project: Project) {
    const isOpen = expandedIds.has(project.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(project.id);
      else next.add(project.id);
      return next;
    });

    if (isOpen || previews[project.id]) return;

    setPreviews((prev) => ({ ...prev, [project.id]: { status: 'loading' } }));
    try {
      const detail = await getProject(project.id);

      let thumbnailUrl: string | null = null;
      const firstDoc = detail.documents[0];
      const firstPage = firstDoc?.pages?.slice().sort((a, b) => a.page_index - b.page_index)[0];
      if (firstDoc && firstPage) {
        try {
          thumbnailUrl = await getDownloadUrl(firstDoc.id, firstPage.page_index);
        } catch {
          // Thumbnail is a nice-to-have — a missing image shouldn't block the preview.
        }
      }

      setPreviews((prev) => ({ ...prev, [project.id]: { status: 'ready', detail, thumbnailUrl } }));
    } catch (err) {
      setPreviews((prev) => ({
        ...prev,
        [project.id]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load preview.',
        },
      }));
    }
  }

  return {
    isExpanded: (id: string) => expandedIds.has(id),
    getPreview: (id: string) => previews[id],
    toggleExpand,
  };
}
