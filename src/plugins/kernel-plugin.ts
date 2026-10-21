// `plugin "name" { … }`: a plugin written in the language itself (see kernel/kdlplugin.ts). It is the one node the compiler needs
// before it can read anything else, so it is a plugin of its own that always comes first.
import { pluginFromKdl } from '../kernel/kdlplugin.ts';
import type { Plugin } from '../kernel/types.ts';

export const kernelPlugin: Plugin = {
  name: 'kernel',
  api: 1,
  nodes: {
    plugin: {
      doc: 'A plugin written in the language: new nodes (`node "callout" { body { … } }`), effects and themes.',
      args: [{ name: 'name', doc: 'the name of the plugin' }],
      children: ['node', 'effect', 'theme'],
      top: { phase: 0, compile: (n, top) => { top.registry.use(pluginFromKdl(n)); } },
    },
    node: {
      doc: 'A node of your own: `arg`s, `prop`s and `flag`s it takes, and a `body` it stands for (`{text}` and `{prop}` are replaced, `slot` is its children).',
      args: [{ name: 'name', doc: 'the name of the node' }], props: { doc: { doc: 'what it is' } }, children: ['arg', 'prop', 'flag', 'body'],
    },
    arg: { doc: 'A positional argument of the node.', args: [{ name: 'name', doc: 'its name (`{name}` in the body)' }], props: { doc: { doc: 'what it is' }, optional: { doc: 'may be left out', values: ['#true', '#false'] } } },
    prop: { doc: 'A property of the node.', args: [{ name: 'name', doc: 'its name' }], props: { doc: { doc: 'what it is' }, values: { doc: 'the allowed values, separated by spaces' }, default: { doc: 'the value when it is not written' }, type: { doc: '`number`', values: ['number'] } } },
    flag: { doc: 'A bare word the node takes.', args: [{ name: 'name', doc: 'the word' }], props: { doc: { doc: 'what it does' } } },
    body: { doc: 'The nodes the node stands for.' },
    effect: { doc: 'An entrance effect for `anim=`: the pose of an element that is not there yet.', args: [{ name: 'name', doc: 'the name' }], props: { pose: { doc: 'CSS declarations, e.g. "transform: rotateY(80deg)"' }, doc: { doc: 'what it looks like' } } },
    theme: { doc: 'A theme: CSS variables as properties.', args: [{ name: 'name', doc: 'the name' }] },
  },
};
