## Your first deck

<!-- A deck is just a folder. Slides are sorted by file name, hence the numeric prefixes. -->

````text
my-talk/
  01-intro.md        one file = one slide
  02-the-demo.md
  03-thanks.md
  diagram.svg        assets live next to the slides
  deck.json          optional configuration
````

```bash
npx slides dev my-talk/            # live reload
npx slides build my-talk/ -o dist  # static website
```
