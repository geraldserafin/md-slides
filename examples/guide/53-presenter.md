## Presenter window, notes and tools

Press **p**: a second window shows your notes (the HTML comments), the next slide and a timer.
It stays in sync with the audience window, both ways — you can drive from either.

On the slide itself: **l** a laser pointer, **d** draw (**c** clears, **Esc** stops), **z** a 2× magnifier,
**a** autoplay (or `"autoplay": 5` in `deck.json`, `?autoplay=5` in the URL). A slide with `hidden: true`
in its front matter is skipped in the show and the PDF.

```ts
// the presenter view lists the HTML comments of the current slide
const notes = slide.notes;
```

<!-- Like this one. Every HTML comment in a slide becomes one paragraph of notes. -->
