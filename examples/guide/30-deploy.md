## Publish on GitHub Pages

```yaml
name: Pages
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - run: npx slides build my-talk -o dist
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
```

<!-- Deploy step omitted for space: actions/deploy-pages@v4. The repo's own pages.yml is a complete example. -->
