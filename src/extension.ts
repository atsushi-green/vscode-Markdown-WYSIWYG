// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './markdownEditor';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Markdown WYSIWYG Editor is now active!');

	// カスタムエディタプロバイダーの登録
	context.subscriptions.push(
		MarkdownEditorProvider.register(context)
	);

	// コマンド: Markdown WYSIWYGエディタで開く
	context.subscriptions.push(
		vscode.commands.registerCommand('markdown-wysiwyg-editor.openEditor', async () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showInformationMessage('Markdownファイルを開いてからこのコマンドを実行してください。');
				return;
			}

			const document = activeEditor.document;
			if (document.languageId !== 'markdown') {
				vscode.window.showWarningMessage('このファイルはMarkdownファイルではありません。');
				return;
			}

			// カスタムエディタで開く
			await vscode.commands.executeCommand('vscode.openWith', document.uri, MarkdownEditorProvider.viewType);
		})
	);

	// コマンド: 新しいMarkdownファイルをWYSIWYGエディタで作成
	context.subscriptions.push(
		vscode.commands.registerCommand('markdown-wysiwyg-editor.newMarkdownFile', async () => {
			const newFile = await vscode.workspace.openTextDocument({
				language: 'markdown',
				content: '# 新しいMarkdownドキュメント\n\nここから編集を開始してください。\n'
			});

			await vscode.window.showTextDocument(newFile);
			await vscode.commands.executeCommand('vscode.openWith', newFile.uri, MarkdownEditorProvider.viewType);
		})
	);

	// コマンド: テキストエディタで開く
	context.subscriptions.push(
		vscode.commands.registerCommand('markdown-wysiwyg-editor.openAsText', async () => {
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
			if (!activeTab || !(activeTab.input instanceof vscode.TabInputCustom || activeTab.input instanceof vscode.TabInputText)) {
				vscode.window.showInformationMessage('Markdownファイルを開いてからこのコマンドを実行してください。');
				return;
			}

			const uri = activeTab.input instanceof vscode.TabInputCustom
				? activeTab.input.uri
				: activeTab.input.uri;

			if (!uri.fsPath.endsWith('.md')) {
				vscode.window.showWarningMessage('このファイルはMarkdownファイルではありません。');
				return;
			}

			// 標準テキストエディタで開く
			await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
		})
	);

	// コマンド: PDFとして出力（アクティブなWYSIWYGエディタの Webview で印刷ダイアログを開く）
	context.subscriptions.push(
		vscode.commands.registerCommand('markdown-wysiwyg-editor.exportPdf', () => {
			// 印刷は Webview 側でしか実行できない（拡張機能ホストからは window.print が無い）ため、
			// アクティブなパネルへメッセージを送って editor.js に実行させる
			const sent = MarkdownEditorProvider.postToActivePanel({ type: 'print' });
			if (!sent) {
				vscode.window.showInformationMessage(
					'WYSIWYGエディタをアクティブにしてからこのコマンドを実行してください。'
				);
			}
		})
	);

	// コマンド: エディタ切り替え (WYSIWYG/テキスト)
	context.subscriptions.push(
		vscode.commands.registerCommand('markdown-wysiwyg-editor.toggleEditor', async () => {
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
			if (!activeTab) {
				vscode.window.showInformationMessage('Markdownファイルを開いてからこのコマンドを実行してください。');
				return;
			}

			let uri: vscode.Uri | undefined;
			let isCustomEditor = false;

			if (activeTab.input instanceof vscode.TabInputCustom) {
				uri = activeTab.input.uri;
				isCustomEditor = true;
			} else if (activeTab.input instanceof vscode.TabInputText) {
				uri = activeTab.input.uri;
				isCustomEditor = false;
			}

			if (!uri || !uri.fsPath.endsWith('.md')) {
				vscode.window.showWarningMessage('このファイルはMarkdownファイルではありません。');
				return;
			}

			if (isCustomEditor) {
				// WYSIWYGエディタ → テキストエディタ
				await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
			} else {
				// テキストエディタ → WYSIWYGエディタ
				await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
			}
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
