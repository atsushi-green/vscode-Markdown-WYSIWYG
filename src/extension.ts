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

	// コマンド: ツールバーの表示/非表示を切り替え
	context.subscriptions.push(
		vscode.commands.registerCommand('markdown-wysiwyg-editor.toggleToolbar', async () => {
			// 設定を反転させる。実際の反映は markdownEditor.ts が
			// onDidChangeConfiguration を拾って Webview へ通知する。
			const config = vscode.workspace.getConfiguration();
			const key = MarkdownEditorProvider.showToolbarSetting;
			const next = !config.get<boolean>(key, true);

			// **読み取りと同じスコープへ書く。** `get()` が返すのは実効値
			// （フォルダ > ワークスペース > ユーザー > 既定 の解決結果）なので、
			// ワークスペースに値がある状態でユーザー設定だけ書き換えても実効値は
			// 変わらず、**コマンドを押しても何も起きない**（それでいて成功したように
			// 見える）。値が定義されているスコープを inspect で調べ、そこへ書き戻す。
			const inspected = config.inspect<boolean>(key);
			let target = vscode.ConfigurationTarget.Global;
			if (inspected?.workspaceFolderValue !== undefined) {
				target = vscode.ConfigurationTarget.WorkspaceFolder;
			} else if (inspected?.workspaceValue !== undefined) {
				target = vscode.ConfigurationTarget.Workspace;
			}
			await config.update(key, next, target);
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
