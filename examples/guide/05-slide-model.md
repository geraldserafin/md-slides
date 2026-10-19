## Slides, sections and frames

<!-- The most important idea of the tool. Take your time here. -->

A **slide** is one `.md` file. A slide has one or more **sections**; a section is the text *above*
a code block plus that code block. Consecutive code blocks of the same language are **frames** of one
animation.

````markdown
## Section one            <- text belongs to the code below it

```ts
let a = 1;                <- frame 1
```

```ts
let a = 2;                <- frame 2: → animates 1 -> 2
```

## Section two            <- new heading + code = new section
```ts
let b = 3;
```
````

Moving from the last frame of a section to the next section animates too, as long as both are in a
supported language.
