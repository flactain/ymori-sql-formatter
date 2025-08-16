// // The module 'vscode' contains the VS Code extensibility API
// // Import the module and reference it with the alias vscode in your code below
// import * as vscode from 'vscode';

// // This method is called when your extension is activated
// // Your extension is activated the very first time the command is executed
// export function activate(context: vscode.ExtensionContext) {

// 	// Use the console to output diagnostic information (console.log) and errors (console.error)
// 	// This line of code will only be executed once when your extension is activated
// 	console.log('Congratulations, your extension "ymori-sql-formatter" is now active!');

// 	// The command has been defined in the package.json file
// 	// Now provide the implementation of the command with registerCommand
// 	// The commandId parameter must match the command field in package.json
// 	const disposable = vscode.commands.registerCommand('ymori-sql-formatter.helloWorld', () => {
// 		// The code you place here will be executed every time your command is executed
// 		// Display a message box to the user
// 		vscode.window.showInformationMessage('Hello World from ymori-sql-formatter!');
// 	});

// 	context.subscriptions.push(disposable);
// }

// // This method is called when your extension is deactivated
// export function deactivate() {}


import * as vscode from 'vscode';
import { formatSql, FormatterOptions } from './formatter';

// 設定を取得
function getFormatterOptions(): FormatterOptions {
    const config = vscode.workspace.getConfiguration('ymori-sql-formatter');
    return {
        indentSize: config.get('indentSize', 2),
        keywordCase: config.get('keywordCase', 'upper')
    };
}

// 拡張機能のアクティベーション
export function activate(context: vscode.ExtensionContext) {
    console.log('ymori-sql-formatter is now active!');

    // Document Formatting Provider を登録
    const documentFormattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: 'sql' },
        {
            provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
                const text = document.getText();
                const options = getFormatterOptions();
                
                try {
                    const formattedText = formatSql(text, options);
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(text.length)
                    );
                    return [vscode.TextEdit.replace(fullRange, formattedText)];
                } catch (error) {
                    vscode.window.showErrorMessage(`SQL formatting error: ${error}`);
                    return [];
                }
            }
        }
    );

    // 手動フォーマットコマンド
    const formatCommand = vscode.commands.registerCommand('ymori-sql-formatter.format', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'sql') {
            vscode.window.showWarningMessage('This command works only with SQL files');
            return;
        }

        const text = document.getText();
        const options = getFormatterOptions();
        
        try {
            const formattedText = formatSql(text, options);
            editor.edit(editBuilder => {
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(text.length)
                );
                editBuilder.replace(fullRange, formattedText);
            });
        } catch (error) {
            vscode.window.showErrorMessage(`SQL formatting error: ${error}`);
        }
    });

    context.subscriptions.push(documentFormattingProvider, formatCommand);
}

export function deactivate() {}