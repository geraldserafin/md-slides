// The vocabulary of the whole system: the intermediate representation (Program), the language definitions plugins register
// (nodes), the runtime pieces (renderers, transitions, effects, services) and the plugin itself. Types only: this file is
// free of imports from the viewer and loads in node and in the browser alike.
import type { KNode, KValue } from './kdl.ts';

export type { KNode, KValue };

// ---------------------------------------------------------------------------------------------------------------------
// The language: what a plugin says about a node

export interface PropDef {
  doc: string;
  /** the allowed values; absent = free */
  values?: string[];
  /** the allowed values are the names a registry holds (transitions, effects, layouts, themes) */
  valuesFrom?: 'transitions' | 'effects' | 'layouts' | 'themes';
  /** `number`: the value must be a number */
  type?: 'number';
  /** the value when the property is not written (documentation and `check` only) */
  default?: string;
}

export interface ArgDef {
  name: string;
  doc: string;
  values?: string[];
  optional?: boolean;
}

/** a node of the language: its shape (for `check`, completion and docs) and what it becomes */
export interface NodeDef {
  doc: string;
  /** positional arguments, in order (`title "Text"`, `code "rust" "…"`) */
  args?: ArgDef[];
  /** more arguments of the last kind are fine (`head "A" "B"`) */
  rest?: boolean;
  /** bare words that switch something on (`video "a.mp4" loop`), with what each does */
  flags?: Record<string, string>;
  props?: Record<string, PropDef>;
  /** the nodes allowed inside; `part` stands for everything that may sit on a slide */
  children?: string[];
  /** a node of the top of a file (`slide`, `deck`, `layout`): phase 0 nodes (plugins) are read first, in every file, then phase 1 (the deck, layouts), then the slides (2) */
  top?: { phase: 0 | 1 | 2; compile(node: KNode, ctx: TopCtx): void };
  /** may sit wherever content may: on a slide, in a row, a column, a slot, a swap */
  part?: boolean;
  /** how a snippet for it is written (editor completion); default is derived from args and children */
  snippet?: string;
  /** AST -> elements. Absent for a node that is only a container its parent reads (`-` in a list). */
  lower?(node: KNode, ctx: LowerCtx): Element | Element[] | void;
  /** a node written in the language itself: `body` is a template of nodes (`{text}` `{prop}` `slot`) */
  expand?: KNode[];
  /**
   * The DOM side, for a plugin that is one file: it draws the element. A node with a `render` and no `lower` becomes an element of its own
   * kind whose `props` are its properties and whose `text` is its first argument.
   */
  render?: Render;
  /** the plugin that registered it (set by the registry) */
  plugin?: string;
}

/** a layout: where the parts of a slide go. Built in or `layout "name" { … }` of a deck. */
export interface LayoutDef {
  doc: string;
  /** the slots it takes besides the default one */
  slots?: string[];
  /** alignment it starts from (the slide's own wins) */
  defaults?: Record<string, string>;
  /** parts (and slot contents) -> the root of the slide */
  build(parts: Element[], slots: Record<string, Element[]>, ctx: LayoutCtx): Element;
}

export interface LayoutCtx {
  columns?: string;
  first: boolean;
}

