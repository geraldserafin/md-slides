## deck.json

Optional, next to the slides.

````jsonc
{
  "title": "My talk",
  "theme": "dark",
  "css": "deck.css",
  "vars": { "--font-heading": "Georgia, serif", "--text-size": "28px" },
  "themes": { "...": {} },
  "fonts": [{ "family": "Fira Code", "src": "fira.woff2", "weight": "400" }],
  "googleFonts": ["Inter:wght@400;700"],
  "animation": { "move": 0.5, "fade": 0.3, "moveDelay": 0.05, "fadeInDelay": 0.1,
                 "ease": "ease-in-out", "slideFade": 0.4,
                 "textTransition": "slide", "textStagger": 0.1 }
}
````

<!-- Also supported here: "description" and "order", used by the deck chooser. -->
