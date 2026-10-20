// The VS Code side of slideit: the language client (completion, hover, diagnostics, outline, folding, go to definition from the
// bundled language server), snippets, auto-closing tags, and the preview (`slides dev` in the background, shown beside the editor
// and following the cursor). Works in VS Code, VSCodium, Cursor and other forks.
const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

/** stop a process and what it started (`npx` starts node, a shell script starts more): the whole group */
function killTree(proc) {
  if (!proc?.pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
    else process.kill(-proc.pid, 'SIGTERM');
  } catch {
    proc.kill();
  }
}
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;
let preview; // { proc, url, folder }
let status;
let output; // the "Slides" output channel: what `slides dev` prints

const cfg = () => vscode.workspace.getConfiguration('slides');

/** the slides command: the setting, else `slides` when it is on the PATH, else npx */
function cli(...args) {
  const set = cfg().get('command');
  if (set) return { command: set, args: [...cfg().get('args'), ...args] };
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['slides'], { encoding: 'utf8' }).status === 0;
  return onPath ? { command: 'slides', args } : { command: 'npx', args: ['--yes', '@geraldserafin/slideit', ...args] };
}

function startClient(context) {
  let server;
  if (cfg().get('server') === 'cli') {
    const s = cli('lsp');
    server = { command: s.command, args: s.args, transport: TransportKind.stdio };
  } else {
    // the bundled server runs on the editor's own node
    server = {
      command: process.execPath, args: [context.asAbsolutePath('server/main.js')], transport: TransportKind.stdio,
      options: { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
    };
  }
  client = new LanguageClient('slides', 'Slides', server, { documentSelector: [{ scheme: 'file', language: 'slide' }] });
  client.start().catch((e) => vscode.window.showWarningMessage(`Slides: the language server did not start (${e.message}).`));
}

/** `slides dev <folder>`, and the URL it prints */
function startServer(folder) {
  return new Promise((resolve, reject) => {
    // --stop-with-parent: the server ends when this editor does, even if the editor is killed and cannot clean up;
    // detached: it leads a process group of its own, so killTree can end npx and everything under it
    const s = cli('dev', folder, '--stop-with-parent');
    const proc = spawn(s.command, s.args, { shell: process.platform === 'win32', detached: process.platform !== 'win32' });
    let out = '';
    output.appendLine(`$ ${[s.command, ...s.args].join(' ')}`);
    const onData = (d) => {
      out += d;
      output.append(String(d));
      const m = /(https?:\/\/[\w.:-]+\/)/.exec(out);
      if (m) resolve({ proc, url: m[1], folder });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (e) => { output.appendLine(`could not start: ${e.message}`); reject(new Error(`could not start \`${s.command}\`: ${e.message} (is Node.js installed? npm i -g @geraldserafin/slideit)`)); });
    proc.on('exit', (code) => { if (preview?.proc === proc) preview = undefined; status?.hide(); reject(new Error(`slides dev exited with ${code}: ${out.trim().slice(0, 200)}`)); });
  });
}

async function openPreview() {
  const editor = vscode.window.activeTextEditor;
  const file = editor?.document.uri.fsPath;
  if (!file || !file.endsWith('.slide')) return vscode.window.showInformationMessage('Open a .slide file first.');
  const folder = path.dirname(file);
  try {
    if (!preview || preview.folder !== folder) {
      stopPreview();
      preview = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Starting the slides preview…' }, () => startServer(folder));
      status.text = '$(play-circle) slides preview';
      status.tooltip = preview.url;
      status.show();
    }
    const url = `${preview.url}?deck=${encodeURIComponent(path.basename(folder))}`;
    try {
      await vscode.commands.executeCommand('simpleBrowser.show', url, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
    } catch {
      await vscode.env.openExternal(vscode.Uri.parse(url)); // an editor without the Simple Browser (some forks)
    }
    setTimeout(syncPreview, 1500);
  } catch (e) {
    preview = undefined;
    vscode.window.showErrorMessage(`Slides preview: ${e.message}`, 'Show output').then((c) => c && output.show());
  }
}

function stopPreview() {
  killTree(preview?.proc);
  preview = undefined;
  status?.hide();
}

/** the preview shows the slide the cursor is in (and its section): which file in the folder, which <section> */
let syncTimer;
function syncPreview() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const editor = vscode.window.activeTextEditor;
    if (!preview || !cfg().get('previewFollowsCursor') || !editor || editor.document.languageId !== 'slide') return;
    const file = editor.document.uri.fsPath;
    if (path.dirname(file) !== preview.folder) return;
    const files = fs.readdirSync(preview.folder).filter((f) => f.endsWith('.slide')).sort();
    const slide = files.indexOf(path.basename(file));
    if (slide < 0) return;
    const before = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), editor.selection.active));
    const sections = (before.match(/<section[\s>]/g) ?? []).length;
    const total = (editor.document.getText().match(/<section[\s>]/g) ?? []).length;
    const section = total ? Math.max(0, sections - 1) : '';
    http.get(`${preview.url}__goto?slide=${slide}&section=${section}`, (r) => r.resume()).on('error', () => {});
  }, 120);
}

/** typing `>` after an opening tag inserts the closing one: `<row>` -> `<row>|</row>` */
const EMPTY = new Set(['img', 'video', 'audio', 'br']);
function autoClose(e) {
  if (!cfg().get('autoCloseTags') || e.document.languageId !== 'slide' || e.contentChanges.length !== 1) return;
  const ch = e.contentChanges[0];
  if (ch.text !== '>' || ch.rangeLength !== 0) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== e.document) return;
  const pos = ch.range.start.translate(0, 1);
  const before = e.document.lineAt(pos.line).text.slice(0, pos.character);
  const m = /<([a-z][a-z0-9-]*)(?:\s(?:"[^"]*"|'[^']*'|[^<>"'])*)?>$/.exec(before);
  if (!m || /\/>$/.test(before) || EMPTY.has(m[1])) return;
  const rest = e.document.lineAt(pos.line).text.slice(pos.character);
  if (rest.startsWith(`</${m[1]}>`)) return;
  editor.edit((b) => b.insert(pos, `</${m[1]}>`), { undoStopBefore: false, undoStopAfter: false }).then(() => {
    editor.selection = new vscode.Selection(pos, pos);
  });
}

async function checkDeck() {
  const file = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!file) return;
  const t = vscode.window.createTerminal({ name: 'slides check', cwd: path.dirname(file) });
  const s = cli('check', '.');
  t.show();
  t.sendText([s.command, ...s.args].join(' '));
}

exports.activate = (context) => {
  output = vscode.window.createOutputChannel('Slides');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = 'slides.preview';
  startClient(context);
  context.subscriptions.push(
    status,
    output,
    vscode.commands.registerCommand('slides.preview', openPreview),
    vscode.commands.registerCommand('slides.stopPreview', stopPreview),
    vscode.commands.registerCommand('slides.check', checkDeck),
    vscode.window.onDidChangeTextEditorSelection(syncPreview),
    vscode.window.onDidChangeActiveTextEditor(syncPreview),
    vscode.workspace.onDidChangeTextDocument(autoClose),
  );
};

exports.deactivate = () => {
  stopPreview();
  return client?.stop();
};
