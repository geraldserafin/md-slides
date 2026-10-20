## Charts

A `chart` fence turns a few CSV lines into a chart in the slide's colors: `type=bar` (default), `line` or `pie`.

```chart type=bar title="Build time (s)" width=85%
tool, cold, warm
webpack, 12, 4
vite, 3, 1.2
esbuild, 1.5, 0.6
```

<!-- The first row names the series; with one series the bars carry their value. Charts are plain SVG, so they print and export like the rest. Reveal them with +++. -->
