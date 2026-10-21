// Small helpers for the plugins' `lower`: reading the arguments, flags and properties of a node.
import type { KNode, KValue, LowerCtx } from './types.ts';

export const str = (v: KValue | undefined): string | undefined => (v === undefined || v === null ? undefined : String(v));

/** the properties as strings, without `skip` */
export const strs = (p: Record<string, KValue>, skip: string[] = []): Record<string, string> =>
  Object.fromEntries(Object.entries(p).filter(([k]) => !skip.includes(k)).map(([k, v]) => [k, String(v)]));

/** the bare words among the arguments from `from` on */
export const flagsOf = (n: KNode, from = 0): Set<string> => new Set(n.args.slice(from).filter((a) => typeof a === 'string').map(String));

/** the text of a node (its first argument): an error when there is none */
export function textArg(n: KNode, ctx: LowerCtx, what = 'a text'): string {
  const t = n.args[0];
  if (t === undefined || t === null) return ctx.fail(n, `\`${n.name}\` needs ${what}: ${n.name} "…"`);
  return String(t);
}

/** the properties every part of a layout takes, as the props of an element */
export function layoutProps(n: KNode): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of ['size', 'gap', 'class', 'align', 'valign']) if (n.props[k] !== undefined) o[k] = String(n.props[k]);
  return o;
}

export const truthy = (v: unknown) => v === true || /^(true|yes|on|1)$/i.test(String(v ?? ''));
