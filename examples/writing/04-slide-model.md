---
text-size: 2.4vmin
---

## Slides, sections, groups and clicks

<!-- The most important idea of the tool. Take your time here. -->

A **slide** is one `.md` file. It splits into **sections** at a `#` or `##` heading: the old section fades out, the new one
fades in. Inside a section you write text, images and code in reading order, as many **code blocks** as you like.

````markdown
## Section one

Some text.

```ts #fn
let a = 1;               <- block "fn", frame 1
```

```ts #fn
let a = 2;               <- block "fn", frame 2: → morphs 1 -> 2
```

```py
print("independent")     <- no id: a block of its own
```

## Section two          <- a new heading = a new section
````

Code blocks are **independent** unless they share an `#id`: blocks with the same id are the frames of one animation, in the
same place, one click each. They can even continue across sections and slides.
