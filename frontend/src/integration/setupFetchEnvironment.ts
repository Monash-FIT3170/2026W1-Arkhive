import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

// Plain Node environment means fetch, Blob, and FormData are already
// one consistent native implementation -- nothing to reconcile. The
// only thing genuinely missing is a cookie jar, since Node's fetch has
// no browser-style cookie store of its own.
const jar = new CookieJar();
globalThis.fetch = fetchCookie(globalThis.fetch, jar) as typeof globalThis.fetch;