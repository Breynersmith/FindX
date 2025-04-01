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

function getLocalizedText(lang, messages) {
  return messages[lang] || messages['en'];
}

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
          return;
        }

        if (stat.isDirectory() && !IGNORED_FOLDERS.includes(file)) {
          await searchInFiles(fullPath, word, results, caseInsensitive, dateFilter);
        } else if (FILE_EXTENSIONS.some(ext => fullPath.endsWith(ext))) {
          if (dateFilter && new Date(stat.mtime).getTime() < Date.now() - dateFilter) {
            return;
          }
          await searchInFile(fullPath, word, results, caseInsensitive);
        }
      })
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Error reading ${dir}: ${error.message}`);
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
    const lang = vscode.env.language.startsWith('es') ? 'es' : 'en';

    const word = await vscode.window.showInputBox({ prompt: getLocalizedText(lang, {
      en: 'Enter the word to search',
      es: 'Ingrese la palabra a buscar'
    }) });
    if (!word) {
      vscode.window.showInformationMessage(getLocalizedText(lang, {
        en: 'No word entered.',
        es: 'No se ingresó ninguna palabra.'
      }));
      return;
    }

    const caseInsensitive = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: getLocalizedText(lang, {
        en: 'Ignore case sensitivity?',
        es: '¿Ignorar mayúsculas y minúsculas?'
      })
    }) === 'Yes';

    const dateFilterChoice = await vscode.window.showQuickPick([
      getLocalizedText(lang, { en: 'Last 7 days', es: 'Últimos 7 días' }),
      getLocalizedText(lang, { en: 'Last 30 days', es: 'Últimos 30 días' }),
      getLocalizedText(lang, { en: 'No filter', es: 'Sin filtro' })
    ], {
      placeHolder: getLocalizedText(lang, {
        en: 'Search only in recently modified files?',
        es: '¿Buscar solo en archivos modificados recientemente?'
      })
    });

    let dateFilter = null;
    if (dateFilterChoice === getLocalizedText(lang, { en: 'Last 7 days', es: 'Últimos 7 días' })) {
      dateFilter = 7 * 24 * 60 * 60 * 1000;
    } else if (dateFilterChoice === getLocalizedText(lang, { en: 'Last 30 days', es: 'Últimos 30 días' })) {
      dateFilter = 30 * 24 * 60 * 60 * 1000;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage(getLocalizedText(lang, {
        en: 'No folder is open in VS Code.',
        es: 'No hay una carpeta abierta en VS Code.'
      }));
      return;
    }

    const searchingMessage = vscode.window.setStatusBarMessage(getLocalizedText(lang, {
      en: '🔍 Searching...',
      es: '🔍 Buscando...'
    }));

    const folderPath = workspaceFolders[0].uri.fsPath;
    const results = [];

    await searchInFiles(folderPath, word, results, caseInsensitive, dateFilter);
    searchingMessage.dispose();

    if (results.length === 0) {
      vscode.window.showInformationMessage(getLocalizedText(lang, {
        en: `❌ No matches found for "${word}".`,
        es: `❌ No se encontró la palabra "${word}" en ningún archivo.`
      }));
    } else {
      vscode.window.showInformationMessage(getLocalizedText(lang, {
        en: `✅ Search completed. Found "${word}" in ${results.length} file(s).`,
        es: `✅ Búsqueda finalizada. Se encontró "${word}" en ${results.length} archivo(s).`
      }));
      showResultsInOutput(results, lang);
    }
  });
  context.subscriptions.push(disposable);
}

function showResultsInOutput(results, lang) {
  const outputChannel = vscode.window.createOutputChannel(getLocalizedText(lang, {
    en: 'Search Results',
    es: 'Resultados de búsqueda'
  }));
  outputChannel.clear();
  outputChannel.appendLine(getLocalizedText(lang, {
    en: 'Search Results:',
    es: 'Resultados de búsqueda:'
  }));
  results.forEach(result => {
    outputChannel.appendLine(`File: ${result.filePath}`);
    outputChannel.appendLine(`Matches: ${result.matches.length} (Lines: ${result.matches.join(', ')})`);
  });
  outputChannel.show();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
