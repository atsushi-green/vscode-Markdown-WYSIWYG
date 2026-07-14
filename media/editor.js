/**
 * editor.js - メインエントリーポイント
 * エディタの初期化、VS Code通信、イベントリスナー登録を担当
 *
 * 依存モジュール（読み込み順序）:
 * 1. state.js - グローバル状態管理
 * 2. utils.js - ユーティリティ関数
 * 3. markdown.js - Markdown変換
 * 4. mermaid.js - Mermaid図機能
 * 5. table.js - テーブル編集機能
 * 6. search.js - 検索ウィジェット
 * 7. commands.js - コマンド・フォーマット
 */
(function() {
    'use strict';

    // モジュール参照
    const state = window.EditorState;
    const utils = window.EditorUtils;
    const markdown = window.MarkdownModule;
    const mermaidModule = window.MermaidModule;
    const tableModule = window.TableModule;
    const searchModule = window.SearchModule;
    const commands = window.CommandsModule;

    /**
     * エディタの初期化
     */
    function initEditor() {
        // DOM要素参照を初期化
        state.initDOMReferences();

        // ツールバーボタンのイベントリスナー設定
        setupToolbarEvents();

        // エディタの変更を監視
        setupEditorInputEvent();

        // タスクリストのチェックボックス操作を監視
        setupTaskCheckboxEvent();

        // VS Codeからのメッセージを受信
        setupMessageListener();

        // RAWエディタの変更を監視
        setupRawEditorEvent();

        // トグルボタンのクリックイベント
        setupToggleButton();

        // グローバルキーボードショートカット
        setupGlobalKeyboardShortcuts();

        // エディタのキーボードショートカット
        setupEditorKeyboardShortcuts();

        // 検索ウィジェットのイベント
        searchModule.setupEventListeners();

        // Mermaidコンテキストメニューのイベント
        mermaidModule.setupContextMenuEvents();

        // コードブロック言語セレクタのイベント
        commands.setupCodeLangEvents();

        console.log('[Editor] Initialized');
    }

    /**
     * ツールバーボタンのイベント設定
     */
    function setupToolbarEvents() {
        document.querySelectorAll('.toolbar-btn').forEach(button => {
            button.addEventListener('click', () => {
                const command = button.getAttribute('data-command');
                if (command) {
                    commands.executeCommand(command);
                }
            });
        });
    }

    // メイン入力から文書へ書き戻す処理のデバウンス用タイマー
    let editSyncTimeout = null;

    /**
     * 現在のエディタ内容をMarkdown化してVS Codeへ送信（変更がある場合のみ）
     */
    function syncEditorToDocument() {
        const cleanHtml = markdown.getCleanHtmlFromEditor();
        const md = markdown.htmlToMarkdown(cleanHtml);
        const normalized = utils.normalizeEol(md);

        // 内容に変化がなければ送信しない（不要なWorkspaceEdit・Undo履歴の肥大化を防止）
        if (normalized === state.lastSentMarkdown) {
            return;
        }

        state.lastSentMarkdown = normalized;
        state.vscode.postMessage({
            type: 'edit',
            content: normalized
        });
    }

    /**
     * エディタ入力イベントの設定
     */
    function setupEditorInputEvent() {
        state.editor.addEventListener('input', () => {
            if (state.isUpdating || state.isFormatting || state.isCreatingCodeBlock) {
                return;
            }

            // 表示に関わる整形は同期的に実行（キャレット位置を維持するため）
            state.isFormatting = true;
            const savedPosition = utils.saveCursorPosition();
            const { didFormat, caretHandled } = commands.applyInlineFormatting();
            if (didFormat && !caretHandled && savedPosition) {
                utils.restoreCursorPosition(savedPosition);
            }
            state.isFormatting = false;

            // シンタックスハイライトを適用
            commands.applySyntaxHighlighting();

            // コードブロックに言語セレクタを付与
            commands.decorateCodeBlocks();

            // Mermaid図を更新
            mermaidModule.update();

            // 文書への書き戻し（変換コストが高いためデバウンス）
            if (editSyncTimeout) {
                clearTimeout(editSyncTimeout);
            }
            editSyncTimeout = setTimeout(syncEditorToDocument, 150);
        });
    }

    /**
     * タスクリストのチェックボックス操作の設定
     * 再レンダリングで要素が作り直されるため、エディタへの委譲で監視する
     */
    function setupTaskCheckboxEvent() {
        state.editor.addEventListener('change', (event) => {
            const target = event.target;
            if (!target || target.tagName !== 'INPUT' ||
                !target.classList.contains('task-checkbox')) {
                return;
            }

            // checked状態を属性へ反映（クローン・シリアライズ時に状態を保持するため）
            if (target.checked) {
                target.setAttribute('checked', '');
            } else {
                target.removeAttribute('checked');
            }

            // 文書への書き戻し（入力イベントと同じデバウンス経路）
            if (editSyncTimeout) {
                clearTimeout(editSyncTimeout);
            }
            editSyncTimeout = setTimeout(syncEditorToDocument, 150);
        });
    }

    /**
     * VS Codeメッセージリスナーの設定
     */
    function setupMessageListener() {
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    handleUpdateMessage(message);
                    break;
            }
        });
    }

    /**
     * 更新メッセージの処理
     */
    function handleUpdateMessage(message) {
        // コードブロック作成中はスキップ
        if (state.isCreatingCodeBlock) {
            return;
        }

        // 改行コードを正規化して比較
        const incoming = utils.normalizeEol(message.content);

        // RAWモードの場合はrawEditorを更新
        if (state.isRawMode) {
            const currentRaw = utils.normalizeEol(state.rawEditor.value);
            if (incoming !== currentRaw) {
                state.isUpdating = true;
                state.rawEditor.value = message.content;
                state.isUpdating = false;
            }
            state.lastSentMarkdown = incoming;
            return;
        }

        // 現在のエディタ内容をMarkdown化し、同一なら何もしない
        const currentCleanHtml = markdown.getCleanHtmlFromEditor();
        const current = utils.normalizeEol(markdown.htmlToMarkdown(currentCleanHtml));
        if (incoming === current) {
            return;
        }

        // 自分が送信した内容と同じ場合はスキップ（無限ループ防止）
        if (incoming === state.lastSentMarkdown) {
            return;
        }

        // カーソル位置を保存
        const savedPosition = utils.saveCursorPosition();

        state.isUpdating = true;
        const html = markdown.markdownToHtml(incoming);
        state.editor.innerHTML = html;

        // シンタックスハイライトを適用
        commands.applySyntaxHighlighting();

        // コードブロックに言語セレクタを付与
        commands.decorateCodeBlocks();

        // Mermaid図をレンダリング
        mermaidModule.render();

        // テーブルをレンダリング
        tableModule.render();

        // カーソル位置を復元
        if (savedPosition) {
            setTimeout(() => {
                utils.restoreCursorPosition(savedPosition);
            }, 0);
        }

        // 最新状態を記憶
        state.lastSentMarkdown = incoming;

        state.isUpdating = false;
    }

    /**
     * RAW/レンダリングモードの切り替え
     */
    function toggleRawMode() {
        state.isRawMode = !state.isRawMode;

        if (state.isRawMode) {
            // レンダリング → RAWモード
            mermaidModule.cleanup();
            tableModule.cleanup();

            // 保留中のデバウンス送信を確定させ、最新の編集内容を反映する
            if (editSyncTimeout) {
                clearTimeout(editSyncTimeout);
                editSyncTimeout = null;
            }
            syncEditorToDocument();

            const cleanHtml = markdown.getCleanHtmlFromEditor();
            const md = state.lastSentMarkdown || markdown.htmlToMarkdown(cleanHtml);
            state.rawEditor.value = md;
            state.editor.style.display = 'none';
            state.rawEditor.style.display = 'block';
            state.toggleBtn.classList.add('active');
            state.toggleBtn.innerHTML = '👁️ Preview';
            state.toggleBtn.title = 'プレビュー表示に切替 (Ctrl+/)';
            state.rawEditor.focus();
        } else {
            // RAWモード → レンダリング
            const md = state.rawEditor.value;
            const normalized = utils.normalizeEol(md);
            state.editor.innerHTML = markdown.markdownToHtml(normalized);
            commands.applySyntaxHighlighting();
            commands.decorateCodeBlocks();
            mermaidModule.render();
            tableModule.render();
            state.rawEditor.style.display = 'none';
            state.editor.style.display = 'block';
            state.toggleBtn.classList.remove('active');
            state.toggleBtn.innerHTML = '📄 Raw';
            state.toggleBtn.title = '生マークダウン表示切替 (Ctrl+/)';
            state.editor.focus();

            // 変更をVS Codeに通知
            state.lastSentMarkdown = normalized;
            state.vscode.postMessage({
                type: 'edit',
                content: normalized
            });
        }
    }

    /**
     * RAWエディタイベントの設定
     */
    function setupRawEditorEvent() {
        state.rawEditor.addEventListener('input', () => {
            if (state.isUpdating) {
                return;
            }

            const md = utils.normalizeEol(state.rawEditor.value);
            state.lastSentMarkdown = md;
            state.vscode.postMessage({
                type: 'edit',
                content: md
            });
        });
    }

    /**
     * トグルボタンの設定
     */
    function setupToggleButton() {
        state.toggleBtn.addEventListener('click', () => {
            toggleRawMode();
        });
    }

    /**
     * グローバルキーボードショートカットの設定
     */
    function setupGlobalKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+/ でRAW/プレビューモード切り替え
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                toggleRawMode();
                return;
            }

            // Ctrl+F で検索ウィジェットを開く
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                searchModule.open();
                return;
            }

            // Escape で検索ウィジェットを閉じる
            if (e.key === 'Escape' && state.findWidget.style.display !== 'none') {
                e.preventDefault();
                searchModule.close();
                return;
            }

            // Alt+C で大文字/小文字オプション
            if (e.altKey && e.key === 'c') {
                e.preventDefault();
                searchModule.toggleOption('caseSensitive', state.findOptionCase);
                return;
            }

            // Alt+W で単語単位オプション
            if (e.altKey && e.key === 'w') {
                e.preventDefault();
                searchModule.toggleOption('wholeWord', state.findOptionWord);
                return;
            }

            // Alt+R で正規表現オプション
            if (e.altKey && e.key === 'r') {
                e.preventDefault();
                searchModule.toggleOption('useRegex', state.findOptionRegex);
                return;
            }

            // F3 または Ctrl+G で次を検索
            if (e.key === 'F3' || (e.ctrlKey && e.key === 'g')) {
                e.preventDefault();
                if (e.shiftKey) {
                    searchModule.findPrev();
                } else {
                    searchModule.findNext();
                }
                return;
            }
        });
    }

    /**
     * エディタキーボードショートカットの設定
     */
    function setupEditorKeyboardShortcuts() {
        state.editor.addEventListener('keydown', (e) => {
            // テーブルセル内の場合はテーブルのナビゲーション処理に委譲する
            // (#editor 自体が contenteditable のため、キャレットがセル内でも
            //  target がエディタ本体になることがある)
            if (tableModule.handleEditorKeydown(e)) {
                return;
            }

            if (commands.handleInlineCodeExitRight(e)) {
                return;
            }

            if (commands.handleAutoBlock(e)) {
                return;
            }

            if (commands.handleHorizontalRule(e)) {
                return;
            }

            if (commands.handleCodeFence(e)) {
                return;
            }

            // 見出しの確定処理（Enterキー）
            if (commands.handleHeadingConfirm(e)) {
                return;
            }

            // コードブロック内でのEnterキー処理
            if (e.key === 'Enter' && !e.shiftKey) {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const preElement = utils.findAncestor(range.startContainer, (el) => el.nodeName === 'PRE');
                    if (preElement) {
                        e.preventDefault();

                        const textNode = document.createTextNode('\n');
                        range.deleteContents();
                        range.insertNode(textNode);

                        range.setStartAfter(textNode);
                        range.setEndAfter(textNode);
                        selection.removeAllRanges();
                        selection.addRange(range);

                        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                }
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        commands.executeCommand('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        commands.executeCommand('italic');
                        break;
                    case 'u':
                        e.preventDefault();
                        commands.executeCommand('underline');
                        break;
                }
            }
        });
    }

    /**
     * ライブラリの読み込みを待機して初期化
     */
    function waitForLibraries() {
        // highlight.jsの読み込みを待つ
        const waitForHljs = () => {
            if (typeof hljs !== 'undefined') {
                console.log('[Syntax Highlight] hljs loaded, languages:', hljs.listLanguages());
                commands.applySyntaxHighlighting();
                commands.decorateCodeBlocks();
            } else {
                console.log('[Syntax Highlight] Waiting for hljs...');
                setTimeout(waitForHljs, 50);
            }
        };
        waitForHljs();

        // Mermaidの初期化を待つ
        const waitForMermaid = () => {
            if (typeof mermaid !== 'undefined') {
                mermaidModule.init();
                mermaidModule.render();
                tableModule.render();
            } else {
                console.log('[Mermaid] Waiting for mermaid.js...');
                setTimeout(waitForMermaid, 50);
            }
        };
        waitForMermaid();
    }

    // ページ読み込み完了時に初期化
    document.addEventListener('DOMContentLoaded', () => {
        initEditor();
        waitForLibraries();
    });
})();
