/**
 * extension.test.ts - VS Code統合テスト
 *
 * 拡張機能のアクティベーション、コマンド登録、WYSIWYG⇔テキストエディタの
 * 切り替え、ドキュメント更新（最小範囲編集・EOL保持）を実際のVS Code上で検証する。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../markdownEditor';

const EXTENSION_ID = 'your-publisher-name.markdown-wysiwyg-editor';
const VIEW_TYPE = 'markdownWysiwyg.editor';

/** 条件が満たされるまでポーリングして待つ */
async function waitFor(condition: () => boolean, timeoutMs = 10000, message = '条件待ちがタイムアウトしました'): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) {
            assert.fail(message);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

/** アクティブタブがカスタムエディタかどうか */
function activeTabIsCustomEditor(): boolean {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    return tab !== undefined &&
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.viewType === VIEW_TYPE;
}

/** アクティブタブがテキストエディタかどうか */
function activeTabIsTextEditor(): boolean {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    return tab !== undefined && tab.input instanceof vscode.TabInputText;
}

/** 一時Markdownファイルを作成してURIを返す */
function createTempMarkdown(content: string): vscode.Uri {
    const filePath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), 'md-wysiwyg-test-')),
        'test.md'
    );
    fs.writeFileSync(filePath, content, 'utf8');
    return vscode.Uri.file(filePath);
}

suite('拡張機能の統合テスト', () => {

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('拡張機能がアクティベートできる', async () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, `拡張機能 ${EXTENSION_ID} が見つかりません`);
        await extension.activate();
        assert.strictEqual(extension.isActive, true);
    });

    test('すべてのコマンドが登録されている', async () => {
        await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
        const commands = await vscode.commands.getCommands(true);
        for (const command of [
            'markdown-wysiwyg-editor.openEditor',
            'markdown-wysiwyg-editor.openAsText',
            'markdown-wysiwyg-editor.toggleEditor',
            'markdown-wysiwyg-editor.newMarkdownFile'
        ]) {
            assert.ok(commands.includes(command), `コマンド未登録: ${command}`);
        }
    });

    test('openEditor: MarkdownファイルをWYSIWYGエディタで開く', async () => {
        const uri = createTempMarkdown('# テスト\n\n本文\n');
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('markdown-wysiwyg-editor.openEditor');
        await waitFor(activeTabIsCustomEditor, 10000, 'WYSIWYGエディタのタブが開きません');
    });

    test('toggleEditor: WYSIWYG⇔テキストエディタを相互に切り替える', async () => {
        const uri = createTempMarkdown('# 切り替えテスト\n');

        // まずWYSIWYG（カスタムエディタ）で開く
        await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
        await waitFor(activeTabIsCustomEditor, 10000, 'WYSIWYGエディタが開きません');

        // WYSIWYG → テキスト
        await vscode.commands.executeCommand('markdown-wysiwyg-editor.toggleEditor');
        await waitFor(activeTabIsTextEditor, 10000, 'テキストエディタに切り替わりません');

        // テキスト → WYSIWYG
        await vscode.commands.executeCommand('markdown-wysiwyg-editor.toggleEditor');
        await waitFor(activeTabIsCustomEditor, 10000, 'WYSIWYGエディタに戻りません');
    });

    test('newMarkdownFile: テンプレート付きの新規MarkdownドキュメントをWYSIWYGで開く', async () => {
        await vscode.commands.executeCommand('markdown-wysiwyg-editor.newMarkdownFile');
        await waitFor(activeTabIsCustomEditor, 10000, '新規ドキュメントがWYSIWYGエディタで開きません');

        const tab = vscode.window.tabGroups.activeTabGroup.activeTab!;
        const input = tab.input as vscode.TabInputCustom;
        const document = vscode.workspace.textDocuments.find(
            d => d.uri.toString() === input.uri.toString()
        );
        assert.ok(document, '新規ドキュメントが見つかりません');
        assert.strictEqual(document.languageId, 'markdown');
        assert.ok(document.getText().includes('# 新しいMarkdownドキュメント'));
    });
});

suite('MarkdownEditorProvider.updateTextDocument（Webviewからの書き戻し）', () => {
    let provider: MarkdownEditorProvider;

    suiteSetup(() => {
        // updateTextDocumentはcontextを使用しないため、ダミーで生成できる
        provider = new MarkdownEditorProvider({} as vscode.ExtensionContext);
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    async function applyUpdate(document: vscode.TextDocument, content: string): Promise<void> {
        // privateメソッドのためテストではany経由で呼び出す
        await (provider as any).updateTextDocument(document, content);
    }

    test('変更部分のみを置換する最小範囲編集を行う', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: 'line1\nline2\nline3\n'
        });
        await vscode.window.showTextDocument(document);

        const changes: vscode.TextDocumentContentChangeEvent[] = [];
        const subscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                changes.push(...e.contentChanges);
            }
        });

        try {
            await applyUpdate(document, 'line1\nCHANGED\nline3\n');
        } finally {
            subscription.dispose();
        }

        assert.strictEqual(document.getText(), 'line1\nCHANGED\nline3\n');
        // 全文置換ではなく、差分のみ（"line2" → "CHANGED"）が置換されること
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].text, 'CHANGED');
        assert.strictEqual(changes[0].rangeLength, 'line2'.length);
        assert.strictEqual(changes[0].range.start.line, 1);
    });

    test('内容が同一なら編集を発行しない', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: 'same content\n'
        });
        await vscode.window.showTextDocument(document);

        let changeCount = 0;
        const subscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                changeCount++;
            }
        });

        try {
            await applyUpdate(document, 'same content\n');
        } finally {
            subscription.dispose();
        }

        // 編集イベントが一切発行されない（Undo履歴を汚さない）
        assert.strictEqual(changeCount, 0);
    });

    test('CRLFドキュメントの改行コードを保持する', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: 'a\nb\n'
        });
        const editor = await vscode.window.showTextDocument(document);

        // ドキュメントをCRLFに変更
        await editor.edit(builder => builder.setEndOfLine(vscode.EndOfLine.CRLF));
        assert.strictEqual(document.eol, vscode.EndOfLine.CRLF);

        // WebviewからはLFで内容が送られてくる想定
        await applyUpdate(document, 'a\nCHANGED\nb\n');

        assert.strictEqual(document.getText(), 'a\r\nCHANGED\r\nb\r\n');
    });
});
