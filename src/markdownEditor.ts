import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Markdown WYSIWYG エディタプロバイダー
 * CustomTextEditorProviderを実装してMarkdownファイルのWYSIWYG編集を提供
 */
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {

    public static readonly viewType = 'markdownWysiwyg.editor';

    private static readonly scratchPad: Set<string> = new Set();

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    /**
     * カスタムエディタの登録
     */
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new MarkdownEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            MarkdownEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        );
        return providerRegistration;
    }

    /**
     * カスタムエディタの初期化
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Webviewのオプション設定
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        // Webviewの初期HTML設定
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        // ドキュメントの変更をWebviewに反映
        const updateWebview = () => {
            webviewPanel.webview.postMessage({
                type: 'update',
                content: document.getText()
            });
        };

        // ドキュメント変更時のリスナー
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        // Webviewが閉じられたときのクリーンアップ
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        // Webviewからのメッセージを受信
        webviewPanel.webview.onDidReceiveMessage(async e => {
            switch (e.type) {
                case 'edit':
                    await this.updateTextDocument(document, e.content);
                    return;
                case 'log':
                    console.log('[Markdown WYSIWYG]', e.message);
                    return;
                case 'saveMermaidPng':
                    await this.saveMermaidPng(e.pngBase64, e.filename);
                    return;
            }
        });

        // 初期コンテンツをWebviewに送信
        updateWebview();
    }

    /**
     * WebviewのHTMLコンテンツを生成
     */
    private getHtmlForWebview(webview: vscode.Webview): string {
        // セキュリティポリシー用のnonce生成
        const nonce = getNonce();

        // CSSファイルのURI
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css')
        );

        // JavaScriptモジュールファイルのURI
        const stateUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'modules', 'state.js')
        );
        const utilsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'modules', 'utils.js')
        );
        const markdownModuleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'modules', 'markdown.js')
        );
        const mermaidModuleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'modules', 'mermaid.js')
        );
        const tableModuleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'modules', 'table.js')
        );
        const searchModuleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'modules', 'search.js')
        );
        const commandsModuleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'modules', 'commands.js')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js')
        );

        // highlight.js関連のURI
        // highlight.min.js は commonビルドで python/bash/c/sql を含む約36言語を登録済み。
        // commonビルド外の powershell のみ個別バンドルを追加で読み込む。
        const hljsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'highlight.min.js')
        );
        const hljsPowershellUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'hljs-powershell.min.js')
        );

        // Mermaid.js関連のURI
        const mermaidUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mermaid.min.js')
        );

        // html2canvas関連のURI
        const html2canvasUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'html2canvas.min.js')
        );

        return /* html */`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" 
                      content="default-src 'none'; 
                               style-src ${webview.cspSource} 'unsafe-inline'; 
                               script-src 'nonce-${nonce}' 'unsafe-eval'; 
                               img-src ${webview.cspSource} data: blob:;
                               font-src ${webview.cspSource};">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Markdown WYSIWYG Editor</title>
            </head>
            <body>
                <div class="toolbar">
                    <button class="toolbar-btn" data-command="bold" title="太字 (Ctrl+B)"><strong>B</strong></button>
                    <button class="toolbar-btn" data-command="italic" title="斜体 (Ctrl+I)"><em>I</em></button>
                    <button class="toolbar-btn" data-command="underline" title="下線 (Ctrl+U)"><u>U</u></button>
                    <button class="toolbar-btn" data-command="strikethrough" title="取り消し線 (Ctrl+Shift+X)"><s>S</s></button>
                    <span class="toolbar-separator"></span>
                    <button class="toolbar-btn" data-command="h1" title="見出し1">H1</button>
                    <button class="toolbar-btn" data-command="h2" title="見出し2">H2</button>
                    <button class="toolbar-btn" data-command="h3" title="見出し3">H3</button>
                    <span class="toolbar-separator"></span>
                    <button class="toolbar-btn" data-command="ul" title="箇条書きリスト">•&#8801;</button>
                    <button class="toolbar-btn" data-command="ol" title="番号付きリスト">1&#8801;</button>
                    <button class="toolbar-btn" data-command="quote" title="引用">&#10077;</button>
                    <span class="toolbar-separator"></span>
                    <button class="toolbar-btn" data-command="link" title="リンク挿入">&#128279;</button>
                    <button class="toolbar-btn" data-command="code" title="コードブロック">&lt;/&gt;</button>
                    <span class="toolbar-separator"></span>
                    <button class="toolbar-btn" data-command="toc" title="目次(TOC)を挿入 (Ctrl+Shift+O)">&#128209;</button>
                    <div class="toolbar-spacer"></div>
                    <button class="toolbar-btn toggle-btn" id="toggleView" title="生マークダウン表示切替 (Ctrl+/)">
                        📄 Raw
                    </button>
                </div>
                <!-- 検索ウィジェット -->
                <div id="findWidget" class="find-widget" style="display: none;">
                    <div class="find-input-container">
                        <input type="text" id="findInput" class="find-input" placeholder="検索..." />
                        <span id="findCount" class="find-count"></span>
                    </div>
                    <div class="find-options">
                        <button id="findOptionCase" class="find-option-btn" title="大文字と小文字を区別 (Alt+C)">Aa</button>
                        <button id="findOptionWord" class="find-option-btn" title="単語単位で検索 (Alt+W)">ab</button>
                        <button id="findOptionRegex" class="find-option-btn" title="正規表現を使用 (Alt+R)">.*</button>
                    </div>
                    <div class="find-actions">
                        <button id="findPrev" class="find-action-btn" title="前を検索 (Shift+Enter)">↑</button>
                        <button id="findNext" class="find-action-btn" title="次を検索 (Enter)">↓</button>
                        <button id="findClose" class="find-action-btn" title="閉じる (Escape)">✕</button>
                    </div>
                </div>
                <!-- Mermaidコンテキストメニュー -->
                <div id="mermaidContextMenu" class="mermaid-context-menu" style="display: none;">
                    <div class="mermaid-menu-item" data-action="copyImage">📋 画像をコピー</div>
                    <div class="mermaid-menu-item" data-action="savePng">💾 PNG画像として保存</div>
                </div>
                <div id="editor" contenteditable="true" spellcheck="false"></div>
                <textarea id="rawEditor" spellcheck="false" style="display: none;"></textarea>
                <script nonce="${nonce}" src="${hljsUri}"></script>
                <script nonce="${nonce}" src="${hljsPowershellUri}"></script>
                <script nonce="${nonce}" src="${html2canvasUri}"></script>
                <script nonce="${nonce}" src="${mermaidUri}"></script>
                <!-- Editor modules (order matters due to dependencies) -->
                <script nonce="${nonce}" src="${stateUri}"></script>
                <script nonce="${nonce}" src="${utilsUri}"></script>
                <script nonce="${nonce}" src="${markdownModuleUri}"></script>
                <script nonce="${nonce}" src="${mermaidModuleUri}"></script>
                <script nonce="${nonce}" src="${tableModuleUri}"></script>
                <script nonce="${nonce}" src="${searchModuleUri}"></script>
                <script nonce="${nonce}" src="${commandsModuleUri}"></script>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }

    /**
     * ドキュメントの内容を更新
     *
     * 全文置換ではなく、変更前後で共通する先頭・末尾を除いた最小範囲のみを
     * 置換する。これによりUndo履歴の肥大化と、テキストエディタ側で同じ
     * ファイルを開いている場合のカーソル飛び・スクロール飛びを防ぐ。
     */
    private updateTextDocument(document: vscode.TextDocument, content: string) {
        // ドキュメント側のEOLに合わせる（ファイルの改行コードを勝手に変えない）
        const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const normalized = content.replace(/\r\n?|\n/g, eol);

        const oldText = document.getText();
        if (oldText === normalized) {
            return Promise.resolve(true);
        }

        // 共通の先頭部分を求める
        let start = 0;
        const maxStart = Math.min(oldText.length, normalized.length);
        while (start < maxStart && oldText.charCodeAt(start) === normalized.charCodeAt(start)) {
            start++;
        }

        // 共通の末尾部分を求める（先頭の共通部分と重ならない範囲で）
        let oldEnd = oldText.length;
        let newEnd = normalized.length;
        while (oldEnd > start && newEnd > start && oldText.charCodeAt(oldEnd - 1) === normalized.charCodeAt(newEnd - 1)) {
            oldEnd--;
            newEnd--;
        }

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(document.positionAt(start), document.positionAt(oldEnd)),
            normalized.substring(start, newEnd)
        );

        return vscode.workspace.applyEdit(edit);
    }

    /**
     * Mermaid PNG画像をファイルに保存
     */
    private async saveMermaidPng(pngBase64: string, defaultFilename: string): Promise<void> {
        try {
            // ファイル保存ダイアログを表示
            const uri = await vscode.window.showSaveDialog({
                title: 'Mermaid図をPNGとして保存',
                defaultUri: vscode.Uri.parse(
                    `file://${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''}/${defaultFilename}`
                ),
                filters: {
                    'PNG Image': ['png'],
                    'All Files': ['*']
                }
            });

            if (!uri) {
                console.log('[Markdown WYSIWYG] Save cancelled');
                return;
            }

            // Base64をBinaryに変換
            const binaryString = atob(pngBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // ファイルに書き込み
            await vscode.workspace.fs.writeFile(uri, bytes);
            vscode.window.showInformationMessage(`✅ Mermaid図を保存しました: ${uri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`❌ Mermaid図の保存に失敗しました: ${error}`);
        }
    }
}

/**
 * セキュリティ用のnonce文字列を生成
 */
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
