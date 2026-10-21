// `slides migrate <folder>`: the old tag markup (`.slide` files: <h1>, <row>, <code><frame>…) -> the .slides language (KDL).
// One .slides file for the folder (or one per old file with --split). `<section>` becomes slides with `animate=#true`, the
// slide's head is repeated in each of them. What has no counterpart any more is dropped with a note on stderr.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

// ---- the old markup parser (self-contained: the old src/markup.ts is gone) ----
const RAW = new Set(['slide', 'code', 'c', 'tex', 'chart', 'diagram', 'notes', 'frame']);
const OPEN = /^<([a-z][a-z0-9-]*)(?=[\s/>])/;
const CLOSE = /^<\/([a-z][a-z0-9-]*)\s*>/;

function parseMarkup(src, extraRaw = new Set()) {
  const lineAt = (i) => src.slice(0, i).split('\n').length;
  const root = { tag: '', attrs: {}, children: [], line: 1 };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let text = 0;
  let i = 0;
  const flush = (to) => { if (to > text) top().children.push(src.slice(text, to)); };
  while (i < src.length) {
    if (src[i] !== '<') { i++; continue; }
    const rest = src.slice(i, i + 80);
    const close = CLOSE.exec(rest);
    if (close) {
      flush(i);
      const el = stack.pop();
      if (stack.length === 0 || el.tag !== close[1]) throw new Error(`line ${lineAt(i)}: </${close[1]}> closes nothing`);
      i += close[0].length;
      text = i;
      continue;
    }
    const open = OPEN.exec(rest);
    if (!open) { i++; continue; }
    flush(i);
    const el = { tag: open[1], attrs: {}, children: [], line: lineAt(i) };
    let j = i + open[0].length;
    let selfClosed = false;
    for (;;) {
      while (/\s/.test(src[j] ?? '')) j++;
      if (j >= src.length) throw new Error(`line ${el.line}: <${el.tag}> is never closed with >`);
      if (src[j] === '>') { j++; break; }
      if (src[j] === '/' && src[j + 1] === '>') { selfClosed = true; j += 2; break; }
      const name = /^[^\s=>/]+/.exec(src.slice(j))[0];
      j += name.length;
      let value = 'true';
      if (src[j] === '=') {
        j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, j + 1);
          value = src.slice(j + 1, end);
          j = end + 1;
        } else {
          let m = /^[^\s>]*/.exec(src.slice(j))[0];
          if (m.endsWith('/') && src[j + m.length] === '>') m = m.slice(0, -1);
          value = m;
          j += m.length;
        }
      }
      el.attrs[name] = value;
    }
    top().children.push(el);
    i = j;
    text = i;
    if (selfClosed) continue;
    if (RAW.has(el.tag) || extraRaw.has(el.tag)) {
      const closer = `</${el.tag}>`;
      let end = i;
      for (;;) {
        end = src.indexOf(closer, end);
        if (end < 0) throw new Error(`line ${el.line}: <${el.tag}> is never closed`);
        if (src[end - 1] !== '\\') break;
        end += closer.length;
      }
      el.children.push(src.slice(i, end).replace(/\\<\//g, '</'));
      i = end + closer.length;
      text = i;
    } else stack.push(el);
  }
  flush(src.length);
  return root.children;
}

const raw = (el) => (typeof el.children[0] === 'string' ? el.children[0] : '');
function dedent(s) {
  const lines = s.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length), Infinity);
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
}

