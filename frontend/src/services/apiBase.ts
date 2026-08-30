/**
 * Base URL prefixed to every backend API call.
 *
 * - Dev / prod builds leave VITE_API_URL unset, so this resolves to '' and
 *   every call stays exactly the relative path it always was — Vite's dev
 *   proxy and the Express static server handle routing as before. No
 *   behaviour change for the app itself.
 * - Frontend integration tests set VITE_API_URL to the ephemeral port the
 *   real backend subprocess is listening on, since there's no dev server or
 *   same-origin document to resolve a relative path against in that context.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
