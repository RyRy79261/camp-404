// The request header apps/web/proxy.ts sets on every page request: the path
// and query the visitor asked for. A plain module with no imports, because the
// proxy (which runs outside React's server environment, where `server-only`
// throws) and the server gates (lib/sign-in-redirect.ts) both read it.
export const CAMP_PATH_HEADER = "x-camp-path";

/**
 * The value the proxy writes: the pathname and the query, without the
 * router's own `_rsc` cache-buster, which is not part of the page's address.
 */
export function campPathOf(url: { pathname: string; search: string }): string {
  const params = new URLSearchParams(url.search);
  params.delete("_rsc");
  const query = params.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}
