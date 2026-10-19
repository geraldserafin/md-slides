## How the matching works

For every pair of consecutive frames of a code group:

1. both are parsed into syntax trees, flattened to generic `{ label, text, children }` nodes
2. **top-down**: identical subtrees are matched, tallest first
3. **bottom-up**: containers are matched by how many matched descendants they share
4. **extra cues**: text of identifiers and literals, position in the file, the node's slot in its parent
5. a **leaf pass** rescues unique identifiers inside matched containers

Matched tokens become the same DOM element, so a CSS transition moves them; unmatched old tokens fade
out, unmatched new ones fade in.

<!-- Based on GumTree (Falleri et al., 2014). Details in README and src/gumtree.ts. -->
