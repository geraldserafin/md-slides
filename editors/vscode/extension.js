// The VS Code side of slideit: the language client (diagnostics, completion, hover come from `slides lsp`) and the preview
// (`slides dev` in the background, shown in a Simple Browser beside the editor).
const vscode = require('vscode');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;
let preview; // { proc, url, folder }

const cfg = () => vscode.workspace.getConfiguration('slides');
const run = (...args) => ({ command: cfg().get('command'), args: [...cfg().get('args'), ...args] });

function startClient() {
  const s = run('lsp');
  client = new LanguageClient('slides', 'Slides', { command: s.command, args: s.args, transport: TransportKind.stdio }, {
    documentSelector: [{ scheme: 'file', language: 'slide' }],
  });
  client.start().catch((e) => vscode.window.showWarningMessage(`Slides: the language server did not start (${e.message}). Is \`${s.command}\` installed? npm i -g @geraldserafin/slideit`));
}

/** `slides dev <folder>`, and the URL it prints */
function startServer(folder) {
  return new Promise((resolve, reject) => {
    const s = run('dev', folder);
    const proc = spawn(s.command, s.args, { shell: process.platform === 'win32' });
    let out = '';
    const onData = (d) => {
      out += d;
      const m = /(https?:\/\/[\w.:-]+\/)/.exec(out);
      if (m) resolve({ proc, url: m[1], folder });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    proc.on('exit', (code) => reject(new Error(`slides dev exited with ${code}: ${out.trim().slice(0, 200)}`)));
  });
}

async function openPreview() {
  const file = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!file || !file.endsWith('.slide')) return vscode.window.showInformationMessage('Open a .slide file first.');
  const folder = path.dirname(file);
  try {
    if (!preview || preview.folder !== folder) {
      stopPreview();
      preview = await startServer(folder);
    }
    const url = `${preview.url}?deck=${encodeURIComponent(path.basename(folder))}`;
    try {
      await vscode.commands.executeCommand('simpleBrowser.show', url, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
    } catch {
      await vscode.env.openExternal(vscode.Uri.parse(url)); // an editor without the Simple Browser (some VS Code forks)
    }
  } catch (e) {
    preview = undefined;
    vscode.window.showErrorMessage(`Slides preview: ${e.message}`);
  }
}

function stopPreview() {
  preview?.proc.kill();
  preview = undefined;
}

exports.activate = (context) => {
  startClient();
  context.subscriptions.push(
    vscode.commands.registerCommand('slides.preview', openPreview),
    vscode.commands.registerCommand('slides.stopPreview', stopPreview),
  );
};

exports.deactivate = () => {
  stopPreview();
  return client?.stop();
};
