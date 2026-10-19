## Write decks with an LLM

The site serves `llms.txt`, a compact syntax reference written for language models, and `llms-full.txt`, this manual in one file.
Give a model the URL, describe your talk, and ask for a deck folder:

```text #ask
Read https://geraldserafin.github.io/md-slides/llms.txt,
then write me a deck about how Git branches work.
```

Review it with `slides dev`, adjust, and ship it.

<!-- One .md file per slide plus a deck.json: easy for a model to produce and easy to diff when you edit its draft. -->
