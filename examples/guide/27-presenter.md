## Presenter window and notes

Press **p**: a second window shows your notes (the HTML comments), the next slide and a timer.
It stays in sync with the audience window, both ways — you can drive from either.

```ts
// the presenter view lists the HTML comments of the current slide
const notes = slide.notes;
```

<!-- Like this one. Every HTML comment in a slide becomes one paragraph of notes. -->