/** a rule that picks a layout from the content of a slide when it names none; the first that answers wins */
export interface LayoutRule {
  name: string;
  infer(parts: Element[], ctx: { first: boolean }): string | undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// The program: what the compiler makes of the source

/** one thing on a slide. Containers (`row`, `col`, `stack`) have children; the rest are leaves. */
export interface Element {
  kind: string;
  props: Record<string, unknown>;
  children?: Element[];
  /** the stage (click) it appears on, and the one it disappears on */
  at: number;
  out?: number;
  /** identity for pairing between states: an explicit `id`, an image's file, a code group */
  key?: string;
  /** the effect it comes in and goes out with (CSS pose), and the transition of the region it swaps in */
  effect?: string;
  transition?: string;
  /** the `swap` it is a child of (its id), and its place among the children */
  region?: string;
  phase?: number;
  line?: number;
}

/** a region whose children take turns by a timer: the runtime keeps which one is on */
export interface Autoplay {
  region: string;
  seconds: number;
  loop: boolean;
  count: number;
}

export interface Slide {
  /** the slide's properties merged over the deck's `defaults` */
  meta: Record<string, string>;
  /** the slide's own properties, with its layout's defaults */
  own: Record<string, string>;
  root: Element;
  notes: string[];
  title: string;
  url: string;
  /** stages: 1 + the number of clicks that add or change content */
  stages: number;
  autoplay: Autoplay[];
  line: number;
}

export interface AnimationOpts {
  move?: number;
  fade?: number;
  moveDelay?: number;
  fadeInDelay?: number;
  ease?: string;
  slideFade?: number;
  /** the transition of a slide that names none */
  textTransition?: string;
  textStagger?: number;
  textDrift?: number;
}

export interface BarSpec {
  left?: string | string[];
  center?: string | string[];
  right?: string | string[];
  height?: number;
  background?: string;
  color?: string;
  border?: boolean;
  cover?: boolean;
}

export interface CodeStyle {
  bg?: string;
  lines?: boolean;
  radius?: number | string;
  pad?: string;
}

export interface DeckMeta {
  title?: string;
  description?: string;
  hidden?: boolean;
  autoplay?: number;
  loop?: boolean;
  thumbnail?: string;
  author?: string;
  date?: string;
  order?: number;
  defaults?: Record<string, string>;
  header?: BarSpec;
  footer?: BarSpec;
  theme?: string;
  schemes?: { light?: string; dark?: string };
  css?: string;
  vars?: Record<string, string>;
  themes?: Record<string, Record<string, string>>;
  fonts?: { family: string; src: string; weight?: string; style?: string }[];
  googleFonts?: string[];
  animation?: AnimationOpts;
  code?: CodeStyle;
  plugins?: string[];
  files: string[];
}

export interface Program {
  name: string;
  meta: DeckMeta;
  slides: Slide[];
}

/** a position in the show: a slide and the stage on it */
export interface Step {
  slide: number;
  stage: number;
}

export interface Diagnostic {
  file?: string;
  line: number;
  col: number;
  message: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Compile side of a node: the contexts its `lower` and `top.compile` get

/** a lowering context for one slide; `result` says what came of it when all the nodes are lowered */
export interface SlideCtx extends LowerCtx {
  result(): { notes: string[]; title: string; stages: number; autoplay: Autoplay[] };
}

/** what a node at the top of a file may do: set the deck up, declare things, add slides */
export interface TopCtx {
  /** a copy of the registry of this build: `use` adds a plugin for what follows (a `layout` node declares a layout) */
  registry: Registry;
  meta: DeckMeta;
  slides: Slide[];
  url: string;
  fail(node: KNode, message: string): never;
  /** a context for lowering one slide; `first` is whether it is the first slide of the deck */
  lowerCtx(): SlideCtx;
  /** the position the next slide will have in the deck */
  index: number;
}


export interface LowerCtx {
  registry: Registry;
  url: string;
  /** the position in the slide's timeline */
  stage: number;
  /** the highest stage used so far */
  clicks: number;
  /** take the next click: later elements appear on it */
  advance(): number;
  /** run `fn` and then go back to the stage the slide was at before it */
  scope<T>(fn: () => T): T;
  /** what the enclosing `step` or `swap` asks of everything inside: an effect, a transition, a region */
  inherit: { effect?: string; transition?: string; region?: string; phase?: number; direct?: boolean };
  /** the node being lowered is a direct child of the `swap` it sits in (not nested deeper in one of its alternatives) */
  direct: boolean;
  /** run `fn` with other inherited settings */
  inside<T>(patch: Partial<LowerCtx['inherit']>, fn: () => T): T;
  /** a new element: it gets the stage, the inherited effect and region, and the `id` / `anim` of the node */
  element(kind: string, node: KNode, props?: Record<string, unknown>, children?: Element[]): Element;
  lower(nodes: KNode[]): Element[];
  /** raise an error with the position of the node */
  fail(node: KNode, message: string): never;
  uid(prefix: string): string;
  resolve(src: string): string;
  notes: string[];
  /** the first heading of the slide, for the drawer and the presenter */
  heading(text: string): void;
  /** regions that play by themselves */
  autoplay: Autoplay[];
  index: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Runtime side: renderers, effects, transitions, services

/** an element on the screen */
export interface View {
  element: Element;
  el: HTMLElement;
  /** where it was before the step, in stage pixels (for pairing transitions) */
  rect?: DOMRect;
  /** the element is drawn by its plugin's service (code): the pairing transitions leave it alone */
  owned?: boolean;
  /** whatever the plugin of the element keeps with it */
  data?: Record<string, unknown>;
}

export interface RenderCtx {
  element: Element;
  /** the DOM element of the item: fill it, or return what should go into it */
  el: HTMLElement;
  base: string;
  /** render children (of a container) into `host`; `inRow` puts each leaf in a cell of its own */
  children(host: HTMLElement, list?: Element[], opts?: { h?: Align; v?: Align; cells?: number; inRow?: boolean }): void;
  /** the alignment handed down from the containers above, and how many parts the row it is in has */
  h?: Align;
  v?: Align;
  cells: number;
  /** `left`/`start`/`top`… -> start | center | end */
  align(word: string | undefined): Align | undefined;
  /** ask the player to lay out again (a late image, an async renderer) */
  relayout(): void;
  /** the registry of the show, for renderers that need another one (a layout that renders its parts) */
  registry: Registry;
  /** the program-wide settings */
  meta: DeckMeta;
  /** how the view of the element is known to the player (services find their views by it) */
  register(view: Partial<View>): void;
}

export type Align = 'start' | 'center' | 'end';

export type Render = (ctx: RenderCtx) => string | Node | void | Promise<string | Node | void>;

/** the CSS pose of an element that is not there: the hidden state of an entrance effect (`anim=zoom`) */
export interface EffectDef {
  doc: string;
  /** CSS declarations of the hidden pose, e.g. `transform: scale(0.82)` (opacity 0 is always part of it) */
  pose?: string;
  /** more CSS for it; `&` stands for `.item[data-anim='name']` (a transition property, a keyframe animation…) */
  css?: string;
}

export interface TransitionCtx {
  /** the views that come on in this step (in the DOM, hidden) and those that go off (still in the DOM, shown) */
  entering: View[];
  leaving: View[];
  /** a slide change: the old slide is a ghost, pinned over the stage while it leaves (`leaving` are its views) */
  scope: 'slide' | 'step';
  ghost?: HTMLElement;
  /** the transition the old slide had (how it leaves is its business), when the slide changes */
  from?: string;
  instant: boolean;
  /** forward or back */
  dir: 1 | -1;
  props: Record<string, string>;
  /** seconds and easing of the deck */
  timing: { move: number; fade: number; stagger: number; drift: number; delay: number; leave: number };
  stage: HTMLElement;
  /** show or hide a view the plain way: the CSS transition of its pose */
  show(view: View, opts?: { delay?: number }): void;
  hide(view: View): void;
  /** run another transition on some of the views (a fallback: `morph` hands the rest to `fade`) */
  delegate(name: string, entering: View[], leaving: View[]): number | void;
  /** stage pixels of a DOM rect (undoing a scaled parent) */
  px(rect: DOMRect): { x: number; y: number; w: number; h: number };
  /** the translation of the stage's scale (a thumbnail is scaled down) */
  scale: number;
}

export interface TransitionDef {
  doc: string;
  props?: Record<string, PropDef>;
  /**
   * Things with the same key on both sides glide (the `morph` transition pairs them) whatever the transition is; it only does the rest.
   * A transition that wants no pairing (`none`, a cut) says `pairs: false`.
   */
  pairs?: boolean;
  /** applied to the entering and leaving views of a step (or of a slide change); returns how long (ms) a ghost must stay */
  run(ctx: TransitionCtx): number | void;
}

/** one per player: what a plugin keeps while a show runs (the code plugin draws its tokens) */
export interface ServiceInstance {
  /** the slide on screen is about to go: clear what you drew for it */
  leave?(): void;
  /** a slide is on screen: its views are known */
  slide?(ctx: { slide: Slide; views: View[]; instant: boolean }): void;
  /**
   * the step changed; `entering` and `leaving` are the views that came and went (of every plugin: filter by `element.kind`).
   * `enter` and `exit` are the names of the transitions of the slide that comes and the one that goes (or of the swap that changed).
   */
  step?(ctx: { step: Step; slide: Slide; entering: View[]; leaving: View[]; instant: boolean; views: View[]; enter?: string; exit?: string; slideChanged: boolean }): void;
  /** the stage was resized or a late image arrived */
  layout?(): void;
  destroy?(): void;
}

export interface Service {
  /** async work over the whole program before the show (grammars, diffs); data it needs later stays on the steps it makes */
  prepare?(program: Program, steps: Step[], registry: Registry): Promise<void>;
  /** one instance per player */
  create?(host: PlayerHost): ServiceInstance;
}

/** what a service may use of the player */
export interface PlayerHost {
  stage: HTMLElement;
  root: HTMLElement;
  program: Program;
  registry: Registry;
  /** a layer above the slide's items and below the HUD, for what a service draws itself */
  layer(name: string): HTMLElement;
  /** is this view visible at the step (stage, region phases)? */
  visible(view: View): boolean;
  relayout(): void;
  timing: TransitionCtx['timing'];
  autoplay: boolean;
}

// ---------------------------------------------------------------------------------------------------------------------
// The plugin

export interface LanguageDef {
  name: string;
  tags: string[];
  wasm: string;
}

export interface PluginRuntime {
  render?: Record<string, Render>;
  transitions?: Record<string, TransitionDef['run']>;
  service?: Service;
  /** CSS added to the page while the plugin is loaded */
  css?: string;
}

export interface Plugin {
  name: string;
  /** the plugin API it was written for */
  api?: number;
  /** names (of nodes, layouts, transitions, effects) it takes over from earlier plugins on purpose */
  replaces?: string[];
  /** the language */
  nodes?: Record<string, NodeDef>;
  layouts?: Record<string, LayoutDef>;
  layoutRules?: LayoutRule[];
  /** the names of transitions and effects (their implementations are in `runtime`) */
  transitions?: Record<string, Omit<TransitionDef, 'run'> & { run?: TransitionDef['run'] }>;
  effects?: Record<string, EffectDef>;
  themes?: Record<string, Record<string, string>>;
  languages?: LanguageDef[];
  /** transformations of the program after it is lowered, in the order of registration */
  passes?: ((program: Program, registry: Registry) => void)[];
  /** the DOM side; may be loaded later (`() => import('./runtime.ts')`), so that node can use the rest */
  runtime?: PluginRuntime | (() => PluginRuntime | Promise<PluginRuntime>);
  /** buttons of the toolbox and reactions to the viewer moving */
  tools?: { title: string; icon: string; run(api: { player: unknown; deck: Program }): void }[];
  hooks?: { step?(api: { player: unknown; deck: Program }, info: { step: number; slide: number }): void };
}

// ---------------------------------------------------------------------------------------------------------------------
// The registry (implemented in registry.ts): what the plugins said, in one place

export interface Registry {
  readonly plugins: Plugin[];
  node(name: string): NodeDef | undefined;
  nodes(): Record<string, NodeDef>;
  /** the node names that may sit wherever content may */
  parts(): string[];
  topNodes(): string[];
  childrenOf(name: string): string[];
  layout(name: string): LayoutDef | undefined;
  layouts(): Record<string, LayoutDef>;
  layoutRules(): LayoutRule[];
  effect(name: string): EffectDef | undefined;
  effects(): Record<string, EffectDef>;
  transition(name: string): (Omit<TransitionDef, 'run'> & { run?: TransitionDef['run'] }) | undefined;
  transitions(): Record<string, Omit<TransitionDef, 'run'> & { run?: TransitionDef['run'] }>;
  /** the grammar name a `code "ts"` language tag stands for */
  language(tag: string): string | undefined;
  languageTags(): Record<string, string>;
  themes(): Record<string, Record<string, string>>;
  /** register a plugin; a name an earlier plugin took is an error unless the plugin lists it in `replaces` */
  use(plugin: Plugin): Registry;
  /** a copy to add the plugins of one deck to */
  fork(): Registry;
}
