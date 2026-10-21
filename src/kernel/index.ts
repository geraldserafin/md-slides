// The kernel: what a plugin and the programs it makes are built of. Everything here runs in node and in the browser.
export { check, declared, valuesOf, type Problem } from './check.ts';
export { closest } from './closest.ts';
export { exportSchema } from './schema.ts';
export { compile, parseSource, run, type Compiled, type SourceFile } from './compile.ts';
export { KdlError, parseKdl } from './kdl.ts';
export { CompileError, createLowerCtx, instantiate, walk } from './lower.ts';
export { API, createRegistry, PluginError } from './registry.ts';
export { pluginFromKdl } from './kdlplugin.ts';
export type * from './types.ts';

import type { Plugin } from './types.ts';

/** a plugin, as the type system sees it (the identity function: it only says what you are writing) */
export const definePlugin = (plugin: Plugin): Plugin => plugin;
