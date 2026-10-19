## Diagrams

A `mermaid` fence draws a diagram with the slide's colors; press **t** to see it follow the theme.

```mermaid width=70%
flowchart LR
  md[Markdown] --> parse[Parse] --> diff{{GumTree diff}} --> play[Animate]
  diff -. same language .-> play
  parse --> pdf[PDF / static / exe]
```

<!-- Mermaid is loaded when a slide first needs it and left out of builds whose decks never use it. -->
