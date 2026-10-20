// "Single file" mode: the CLI embeds the deck files in window.__SLIDES_FILES__ as data: URIs
// (path relative to the page -> URI). Outside that mode fileUrl() returns the URL unchanged.
const embedded = (globalThis as { __SLIDES_FILES__?: Record<string, string> }).__SLIDES_FILES__;

export function fileUrl(url: string): string {
  if (!embedded) return url;
  const abs = new URL(url, document.baseURI).href;
  const dir = new URL('./', document.baseURI).href;
  if (!abs.startsWith(dir)) return url;
  const rel = decodeURIComponent(abs.slice(dir.length).replace(/[?#].*$/, ''));
  // once the chunk is inlined, `import.meta.url` is the page itself, not assets/
  return embedded[rel] ?? embedded[`assets/${rel}`] ?? url;
}

/** a failure to load something the viewer needs: `message` says what and where, `hint` what to try */
export class LoadError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.hint = hint;
  }
}

/** fetch a file of the deck, or say precisely why not (the server's status, or that it is not even reachable) */
export async function fetchFile(url: string, what: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new LoadError(`Could not reach ${url} (${what}).`, `Is the server still running? (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!res.ok) throw new LoadError(`${what}: ${url} answered ${res.status} ${res.statusText}.`, res.status === 404 ? 'The file does not exist there: check the name of the deck in the address (?deck=…).' : undefined);
  return res;
}

export async function fetchJson<T>(url: string, what: string): Promise<T> {
  const text = await (await fetchFile(url, what)).text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const page = /^\s*</.test(text);
    throw new LoadError(
      `${what}: ${url} is not JSON; it starts with ${JSON.stringify(text.slice(0, 40))}.`,
      page ? 'The server sent a web page instead of the file: the file is missing there, or the deck name in the address (?deck=…) is wrong.' : undefined,
    );
  }
}
