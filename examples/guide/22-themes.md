## Themes

Built in: `dark`, `light`, `paper`. Press **t** to cycle, or open `?theme=light`.
Your own theme is a set of CSS variables in `deck.json` and joins the cycle:

````jsonc
"theme": "ocean",
"themes": {
  "ocean": {
    "--bg": "#0b1d2a", "--fg": "#b8d4e3", "--heading": "#fff", "--accent": "#3ddc97",
    "--tok-keyword": "#ff7eb6", "--tok-ident": "#e6f4fb", "--tok-type": "#ffd479"
  }
}
````

<!-- Token colors: --tok-keyword --tok-ident --tok-property --tok-type --tok-builtin --tok-comment --tok-punct --tok-plain. See examples/demo for a full "ocean" theme. -->
