## HTML

```html
<nav>
  <a href="/">Home</a>
  <a href="/docs">Docs</a>
</nav>
```

```html
<nav class="main">
  <a href="/" class="active">Home</a>
  <a href="/docs">Docs</a>
  <a href="/blog">Blog</a>
</nav>
```

## CSS

```css
.button {
  color: white;
  background: blue;
}
```

```css
.button {
  color: white;
  background: var(--accent);
  border-radius: 6px;
  padding: 0.5em 1em;
}
```

## JSON

```json
{
  "name": "slides",
  "version": "0.1.0"
}
```

```json
{
  "name": "slides",
  "version": "0.2.0",
  "scripts": {
    "dev": "slides dev"
  }
}
```

## TSX

```tsx
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>;
}
```

```tsx
function Greeting({ name, excited }: Props) {
  return (
    <h1 className="greeting">
      Hello, {name}
      {excited && "!"}
    </h1>
  );
}
```
