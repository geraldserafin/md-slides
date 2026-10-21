// The compiler: sources -> Program. Every top-level node is handled by the plugin that defines it (`plugin`, `deck`, `layout`,
// `slide`...), in phases: plugins first, then the deck and the layouts, then the slides; then the passes of the plugins run over
// the result. The compiler itself knows no node but the order they are handled in.
import { KdlError, parseKdl } from './kdl.ts';
import { closest } from './closest.ts';
import { CompileError, createLowerCtx } from './lower.ts';
import type { DeckMeta, KNode, Program, Registry, Slide, TopCtx } from './types.ts';

export interface SourceFile {
  url: string;
  text: string;
  /** shown in errors: `talk/talk.slides` */
  name?: string;
}

export interface Compiled {
  program: Program;
  /** the registry of this build: the one given, plus what the sources declared (own layouts, plugins written in the language) */
  registry: Registry;
}

export function parseSource(f: SourceFile): KNode[] {
  try {
    return parseKdl(f.text);
  } catch (e) {
    if (e instanceof KdlError) throw new CompileError(e.message.replace(/^line \d+: /, ''), e.line, e.col, f.name);
    throw e;
  }
}

export interface ParsedFile {
  f: SourceFile;
  nodes: KNode[];
}

/**
 * Read the top-level nodes in their phases: plugins first, then the deck and the layouts, then the slides. `only` limits it to the
 * declarations (what `slides check` needs to know before it looks at a slide).
 */
export function run(asts: ParsedFile[], registry: Registry, meta: DeckMeta, slides: Slide[], upTo: 1 | 2 = 2) {
  const phases: (0 | 1 | 2)[] = upTo === 1 ? [0, 1] : [0, 1, 2];
  for (const phase of phases) {
    for (const { f, nodes } of asts) {
      for (const node of nodes) {
        const def = registry.node(node.name);
        if (!def?.top) {
          const tops = registry.topNodes();
          const hint = closest(node.name, tops);
          throw new CompileError(`unknown node \`${node.name}\` at the top (a file holds ${tops.map((t) => `\`${t}\``).join(', ')})${hint ? `; did you mean \`${hint}\`?` : ''}`, node.line, node.col, f.name);
        }
        if (def.top.phase !== phase) continue;
        const ctx: TopCtx = {
          registry, meta, slides, url: f.url,
          get index() { return slides.length; },
          fail(n, message) { throw new CompileError(message, n.line, n.col, f.name); },
          lowerCtx() {
            const c = createLowerCtx(registry, f.url, slides.length);
            // errors of lowering carry the file
            const fail = c.fail;
            c.fail = (n, message) => { try { return fail(n, message); } catch (e) { if (e instanceof CompileError) throw new CompileError(message, e.line, e.col, f.name); throw e; } };
            return c;
          },
        };
        try {
          def.top.compile(node, ctx);
        } catch (e) {
          if (e instanceof CompileError && !e.file && f.name) throw new CompileError(e.message.replace(/^line \d+: /, ''), e.line, e.col, f.name);
          throw e;
        }
      }
    }
  }
}

export function compile(files: SourceFile[], base: Registry, opts: { name: string; meta?: Partial<DeckMeta> }): Compiled {
  const registry = base.fork();
  const meta: DeckMeta = { files: files.map((f) => f.name ?? f.url), ...opts.meta };
  const slides: Slide[] = [];
  run(files.map((f) => ({ f, nodes: parseSource(f) })), registry, meta, slides);

  for (const s of slides) s.meta = { ...(meta.defaults ?? {}), ...s.own };
  const program: Program = { name: opts.name, meta, slides };
  for (const p of registry.plugins) for (const pass of p.passes ?? []) pass(program, registry);
  return { program, registry };
}
