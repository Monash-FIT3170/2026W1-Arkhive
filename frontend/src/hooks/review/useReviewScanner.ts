import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ExtractedPage } from '../../models/TableData';
import type { PageReview, ReviewsByPage } from '../../models/IssueReview';
import { requestFormatDetection } from '../../services/llmService';
import { scanPage, type DetectFormats } from '../../utils/review/scan';

interface UseReviewScannerOptions {
  pageKeys: readonly string[];
  reviews: ReviewsByPage;
  /** Always-current pages; read at scan time so we never scan a stale snapshot. */
  pagesRef: RefObject<ExtractedPage[]>;
  putReview: (pageKey: string, review: PageReview) => void;
  /** Injectable for tests. */
  detectFormats?: DetectFormats;
  /** Fires when a scan produces at least one issue (not for hydrated reviews). */
  onIssuesDetected?: (review: PageReview) => void;
}

/**
 * Scans any page that has no review yet (never scanned, and not hydrated from
 * storage), and exposes `rescanPage` for the user to force a fresh scan.
 *
 * A page is only auto-scanned once per session: if its scan throws, it's
 * remembered as failed so we don't hammer the LLM in a retry loop. Manual
 * rescan always works.
 */
export function useReviewScanner({
  pageKeys,
  reviews,
  pagesRef,
  putReview,
  detectFormats = requestFormatDetection,
  onIssuesDetected,
}: UseReviewScannerOptions) {
  const [scanningPageKeys, setScanningPageKeys] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const failed = useRef(new Set<string>());

  const pageKeysRef = useRef(pageKeys);
  const onIssuesRef = useRef(onIssuesDetected);
  useEffect(() => {
    pageKeysRef.current = pageKeys;
    onIssuesRef.current = onIssuesDetected;
  });

  const setScanning = useCallback((key: string, on: boolean) => {
    setScanningPageKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const scanKeys = useCallback(
    async (keys: readonly string[]) => {
      for (const key of keys) {
        if (inFlight.current.has(key)) continue;
        const page = pagesRef.current[pageKeysRef.current.indexOf(key)];
        if (!page) continue;

        inFlight.current.add(key);
        setScanning(key, true);
        try {
          const review = await scanPage(page, key, detectFormats);
          putReview(key, review);
          if (review.issues.length > 0) onIssuesRef.current?.(review);
        } catch (error) {
          failed.current.add(key);
          console.error(`Review scan failed for page ${key}`, error);
        } finally {
          inFlight.current.delete(key);
          setScanning(key, false);
        }
      }
    },
    [pagesRef, putReview, detectFormats, setScanning]
  );

  // Auto-scan: anything without a review that isn't already being handled.
  useEffect(() => {
    const pending = pageKeys.filter(
      (key) => reviews[key] === undefined && !inFlight.current.has(key) && !failed.current.has(key)
    );
    if (pending.length > 0) void scanKeys(pending);
  }, [pageKeys, reviews, scanKeys]);

  /** Discards the page's review (including resolutions) and scans it again. */
  const rescanPage = useCallback(
    (pageKey: string) => {
      failed.current.delete(pageKey);
      return scanKeys([pageKey]);
    },
    [scanKeys]
  );

  return { scanningPageKeys, rescanPage };
}
