// The .slides syntax is KDL v2 (https://kdl.dev). This wraps the parser into plain objects, so nothing else depends on its API:
// a node has a name, positional arguments, `key=value` properties and children, and the line it starts on. A bare word
// (`loop`) is a string argument: that is how flags are written.
import { getLocation, parse } from '@bgotink/kdl';

export type KValue = string | number | boolean | null;

export interface KNode {
  name: string;
  args: KValue[];
  props: Record<string, KValue>;
  children: KNode[];
  /** 1-based; `endLine` is the line of the closing brace (or the node's own line) */
  line: number;
  col: number;
  endLine: number;
}

export class KdlError extends Error {
  line: number;
  col: number;
  constructor(message: string, line: number, col = 1) {
    super(`line ${line}: ${message}`);
    this.line = line;
    this.col = col;
  }
}

export function parseKdl(src: string): KNode[] {
  let doc;
  try {
    doc = parse(src, { as: 'document', storeLocations: true });
  } catch (e) {
    const err = e as Error & { start?: { line: number; column: number } };
    throw new KdlError(err.message.replace(/ at \d+:\d+.*$/s, ''), err.start?.line ?? 1, err.start?.column ?? 1);
  }
  const conv = (n: (typeof doc.nodes)[number]): KNode => {
    const at = getLocation(n);
    const loc = at?.start;
    return {
      name: n.getName(),
      args: n.getArguments() as KValue[],
      props: Object.fromEntries([...n.getProperties()].map(([k, v]) => [k, v as KValue])),
      children: (n.children?.nodes ?? []).map(conv),
      line: loc?.line ?? 1,
      col: loc?.column ?? 1,
      endLine: at?.end.line ?? loc?.line ?? 1,
    };
  };
  return doc.nodes.map(conv);
}

/** the first argument that is a string: the text of a node like `text "…"` */
export const str = (v: KValue | undefined): string | undefined => (v === undefined || v === null ? undefined : String(v));
