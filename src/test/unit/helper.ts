/**
 * unit/helper.ts - Webviewモジュールのユニットテスト用ハーネス
 *
 * jsdomでWebview相当のDOMを構築し、media/modules/ 配下のスクリプトを
 * 実際のWebviewと同じ順序で読み込む。acquireVsCodeApiはスタブし、
 * postMessageされた内容をテストから検証できるように記録する。
 */
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

// out/test/unit/ から見たプロジェクトルート
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const MODULES_DIR = path.join(PROJECT_ROOT, 'media', 'modules');

// markdownEditor.ts が生成するWebview本体と同じ構造のフィクスチャ
const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="ja">
<body>
    <div class="toolbar">
        <button class="toolbar-btn toggle-btn" id="toggleView">📄 Raw</button>
    </div>
    <div id="findWidget" class="find-widget" style="display: none;">
        <div class="find-row">
            <div class="find-input-container">
                <input type="text" id="findInput" class="find-input" />
                <span id="findCount" class="find-count"></span>
            </div>
            <div class="find-options">
                <button id="findOptionCase" class="find-option-btn">Aa</button>
                <button id="findOptionWord" class="find-option-btn">ab</button>
                <button id="findOptionRegex" class="find-option-btn">.*</button>
            </div>
            <div class="find-actions">
                <button id="findPrev" class="find-action-btn">↑</button>
                <button id="findNext" class="find-action-btn">↓</button>
                <button id="findClose" class="find-action-btn">✕</button>
            </div>
        </div>
        <div class="replace-row">
            <div class="find-input-container">
                <input type="text" id="replaceInput" class="find-input" />
            </div>
            <div class="find-actions">
                <button id="replaceBtn" class="replace-action-btn">置換</button>
                <button id="replaceAllBtn" class="replace-action-btn">全置換</button>
            </div>
        </div>
    </div>
    <div id="mermaidContextMenu" class="mermaid-context-menu" style="display: none;"></div>
    <div id="editor" contenteditable="true" spellcheck="false"></div>
    <textarea id="rawEditor" spellcheck="false" style="display: none;"></textarea>
</body>
</html>`;

// Webviewと同じ読み込み順（依存関係があるため順序が重要）
// mermaid.js は mermaid.min.js 本体に依存するため除外
const MODULE_FILES = ['state.js', 'utils.js', 'markdown.js', 'table.js', 'search.js', 'commands.js'];

export interface EditorEnv {
    /** jsdomのwindow（モジュールはここに登録される） */
    window: any;
    document: Document;
    /** window.EditorState */
    state: any;
    /** window.EditorUtils */
    utils: any;
    /** window.MarkdownModule */
    markdown: any;
    /** window.TableModule */
    table: any;
    /** window.SearchModule */
    search: any;
    /** window.CommandsModule */
    commands: any;
    /** #editor 要素 */
    editor: HTMLElement;
    /** vscode.postMessage されたメッセージの記録 */
    posted: any[];
    /** navigator.clipboard.writeText されたテキストの記録 */
    copiedTexts: string[];
}

/**
 * Webview相当のDOM環境を構築し、エディタモジュールを読み込む
 */
export function createEditorEnv(): EditorEnv {
    const dom = new JSDOM(FIXTURE_HTML, {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: 'https://localhost/'
    });
    const window = dom.window as any;

    const posted: any[] = [];
    const copiedTexts: string[] = [];

    // VS Code Webview APIのスタブ
    window.acquireVsCodeApi = () => ({
        postMessage: (message: any) => {
            posted.push(message);
        },
        getState: () => undefined,
        setState: () => undefined
    });

    // jsdom未実装のAPIを補完
    window.HTMLElement.prototype.scrollIntoView = function () { /* noop */ };
    Object.defineProperty(window.navigator, 'clipboard', {
        value: {
            writeText: (text: string) => {
                copiedTexts.push(text);
                return Promise.resolve();
            }
        },
        configurable: true
    });

    // モジュールをwindowコンテキストで実行（Webviewの<script>読み込みと等価）
    for (const file of MODULE_FILES) {
        const code = fs.readFileSync(path.join(MODULES_DIR, file), 'utf8');
        window.eval(code);
    }

    // DOM参照を初期化（Webviewでは editor.js の initEditor が行う）
    window.EditorState.initDOMReferences();

    return {
        window,
        document: window.document,
        state: window.EditorState,
        utils: window.EditorUtils,
        markdown: window.MarkdownModule,
        table: window.TableModule,
        search: window.SearchModule,
        commands: window.CommandsModule,
        editor: window.document.getElementById('editor'),
        posted,
        copiedTexts
    };
}
