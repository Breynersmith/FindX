const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FILE_EXTENSIONS = [
  '.js', '.ts', '.txt', '.py', '.html', '.css', '.json', '.md', 
  '.jsx', '.tsx', '.php', '.java', '.c', '.cpp', '.go', '.rb', '.swift', 
  '.yml', '.xml', '.sh', '.bat', '.sql', '.ini'
];

const IGNORED_FOLDERS = ['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__'];

async function searchInFiles(dir, word, results, caseInsensitive, dateFilter) {
  try {
    const files = await fs.promises.readdir(dir);
    await Promise.all(
      files.map(async (file) => {
        const fullPath = path.join(dir, file);
        let stat;
        try {
          stat = await fs.promises.stat(fullPath);
        } catch (err) {
          return; // Ignorar archivos inaccesibles
        }

        if (stat.isDirectory() && !IGNORED_FOLDERS.includes(file)) {
          await searchInFiles(fullPath, word, results, caseInsensitive, dateFilter);
        } else if (FILE_EXTENSIONS.some(ext => fullPath.endsWith(ext))) {
          // Filtrado por fecha de modificación (si el archivo es reciente)
          if (dateFilter && new Date(stat.mtime).getTime() < Date.now() - dateFilter) {
            return; // Ignorar archivos no recientes
          }
          await searchInFile(fullPath, word, results, caseInsensitive);
        }
      })
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Error al leer ${dir}: ${error.message}`);
  }
}

async function searchInFile(filePath, word, results, caseInsensitive) {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, 'utf-8');
    const rl = readline.createInterface({ input: stream });

    let lineNumber = 0;
    const matches = [];
    rl.on('line', (line) => {
      lineNumber++;
      const lineToCheck = caseInsensitive ? line.toLowerCase() : line;
      const wordToCheck = caseInsensitive ? word.toLowerCase() : word;

      if (lineToCheck.includes(wordToCheck)) {
        matches.push(lineNumber);
      }
    });

    rl.on('close', () => {
      if (matches.length > 0) {
        results.push({ filePath, matches });
      }
      resolve();
    });
  });
}

async function activate(context) {
  let disposable = vscode.commands.registerCommand('extension.searchWord', async () => {
    const word = await vscode.window.showInputBox({ prompt: 'Ingrese la palabra a buscar' });
    if (!word) {
      vscode.window.showInformationMessage('No se ingresó ninguna palabra.');
      return;
    }

    const caseInsensitive = await vscode.window.showQuickPick(['Sí', 'No'], {
      placeHolder: '¿Ignorar mayúsculas y minúsculas?',
    }) === 'Sí';

    const dateFilterChoice = await vscode.window.showQuickPick(['Últimos 7 días', 'Últimos 30 días', 'Sin filtro'], {
      placeHolder: '¿Buscar solo en archivos modificados recientemente?',
    });

    let dateFilter = null;
    if (dateFilterChoice === 'Últimos 7 días') {
      dateFilter = 7 * 24 * 60 * 60 * 1000; // 7 días
    } else if (dateFilterChoice === 'Últimos 30 días') {
      dateFilter = 30 * 24 * 60 * 60 * 1000; // 30 días
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('No hay una carpeta abierta en VS Code.');
      return;
    }

    const searchingMessage = vscode.window.setStatusBarMessage('🔍 Buscando palabra...');
    const folderPath = workspaceFolders[0].uri.fsPath;
    const results = [];

    await searchInFiles(folderPath, word, results, caseInsensitive, dateFilter);

    searchingMessage.dispose(); // ✅ Ocultar mensaje de búsqueda

    if (results.length === 0) {
      vscode.window.showInformationMessage(`❌ No se encontró la palabra "${word}" en ningún archivo.`);
    } else {
      vscode.window.showInformationMessage(`✅ Búsqueda finalizada. Se encontró "${word}" en ${results.length} archivo(s).`);
      showResultsInOutput(results);
    }
  });

  context.subscriptions.push(disposable);
}

function showResultsInOutput(results) {
  const outputChannel = vscode.window.createOutputChannel('Resultados de búsqueda');
  outputChannel.clear();
  outputChannel.appendLine(`Resultados de búsqueda:`);
  results.forEach(result => {
    const matchLines = result.matches.join(', ');
    outputChannel.appendLine(`Archivo: ${result.filePath}`);
    outputChannel.appendLine(`Coincidencias: ${result.matches.length} (Líneas: ${matchLines})`);
  });
  outputChannel.show();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