// ---- KDL output ----
const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
const ident = (s) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(s) && !/^(true|false|null|inf|nan)$/.test(s);
const val = (s) => (/^-?\d+(\.\d+)?$/.test(s) ? s : ident(s) ? s : q(s));
const prop = (k, v) => `${/^[A-Za-z-][\w-]*$/.test(k) ? k : q(k)}=${val(String(v))}`;
/** a raw multi-line string: no escapes inside, the content is written indented under `indent` */
function rawStr(text, indent) {
  let n = 1;
  for (const m of text.matchAll(/"""(#*)/g)) n = Math.max(n, m[1].length + 1);
  const h = '#'.repeat(n);
  const body = text.split('\n').map((l) => (l ? `${indent}  ${l}` : '')).join('\n');
  return `${h}"""\n${body}\n${indent}  """${h}`;
}
const strArg = (text, indent) => (text.includes('\n') ? rawStr(text, indent) : q(text));

const ALIGN = { start: 'left', left: 'left', center: 'center', middle: 'center', end: 'right', right: 'right' };
const VALIGN = { start: 'top', top: 'top', center: 'middle', middle: 'middle', end: 'bottom', bottom: 'bottom' };

export function migrateSource(src, { name = '', extraRaw = new Set(), warn = () => {} } = {}) {
  const nodes = parseMarkup(src, extraRaw);
  const note = (msg) => warn(`${name}: ${msg}`);

  const esc = (s) => s.replace(/[\\*`$~^=[\]]/g, (c) => `\\${c}`);
  /** a text tag's content as the inline markup of the new language */
  const inline = (kids) => kids.map((n) => {
    if (typeof n === 'string') return esc(n.replace(/\s+/g, ' '));
    switch (n.tag) {
      case 'b': return `**${inline(n.children).trim()}**`;
      case 'i': return `*${inline(n.children).trim()}*`;
      case 's': return `~~${inline(n.children).trim()}~~`;
      case 'mark': return `==${inline(n.children).trim()}==`;
      case 'sub': return `~${inline(n.children).trim()}~`;
      case 'sup': return `^${inline(n.children).trim()}^`;
      case 'kbd': return `[[${inline(n.children).trim()}]]`;
      case 'br': return '\n';
      case 'c': { const t = raw(n).trim(); const f = '`'.repeat(1 + Math.max(0, ...[...t.matchAll(/`+/g)].map((m) => m[0].length))); return `${f}${t}${f}`; }
      case 'tex': return `$${raw(n).trim()}$`;
      case 'a': return `[${inline(n.children).trim()}](${n.attrs.href ?? ''}${n.attrs.title ? ` "${n.attrs.title}"` : ''})`;
      default: note(`<${n.tag}> inside text`); return inline(n.children);
    }
  }).join('').replace(/ *\n */g, '\n').trim();

  const lines = [];
  const out = (indent, s) => lines.push(`${indent}${s}`);
  const fxProps = (a) => {
    const p = [];
    if (a.anim) p.push(prop('anim', a.anim));
    if (a.id) p.push(prop('id', a.id));
    for (const k of ['delay', 'dur', 'out', 'at']) if (a[k] !== undefined && !(k === 'at' && /^\d+$/.test(a.at))) note(`\`${k}\` is gone (use \`step\`/\`pause\`)`);
    return p;
  };

  const liLines = (el) => {
    const kids = el.children.filter((c) => typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol'));
    const text = inline(el.children.filter((c) => typeof c === 'string' || (c.tag !== 'ul' && c.tag !== 'ol')));
    if (!kids.length) return [`- ${q(text)}`];
    return [`- ${q(text)} {`, ...kids.flatMap(listLines).map((l) => `  ${l}`), '}'];
  };
  const listLines = (el) => {
    const flags = [el.tag === 'ol' ? 'numbered' : '', el.attrs.steps !== undefined ? 'steps' : ''].filter(Boolean);
    const props = [el.attrs.start ? prop('start', el.attrs.start) : '', ...fxProps(el.attrs)].filter(Boolean);
    const items = el.children.filter((c) => typeof c !== 'string').flatMap(liLines).map((l) => `  ${l}`);
    return [`list${[...flags, ...props].map((x) => ` ${x}`).join('')} {`, ...items, '}'];
  };

  /** a node of the old markup into lines at `indent` */
  const node = (n, indent) => {
    const a = n.attrs;
    const wrap = (fn) => {
      // size / halign / valign on a text tag were part of its place in the layout: a `col` carries them now
      const o = [];
      if (a.size) o.push(prop('size', a.size));
      if (a.halign) o.push(prop('align', ALIGN[a.halign] ?? a.halign));
      if (a.valign) o.push(prop('valign', VALIGN[a.valign] ?? a.valign));
      if (!o.length) return fn(indent);
      out(indent, `col ${o.join(' ')} {`);
      fn(`${indent}  `);
      out(indent, '}');
    };
    switch (n.tag) {
      case 'h1': case 'h2': case 'h3': case 'p': case 'quote': {
        const kw = { h1: 'title', h2: 'heading', h3: 'subheading', p: 'text', quote: 'quote' }[n.tag];
        wrap((ind) => out(ind, `${kw} ${strArg(inline(n.children), ind)}${fxProps(a).map((x) => ` ${x}`).join('')}`));
        break;
      }
      case 'ul': case 'ol': wrap((ind) => { for (const l of listLines(n)) out(ind, l); }); break;
      case 'table': wrap((ind) => {
        out(ind, 'table {');
        for (const tr of n.children.filter((c) => typeof c !== 'string')) {
          const cells = tr.children.filter((c) => typeof c !== 'string');
          const isHead = cells.length && cells.every((c) => c.tag === 'th');
          out(`${ind}  `, `${isHead ? 'head' : '-'} ${cells.map((c) => q(inline(c.children))).join(' ')}`);
        }
        out(ind, '}');
      }); break;
      case 'tex': out(indent, `math ${strArg(dedent(raw(n)), indent)}`); break;
      case 'code': {
        const flags = [];
        const props = [];
        for (const [k, v] of Object.entries(a)) {
          if (k === 'lang' || k === 'at') continue;
          if (k === 'class') {
            for (const c of v.split(/\s+/).filter(Boolean)) {
              if (['lines', 'nolines', 'nopanel'].includes(c)) flags.push(c);
              else if (c === 'panel') continue;
              else if (['left', 'center', 'right'].includes(c)) props.push(prop('align', c));
              else if (['top', 'middle', 'bottom'].includes(c)) props.push(prop('valign', c));
              else note(`code class "${c}" dropped`);
            }
          } else if (k === 'loop') flags.push('loop');
          else if (k === 'halign') props.push(prop('align', ALIGN[v] ?? v));
          else if (k === 'valign') props.push(prop('valign', VALIGN[v] ?? v));
          else props.push(prop(k, v));
        }
        const head = `code${a.lang ? ` ${q(a.lang)}` : ''}${flags.map((f) => ` ${f}`).join('')}${props.map((p) => ` ${p}`).join('')}`;
        if (a.from !== undefined) { out(indent, head); break; }
        const content = raw(n);
        const frames = [];
        if (/^\s*<frame[\s>]/.test(content)) {
          for (const f of parseMarkup(content)) if (typeof f !== 'string') frames.push({ attrs: f.attrs, code: dedent(raw(f)) });
        } else frames.push({ attrs: {}, code: dedent(content) });
        out(indent, `${head} {`);
        for (const f of frames) {
          const fp = ['focus', 'transition'].filter((k) => f.attrs[k] !== undefined).map((k) => ` ${prop(k, f.attrs[k])}`).join('');
          out(`${indent}  `, `frame${fp} ${rawStr(f.code, `${indent}  `)}`);
          if (f.attrs.at !== undefined) note('frame `at` is gone (frames take a click each)');
        }
        out(indent, '}');
        break;
      }
      case 'img': case 'video': case 'audio': {
        const kw = n.tag === 'img' ? 'image' : n.tag;
        const flags = [];
        const props = [];
        for (const [k, v] of Object.entries(a)) {
          if (k === 'src' || k === 'at') continue;
          if (k === 'class') { for (const c of v.split(/\s+/).filter(Boolean)) { if (['left', 'center', 'right'].includes(c)) props.push(prop('align', c)); else note(`class "${c}" on <${n.tag}> dropped`); } continue; }
          if (k === 'controls' && v === 'false') flags.push('nocontrols');
          else if (['autoplay', 'loop', 'muted'].includes(k)) { if (v !== 'false') flags.push(k); }
          else if (k === 'halign') props.push(prop('align', ALIGN[v] ?? v));
          else if (k === 'valign') props.push(prop('valign', VALIGN[v] ?? v));
          else if (['anim', 'id', 'alt', 'width', 'height', 'fit', 'size'].includes(k)) props.push(prop(k, v));
          else if (['delay', 'dur', 'out'].includes(k)) note(`\`${k}\` is gone`);
          else props.push(prop(k, v));
        }
        out(indent, `${kw} ${q(a.src ?? '')}${flags.map((f) => ` ${f}`).join('')}${props.map((p) => ` ${p}`).join('')}`);
        break;
      }
      case 'chart': out(indent, `chart ${q(a.type ?? 'bar')}${a.title ? ` ${prop('title', a.title)}` : ''}${a.width ? ` ${prop('width', a.width)}` : ''} ${rawStr(dedent(raw(n)), indent)}`); break;
      case 'diagram': out(indent, `diagram${a.width ? ` ${prop('width', a.width)}` : ''} ${rawStr(dedent(raw(n)), indent)}`); break;
      case 'notes': out(indent, `notes ${rawStr(dedent(raw(n)), indent)}`); break;
      case 'row': case 'col': {
        const o = [];
        for (const [k, v] of Object.entries(a)) {
          if (k === 'size' || k === 'class') o.push(prop(k, v));
          else if (k === 'halign') o.push(prop('align', ALIGN[v] ?? v));
          else if (k === 'valign') o.push(prop('valign', VALIGN[v] ?? v));
          else if (k === 'justify') note('`justify` is gone');
        }
        out(indent, `${n.tag}${o.map((x) => ` ${x}`).join('')} {`);
        for (const c of n.children) if (typeof c !== 'string') node(c, `${indent}  `);
        out(indent, '}');
        break;
      }
      case 'step': {
        if (a.at !== undefined) note('`step at=N` is gone: steps are in order');
        out(indent, `step${a.anim ? ` ${prop('anim', a.anim)}` : ''} {`);
        for (const c of n.children) if (typeof c !== 'string') node(c, `${indent}  `);
        out(indent, '}');
        break;
      }
      default: {
        // a plugin's tag: its text is the first argument, its attributes the properties
        const text = n.children.filter((c) => typeof c === 'string').join('');
        const props = Object.entries(a).map(([k, v]) => ` ${prop(k, v)}`).join('');
        out(indent, `${n.tag}${text.trim() ? ` ${strArg(dedent(text), indent)}` : ''}${props}`);
      }
    }
  };

  // the slide: settings, head, sections
  const settings = {};
  const loose = [];
  const sections = [];
  for (const n of nodes) {
    if (typeof n === 'string') continue;
    if (n.tag === 'slide') {
      for (const l of raw(n).split('\n')) {
        const m = /^\s*([^\s:#][^:]*?)\s*:\s*(.*?)\s*$/.exec(l);
        if (m && !l.trimStart().startsWith('#')) settings[m[1]] = m[2];
      }
    } else if (n.tag === 'section') sections.push(n);
    else loose.push(n);
  }
  const VARS = { 'heading-size': '--heading-size', 'text-size': '--text-size', spacing: '--item-gap', padding: '--stage-padding', margin: '--stage-padding', gap: '--row-gap', 'col-gap': '--col-gap', accent: '--accent', 'heading-color': '--heading', 'text-color': '--fg' };
  const px = (k, v) => (/^\d+(\.\d+)?$/.test(v) && !['accent', 'heading-color', 'text-color'].includes(k) ? `${v}px` : v);
  const slideProps = [];
  for (const [k, v] of Object.entries(settings)) {
    if (k === 'halign') slideProps.push(prop('align', ALIGN[v] ?? v));
    else if (k === 'valign') slideProps.push(prop('valign', VALIGN[v] ?? v));
    else if (k === 'layout') slideProps.push(prop('layout', v));
    else if (VARS[k]) slideProps.push(prop(VARS[k], px(k, v)));
    else if (k === 'justify') slideProps.push(`justify=${/^(true|yes|on|1)$/i.test(v) ? '#true' : '#false'}`);
    else if (k === 'stagger' || k === 'section-transition') note(`\`${k}\` is gone`);
    else if (k === 'hidden') slideProps.push(`hidden=${/^(true|yes|on|1)$/i.test(v) ? '#true' : '#false'}`);
    else slideProps.push(prop(k, v));
  }
  const open = (extra = []) => `slide${[...extra, ...slideProps].map((x) => ` ${x}`).join('')}`;
  const body = (children) => { for (const c of children) if (typeof c !== 'string') node(c, '  '); };
  const emitSlide = (children, extra = [], firstOnly = false) => {
    const start = lines.length;
    // the notes of the head belong to the first slide of a split one
    body(children.filter((c) => !(firstOnly && typeof c !== 'string' && c.tag === 'notes')));
    const inner = lines.splice(start);
    if (inner.length) { lines.push(`${open(extra)} {`, ...inner, '}'); } else lines.push(open(extra));
  };
  if (sections.length) {
    sections.forEach((s, i) => emitSlide([...loose, ...s.children], i ? ['animate=#true'] : [], i > 0));
  } else emitSlide(loose);
  return lines.join('\n');
}

/** the plugin tags a deck declares as raw (to parse their content the old way): none are known here, plugins are rare */
export function migrateDeck(dir, { split = false, remove = false, warn = (m) => console.error(m) } = {}) {
  const root = resolve(dir);
  const files = readdirSync(root).filter((f) => f.endsWith('.slide')).sort();
  if (!files.length) throw new Error(`no .slide files in: ${root}`);
  const converted = files.map((f) => ({ f, text: migrateSource(readFileSync(join(root, f), 'utf8'), { name: f, warn }) }));
  const written = [];
  if (split) {
    for (const c of converted) { const out = join(root, c.f.replace(/\.slide$/, '.slides')); writeFileSync(out, `${c.text}\n`); written.push(out); }
  } else {
    const out = join(root, `${basename(root)}.slides`);
    if (existsSync(out)) throw new Error(`${out} exists already`);
    writeFileSync(out, `${converted.map((c) => c.text).join('\n\n')}\n`);
    written.push(out);
  }
  if (remove) for (const f of files) rmSync(join(root, f));
  return written;
}
