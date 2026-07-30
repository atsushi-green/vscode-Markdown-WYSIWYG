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
    const mathModule = window.MathModule;
    const tableModule = window.TableModule;
    const searchModule = window.SearchModule;
    const commands = window.CommandsModule;

    // 単語数・文字数ステータスバー要素（初期化時に生成）
    let wordCountStatusEl = null;

    // クリップボード画像貼り付け時のキャレット範囲（保存応答 insertImagePath まで保持）
    let pendingImagePasteRange = null;

    // ローカル画像表示用のベースURI（ドキュメントフォルダの webview URI）。
    // 拡張機能が update メッセージで渡す。相対パス `![](img.png)` の src 解決に使う。
    let imageBaseUri = '';

    /**
     * エディタ内の `<img>` のうち、ローカル相対パスのものを webview URI へ解決する。
     * 元パスは `data-original-src` に退避（直列化は serializeInline がこれを優先して
     * 読むため往復は元の相対パスで保たれる）。解決済み（data-original-src あり）と
     * スキーム付き/絶対/data: の src はスキップする。baseUri 未設定なら何もしない。
     */
    function resolveLocalImages(root) {
        if (!imageBaseUri || !root) {
            return;
        }
        root.querySelectorAll('img').forEach((img) => {
            if (img.hasAttribute('data-original-src')) {
                return;
            }
            const src = img.getAttribute('src') || '';
            if (!markdown.isResolvableRelativeImageSrc(src)) {
                return;
            }
            img.setAttribute('data-original-src', src);
            img.setAttribute('src', markdown.resolveImageSrc(imageBaseUri, src));
        });
    }

    /**
     * 単語数・文字数ステータスバーを生成する（一度だけ）
     */
    function initWordCountStatus() {
        if (wordCountStatusEl || document.getElementById('word-count-status')) {
            wordCountStatusEl = wordCountStatusEl || document.getElementById('word-count-status');
            updateWordCount();
            return;
        }
        wordCountStatusEl = document.createElement('div');
        wordCountStatusEl.id = 'word-count-status';
        wordCountStatusEl.className = 'word-count-status';
        document.body.appendChild(wordCountStatusEl);
        updateWordCount();
    }

    /**
     * 現在の編集内容から単語数・文字数を数え直して表示を更新する。
     * RAWモードではrawEditorの値、通常モードではエディタのテキストを対象にする。
     */
    function updateWordCount() {
        if (!wordCountStatusEl) {
            return;
        }
        let text = '';
        if (state.isRawMode && state.rawEditor) {
            text = state.rawEditor.value || '';
        } else if (state.editor) {
            text = state.editor.textContent || '';
        }
        const c = utils.countText(text);
        wordCountStatusEl.textContent = `単語数: ${c.words} / 文字数: ${c.chars}`;
    }

    // Rawモードの行番号ガター（初期化時に生成）
    let rawEditorWrap = null;
    let rawGutter = null;
    let rawGutterInner = null;

    /**
     * Rawモードの行番号ガターを生成する（一度だけ）。
     * `#rawEditor`（textarea）を flex 行のラッパーで包み、その左に行番号ガターを置く。
     * markdownEditor.ts のHTMLは変えず、単語数バーと同じくJS側で構造を組む。
     * textarea は `white-space: pre`（非折り返し）にしているため、論理行＝1表示行で
     * 番号がずれない（VS Codeの既定＝行折り返しオフと同じ挙動。CSSは editor.css）。
     */
    function initRawLineGutter() {
        const ta = state.rawEditor;
        if (!ta || rawGutterInner) {
            return;
        }
        const wrap = document.createElement('div');
        wrap.id = 'rawEditorWrap';
        wrap.className = 'raw-editor-wrap';
        wrap.style.display = 'none'; // Rawモードに入るまで隠す

        const gutter = document.createElement('div');
        gutter.className = 'raw-line-gutter';
        const inner = document.createElement('div');
        inner.className = 'raw-line-gutter-inner';
        gutter.appendChild(inner);

        // ラッパーを rawEditor の位置へ挿し、gutter と rawEditor を中へ移す
        ta.parentNode.insertBefore(wrap, ta);
        wrap.appendChild(gutter);
        wrap.appendChild(ta);
        // 可視制御はラッパー側で行うため、textarea自体は常に表示のままにする
        ta.style.display = 'block';

        rawEditorWrap = wrap;
        rawGutter = gutter;
        rawGutterInner = inner;

        // 縦スクロールに追従（横スクロールでは動かさない）。リサイズでも再同期
        ta.addEventListener('scroll', syncRawGutterScroll);
        window.addEventListener('resize', syncRawGutterScroll);
    }

    /**
     * ガターの番号列を textarea の縦スクロール量だけ上へずらして行位置を合わせる。
     */
    function syncRawGutterScroll() {
        if (rawGutterInner && state.rawEditor) {
            rawGutterInner.style.transform = 'translateY(' + (-state.rawEditor.scrollTop) + 'px)';
        }
    }

    /**
     * 現在のRaw本文の行数に合わせて行番号を並べ直す。
     */
    function updateRawLineGutter() {
        if (!rawGutterInner || !state.rawEditor) {
            return;
        }
        const count = utils.countLines(state.rawEditor.value || '');
        rawGutterInner.textContent = utils.buildLineNumberText(count);
        syncRawGutterScroll();
    }

    /**
     * Rawモードに入るときにガター付きラッパーを表示し、行番号を更新する。
     */
    function showRawLineGutter() {
        if (rawEditorWrap) {
            rawEditorWrap.style.display = 'flex';
        }
        updateRawLineGutter();
    }

    /**
     * Rawモードを抜けるときにガター付きラッパーを隠す。
     */
    function hideRawLineGutter() {
        if (rawEditorWrap) {
            rawEditorWrap.style.display = 'none';
        }
    }

    /**
     * Rawモードの行折り返し設定（state.isRawWrapEnabled）を実際のDOM・ボタン表示へ反映する。
     * ONにすると`.raw-wrap-on`クラス経由で`#rawEditor`を`white-space: pre-wrap`へ切り替え
     * 長い行を折り返す。行番号ガターは「論理行1つ＝固定22px」の前提で作られており、
     * 折り返した行では視覚行とガターの番号送りがずれてしまうため、ON中はガター自体
     * （`.raw-line-gutter`）を非表示にする（ガター付きラッパー全体を隠す
     * `hideRawLineGutter`とは別物＝textareaは表示したまま）。
     */
    function applyRawWrapMode() {
        if (rawEditorWrap) {
            rawEditorWrap.classList.toggle('raw-wrap-on', state.isRawWrapEnabled);
        }
        if (rawGutter) {
            rawGutter.style.display = state.isRawWrapEnabled ? 'none' : '';
        }
        if (state.toggleRawWrapBtn) {
            state.toggleRawWrapBtn.classList.toggle('active', state.isRawWrapEnabled);
        }
    }

    /**
     * 印刷前に描画完了を待つ上限時間。これを超えたら待たずに印刷ダイアログを開く
     * （図が欠けても「押しても何も起きない」よりは良い）。
     */
    const PRINT_RENDER_TIMEOUT_MS = 5000;

    /**
     * 印刷（PDFとして出力）を実行する。
     *
     * **Rawモード表示中はWYSIWYG表示へ戻してから印刷する。** Rawモードでは
     * `#wysiwygEditorWrap` がインラインスタイルで `display:none` になっており、
     * 印刷用スタイル（`@media print`）は `#rawEditor` の方を隠すため、
     * そのまま印刷すると**白紙になる**。
     *
     * Mermaid図・数式（KaTeX）・ローカル画像は非同期に描画されるため、
     * `utils.waitForRenderComplete` で完了を待ってから印刷ダイアログを開く
     * （待たないと図や式が欠けたPDFになる。とくにRawモードから戻した直後は
     * フル再描画が走る）。待ち合わせは失敗しても reject せず、上限時間で必ず
     * 解決するので「押しても何も起きない」状態にはならない。
     */
    function exportPdf() {
        const wasRawMode = state.isRawMode;
        if (wasRawMode) {
            toggleRawMode();
            // 印刷が終わったら元のRaw表示へ戻す（編集中だったモードを勝手に変えない）。
            // `afterprint` が発火しない環境ではWYSIWYG表示のまま残るが、
            // 内容は失われないため実害は無い。
            window.addEventListener('afterprint', () => {
                if (!state.isRawMode) {
                    toggleRawMode();
                }
            }, { once: true });
        }
        // Mermaid図・数式（KaTeXのWebフォント）・画像は遅れて描画されるため、
        // 完了を待ってから印刷ダイアログを開く。待たないと図・式・画像が欠けた
        // PDFになる（とくにRawモードから戻した直後はフル再描画が走る）。
        // `waitForRenderComplete` は失敗しても reject せず、上限時間で必ず解決する。
        utils.waitForRenderComplete({
            renderMermaid: () => mermaidModule.render(),
            fontsReady: (document.fonts && document.fonts.ready) || null,
            images: state.editor.querySelectorAll('img'),
            timeoutMs: PRINT_RENDER_TIMEOUT_MS
        }).then(() => {
            // 直前のDOM変更が反映されてから開く（レイアウト確定待ち）
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.print();
                });
            });
        });
    }

    /**
     * 印刷（PDFとして出力）ボタンの設定。
     */
    function setupExportPdf() {
        if (!state.exportPdfBtn) {
            return;
        }
        state.exportPdfBtn.addEventListener('click', exportPdf);
    }

    /**
     * 行折り返しトグルボタンの設定。
     */
    function setupRawWrapToggle() {
        if (!state.toggleRawWrapBtn) {
            return;
        }
        state.toggleRawWrapBtn.addEventListener('click', () => {
            state.isRawWrapEnabled = !state.isRawWrapEnabled;
            applyRawWrapMode();
        });
    }

    // WYSIWYG（プレビュー）モードの行番号ガター（初期化時に生成）
    let wysiwygEditorWrap = null;
    let wysiwygGutterInner = null;
    let wysiwygGutterTimeout = null;

    /**
     * WYSIWYG側の行番号ガターを生成する（一度だけ）。
     * `#editor` を flex 行のラッパーで包み、その左に行番号ガターを置く（Rawと同じ方式）。
     * Rawと違い各ブロックの高さは可変なので、番号は等間隔ではなく
     * `markdown.computeEditorLineMap` が返す各ブロックの位置（`getBoundingClientRect`）
     * に合わせて絶対配置する。行位置の厳密な一致はレイアウト依存のため実機で確認する。
     */
    function initWysiwygLineGutter() {
        const ed = state.editor;
        if (!ed || wysiwygGutterInner) {
            return;
        }
        const wrap = document.createElement('div');
        wrap.id = 'wysiwygEditorWrap';
        wrap.className = 'wysiwyg-editor-wrap';
        // プレビューが既定モードなので初期は表示

        const gutter = document.createElement('div');
        gutter.className = 'wysiwyg-line-gutter';
        const inner = document.createElement('div');
        inner.className = 'wysiwyg-line-gutter-inner';
        gutter.appendChild(inner);

        // ラッパーを #editor の位置へ挿し、gutter と #editor を中へ移す
        ed.parentNode.insertBefore(wrap, ed);
        wrap.appendChild(gutter);
        wrap.appendChild(ed);

        wysiwygEditorWrap = wrap;
        wysiwygGutterInner = inner;

        // 縦スクロールに追従（内容・レイアウト変化時のみ再配置＝input/resizeで update）
        ed.addEventListener('scroll', syncWysiwygGutterScroll);
        window.addEventListener('resize', updateWysiwygLineGutter);
        window.addEventListener('resize', updateHeadingBreadcrumb);

        updateWysiwygLineGutter();
    }

    /**
     * ガターの番号列を #editor の縦スクロール量だけ上へずらして行位置を合わせる。
     */
    function syncWysiwygGutterScroll() {
        if (wysiwygGutterInner && state.editor) {
            wysiwygGutterInner.style.transform = 'translateY(' + (-state.editor.scrollTop) + 'px)';
        }
    }

    /**
     * 現在のエディタ内容から各ブロックの開始行番号を割り出し、
     * それぞれのブロックの上端位置へ番号を絶対配置し直す。
     * Rawモード中・ガター未生成時は何もしない。
     */
    function updateWysiwygLineGutter() {
        if (!wysiwygGutterInner || !state.editor || state.isRawMode) {
            return;
        }
        const lineMap = markdown.computeEditorLineMap(state.editor);

        // 既存の番号要素をクリアして作り直す（差分更新はしない＝単純さ優先）
        wysiwygGutterInner.textContent = '';

        const editorRect = state.editor.getBoundingClientRect();
        const scrollTop = state.editor.scrollTop;
        lineMap.forEach(function (entry) {
            // ブロックの上端を #editor のスクロール内容座標へ変換（offsetParent非依存）
            const top = entry.block.getBoundingClientRect().top - editorRect.top + scrollTop;
            const num = document.createElement('div');
            num.className = 'wysiwyg-line-number';
            num.textContent = String(entry.line);
            num.style.top = top + 'px';
            wysiwygGutterInner.appendChild(num);
        });

        syncWysiwygGutterScroll();
    }

    /**
     * 行番号ガターの更新をデバウンスして呼ぶ（computeEditorLineMap は
     * htmlToMarkdown を複数回走らせるため入力ごとの即時実行は重い）。
     */
    function scheduleWysiwygGutterUpdate() {
        if (wysiwygGutterTimeout) {
            clearTimeout(wysiwygGutterTimeout);
        }
        wysiwygGutterTimeout = setTimeout(updateWysiwygLineGutter, 150);
    }

    /**
     * プレビューモードに入る（戻る）ときにガター付きラッパーを表示し行番号を更新する。
     */
    function showWysiwygLineGutter() {
        if (wysiwygEditorWrap) {
            // `display:flex` を**インラインで書かない**。クラス `.wysiwyg-editor-wrap`
            // が既に `display:flex` を持っており、インラインスタイルはカスケード上
            // クラスより強いため、書き込むと印刷用スタイル
            // （`@media print { .wysiwyg-editor-wrap { display:block } }`）に勝ってしまう。
            // その結果「一度Rawへ切り替えて戻した後の印刷」で本文がフレックスアイテムの
            // まま用紙へ出る（1/4で意図した用紙幅いっぱいのブロック配置が無効化される）。
            wysiwygEditorWrap.style.display = '';
        }
        updateWysiwygLineGutter();
    }

    /**
     * Rawモードに入るときにガター付きラッパーを隠す。
     */
    function hideWysiwygLineGutter() {
        if (wysiwygEditorWrap) {
            wysiwygEditorWrap.style.display = 'none';
        }
    }

    // 見出しパンくずバー（初期化時に生成。#editor の直前へ挿入）
    let headingBreadcrumbBar = null;
    let headingBreadcrumbRafPending = false;

    /**
     * スクロール位置パンくずバーを生成する（一度だけ）。ツールバー直下・
     * `#editor`（行番号ガターのラッパーを含む）の直前に挿入し、通常のflowで
     * 常に表示位置を保つ（`#editor` 自身がスクロールしてもバーは動かない）。
     */
    function initHeadingBreadcrumb() {
        const ed = state.editor;
        if (!ed || headingBreadcrumbBar) {
            return;
        }
        const bar = document.createElement('div');
        bar.className = 'heading-breadcrumb-bar';
        bar.style.display = 'none';
        ed.parentNode.insertBefore(bar, ed);
        headingBreadcrumbBar = bar;

        ed.addEventListener('scroll', scheduleHeadingBreadcrumbUpdate);
        updateHeadingBreadcrumb();
    }

    /**
     * スクロールイベントの間引き（rAF）。スクロール中に何度も呼ばれても
     * 1フレームにつき1回だけ再計算する。
     */
    function scheduleHeadingBreadcrumbUpdate() {
        if (headingBreadcrumbRafPending) {
            return;
        }
        headingBreadcrumbRafPending = true;
        window.requestAnimationFrame(function () {
            headingBreadcrumbRafPending = false;
            updateHeadingBreadcrumb();
        });
    }

    /**
     * 現在のスクロール位置から「いま見ている見出し」の祖先チェーンを求め、
     * パンくずバーへ描画する。見出しが無い／まだどの見出しも通過していない
     * （文書先頭）場合はバーを隠す。Rawモード中は何もしない。
     */
    function updateHeadingBreadcrumb() {
        if (!headingBreadcrumbBar || !state.editor || state.isRawMode) {
            return;
        }
        const headings = commands.collectHeadings(state.editor);
        if (!headings.length) {
            headingBreadcrumbBar.style.display = 'none';
            return;
        }

        const editorRect = state.editor.getBoundingClientRect();
        const scrollTop = state.editor.scrollTop;
        const tops = headings.map(function (h) {
            return h.el.getBoundingClientRect().top - editorRect.top + scrollTop;
        });
        const currentIndex = commands.findCurrentHeadingIndex(tops, scrollTop);
        if (currentIndex < 0) {
            headingBreadcrumbBar.style.display = 'none';
            return;
        }

        const chain = commands.buildBreadcrumbChain(headings, currentIndex);
        renderHeadingBreadcrumb(chain);
    }

    /**
     * パンくずチェーンをバーへ描画する。各セグメントをクリックすると
     * 該当見出しへスクロールする（`commands.scrollToAnchor` と同じidベース遷移）。
     */
    function renderHeadingBreadcrumb(chain) {
        const bar = headingBreadcrumbBar;
        bar.textContent = '';
        chain.forEach(function (heading, index) {
            if (index > 0) {
                const sep = document.createElement('span');
                sep.className = 'heading-breadcrumb-sep';
                sep.textContent = '›';
                bar.appendChild(sep);
            }
            const item = document.createElement('span');
            item.className = 'heading-breadcrumb-item';
            item.textContent = '#'.repeat(heading.level) + ' ' + heading.text;
            // idが無い見出し（execCommandによる見出し化・入力直後の変換等はidを付与しない。
            // idはmarkdownToHtmlの再パース時のみ付く）はスクロール遷移できないため、
            // クリック可能に見えないよう装飾（cursor/hover）ごとクラスで分ける。
            if (heading.id) {
                item.classList.add('heading-breadcrumb-item-clickable');
                item.title = heading.text;
                item.addEventListener('click', function () {
                    commands.scrollToAnchor('#' + heading.id);
                });
            }
            bar.appendChild(item);
        });
        bar.style.display = 'flex';
    }

    /**
     * Rawモードに入るときにパンくずバーを隠す。
     */
    function hideHeadingBreadcrumb() {
        if (headingBreadcrumbBar) {
            headingBreadcrumbBar.style.display = 'none';
        }
    }

    // 「/」入力によるコマンドメニュー（初期スコープ: 目次挿入・表の挿入）。
    // markdownEditor.ts 非変更・body直下へ動的生成（mermaid/math/tableの各メニューと同パターン）。
    let slashMenuEl = null;
    // メニュー表示中の対象ブロック（可視テキストが「/」1文字だけのP/DIV/LI）。
    let slashMenuBlock = null;

    /**
     * スラッシュコマンドメニュー（無ければ生成）を返す。
     * 見た目は table/mermaid/math の各コンテキストメニューと共有
     * （editor.css の `.slash-command-menu`/`.slash-command-item` は同ルールを参照）。
     */
    function ensureSlashCommandMenu() {
        if (slashMenuEl) {
            return slashMenuEl;
        }
        const menu = document.createElement('div');
        menu.id = 'slashCommandMenu';
        menu.className = 'slash-command-menu';
        menu.style.display = 'none';
        menu.style.position = 'fixed';

        const addItem = function (label, action) {
            const item = document.createElement('div');
            item.className = 'slash-command-item';
            item.textContent = label;
            // mousedown側でpreventDefaultし、クリックによるフォーカス/選択の移動
            // （「/」ブロックへのライブ選択が崩れること）を防ぐ。
            item.addEventListener('mousedown', function (e) {
                e.preventDefault();
            });
            item.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                runSlashCommand(action);
            });
            menu.appendChild(item);
        };
        addItem('📑 目次を挿入', 'toc');
        addItem('➕ 表を挿入…', 'table');

        document.body.appendChild(menu);
        slashMenuEl = menu;
        return menu;
    }

    /**
     * 対象ブロックの直後（キャレット位置）付近へスラッシュコマンドメニューを表示する。
     */
    function showSlashCommandMenu(block, range) {
        slashMenuBlock = block;
        const menu = ensureSlashCommandMenu();
        menu.style.display = 'block';

        // キャレット位置の矩形（折り畳まれたRangeが0を返す環境向けにブロック自身へフォールバック）。
        let anchor = null;
        if (range && typeof range.getClientRects === 'function' && range.getClientRects().length) {
            anchor = range.getClientRects()[0];
        } else if (range && typeof range.getBoundingClientRect === 'function') {
            anchor = range.getBoundingClientRect();
        }
        if (!anchor || (!anchor.width && !anchor.height && !anchor.top && !anchor.left)) {
            anchor = block.getBoundingClientRect();
        }

        const menuRect = menu.getBoundingClientRect();
        const pos = tableModule.computeMenuPosition(
            anchor.left, anchor.bottom + 4, menuRect.width, menuRect.height,
            window.innerWidth, window.innerHeight
        );
        menu.style.left = pos.left + 'px';
        menu.style.top = pos.top + 'px';
    }

    /**
     * スラッシュコマンドメニューを閉じる。
     */
    function hideSlashCommandMenu() {
        slashMenuBlock = null;
        if (slashMenuEl) {
            slashMenuEl.style.display = 'none';
        }
    }

    /**
     * キャレット位置から、スラッシュコマンドメニューを表示すべきかどうかを判定して
     * 表示/非表示を更新する（`selectionchange` から呼ぶ）。
     */
    function updateSlashCommandMenu() {
        if (state.isRawMode) {
            hideSlashCommandMenu();
            return;
        }
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
            hideSlashCommandMenu();
            return;
        }
        const range = selection.getRangeAt(0);
        if (!state.editor.contains(range.startContainer)) {
            hideSlashCommandMenu();
            return;
        }
        const block = utils.findBlockAncestor(range.startContainer);
        if (!commands.isSlashCommandTrigger(block)) {
            hideSlashCommandMenu();
            return;
        }
        showSlashCommandMenu(block, range);
    }

    /**
     * メニュー項目の選択を実行する。対象ブロック（「/」の直後）へキャレットを合わせてから、
     * 既存のTOC挿入／表の挿入ダイアログを呼ぶ（どちらも「キャレットのあるブロックの直後」へ
     * 内容を挿入する処理を流用する）。
     *
     * 「/」の除去は**挿入が実際に成功した後**にのみ行う。先に消してしまうと、表ダイアログの
     * キャンセル（Escape／キャンセルボタン）や、見出しが無い文書での「目次を挿入」失敗時に、
     * 入力していた「/」が復元されず消えるだけになる（`/local-review`指摘A-1/A-2）。
     */
    function runSlashCommand(action) {
        const block = slashMenuBlock;
        hideSlashCommandMenu();
        if (!block || !block.parentNode) {
            return;
        }

        const range = document.createRange();
        range.selectNodeContents(block);
        range.collapse(false); // 「/」の直後（末尾）へ
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        // 挿入成功後にのみ呼ぶ: 「/」を消して空行へ戻す。プレースホルダ自身の変更は
        // 'input'イベントを自発しないため、変更後に明示的にディスパッチして同期させる
        // （insertToc/insertTableは自身の挿入分をそれぞれ既にディスパッチ済み）。
        const clearPlaceholder = function () {
            if (block.parentNode) {
                block.innerHTML = '<br>';
                state.editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };

        if (action === 'toc') {
            if (commands.insertToc()) {
                clearPlaceholder();
            }
        } else if (action === 'table') {
            tableModule.setPendingInsertRange(range);
            // キャレット位置（「/」を打った場所）の近くへダイアログを出す
            // （右クリックメニュー由来の位置指定と同じ仕組み。範囲は折りたたみ済みの
            // 点なのでrectの左端・下端がキャレット位置に一致する）。
            // 稀に（レイアウトのタイミング等で）全て0の矩形が返ることがあるため、
            // その場合はキャレット位置不明として中央フォールバックへ委ねる
            // （左上(0,0)付近に出てしまうのを防ぐ）。
            const caretRect = range.getBoundingClientRect();
            const hasCaretRect = caretRect.left !== 0 || caretRect.top !== 0 ||
                caretRect.width !== 0 || caretRect.height !== 0;
            const anchor = hasCaretRect ? { x: caretRect.left, y: caretRect.bottom + 4 } : undefined;
            tableModule.showInsertDialog(clearPlaceholder, anchor);
        }
    }

    /**
     * スラッシュコマンドメニューのイベントを配線する（editor.js の初期化から一度だけ）。
     * `selectionchange` はキャレット移動全般（クリック・矢印キー・入力）で発火するため、
     * これ1つで「/」入力直後の表示と、条件を外れた際（追加入力・削除・移動）の
     * 非表示の両方をカバーする（`setupRawMarkdownCaretEvent` と同じ設計）。
     */
    function setupSlashCommandMenuEvents() {
        document.addEventListener('selectionchange', function () {
            if (state.isUpdating || state.isFormatting || state.isCreatingCodeBlock) {
                return;
            }
            updateSlashCommandMenu();
        });

        // メニュー外クリックで閉じる
        document.addEventListener('click', function (e) {
            if (slashMenuEl && !slashMenuEl.contains(e.target)) {
                hideSlashCommandMenu();
            }
        });

        // メニュー表示中のEscapeで閉じる
        state.editor.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && slashMenuEl && slashMenuEl.style.display !== 'none') {
                hideSlashCommandMenu();
            }
        });
    }

    // 脚注ホバーツールチップ（`sup.footnote-ref` にマウスホバーすると脚注定義本文を表示）。
    // markdownEditor.ts 非変更・body直下へ動的生成（mermaid/math/tableの各メニューと同パターン）。
    let footnoteTooltipEl = null;
    let footnoteTooltipTimeout = null;
    // 現在ホバー対象として処理中の脚注参照（<sup class="footnote-ref">）要素。
    // <sup>とその内側の<a>の間でマウスが出入りするたびmouseover/mouseoutが
    // 再発火するが、同じrefへの再入場ではタイマーをリセットしない（下記参照）。
    let activeFootnoteRef = null;

    /**
     * ツールチップ要素（無ければ生成）を返す。
     */
    function ensureFootnoteTooltip() {
        if (footnoteTooltipEl) {
            return footnoteTooltipEl;
        }
        const el = document.createElement('div');
        el.className = 'footnote-tooltip';
        el.style.display = 'none';
        document.body.appendChild(el);
        footnoteTooltipEl = el;
        return el;
    }

    /**
     * 脚注参照（`refEl` = `sup.footnote-ref`）の直下付近へ、対応する脚注定義本文を
     * ツールチップ表示する。定義が見つからない（本文が空）場合は何もしない。
     */
    function showFootnoteTooltip(refEl) {
        const label = refEl.getAttribute('data-footnote-label');
        if (!label) {
            return;
        }
        const text = commands.getFootnoteDefinitionText(state.editor, label);
        if (!text) {
            return;
        }
        const tooltip = ensureFootnoteTooltip();
        tooltip.textContent = text;
        tooltip.style.display = 'block';

        const anchor = refEl.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const pos = tableModule.computeMenuPosition(
            anchor.left, anchor.bottom + 4, tooltipRect.width, tooltipRect.height,
            window.innerWidth, window.innerHeight
        );
        tooltip.style.left = pos.left + 'px';
        tooltip.style.top = pos.top + 'px';
    }

    /**
     * ツールチップを閉じる。
     */
    function hideFootnoteTooltip() {
        if (footnoteTooltipTimeout) {
            clearTimeout(footnoteTooltipTimeout);
            footnoteTooltipTimeout = null;
        }
        if (footnoteTooltipEl) {
            footnoteTooltipEl.style.display = 'none';
        }
        activeFootnoteRef = null;
    }

    /**
     * 脚注ホバーツールチップのイベントを配線する（editor.js の初期化から一度だけ）。
     * `mouseenter`/`mouseleave`はバブリングしないため、委譲には`mouseover`/`mouseout`＋
     * `closest`を使う（`table.js`のセル範囲選択と異なりホバーのみで良いため間引きは
     * 表示側をsetTimeoutでデバウンスするだけで十分）。
     * `<sup>`とその内側の`<a>`の間でマウスが出入りするたびmouseoverが再発火するが、
     * `activeFootnoteRef`で「既に処理中の同じref」への再入場を検知し、その場合は
     * タイマーの再設定をスキップする（`/local-review`指摘・機能に影響は無い軽微な
     * 非効率だったが、無駄なclearTimeout/setTimeoutの繰り返しを避ける）。
     */
    function setupFootnoteTooltipEvents() {
        state.editor.addEventListener('mouseover', function (e) {
            const ref = e.target && e.target.closest && e.target.closest('sup.footnote-ref');
            if (!ref || ref === activeFootnoteRef) {
                return;
            }
            activeFootnoteRef = ref;
            clearTimeout(footnoteTooltipTimeout);
            footnoteTooltipTimeout = setTimeout(function () {
                showFootnoteTooltip(ref);
            }, 300);
        });

        state.editor.addEventListener('mouseout', function (e) {
            const ref = e.target && e.target.closest && e.target.closest('sup.footnote-ref');
            if (!ref) {
                return;
            }
            // 移動先が同じ参照内（<sup>と内側の<a>の間の移動等）なら維持する
            const related = e.relatedTarget;
            if (related && ref.contains(related)) {
                return;
            }
            hideFootnoteTooltip();
        });

        // スクロールすると参照の画面位置がずれるため、表示中なら閉じる
        state.editor.addEventListener('scroll', hideFootnoteTooltip);
    }

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

        // コピー／カット＝生Markdown書き込み、ペースト＝ブロックMarkdownの取り込み
        setupClipboardEvents();

        // タスクリストのチェックボックス操作を監視
        setupTaskCheckboxEvent();

        // キャレット位置に応じた生Markdown表示の切り替えを監視
        setupRawMarkdownCaretEvent();

        // 「/」入力によるコマンドメニュー（目次挿入・表の挿入）を監視
        setupSlashCommandMenuEvents();

        // 脚注参照（[^label]）ホバー時のツールチップ表示を監視
        setupFootnoteTooltipEvents();

        // リンクの挿入・編集ダイアログの操作を監視
        setupLinkDialogEvents();

        // VS Codeからのメッセージを受信
        setupMessageListener();

        // RAWエディタの変更を監視
        setupRawEditorEvent();

        // トグルボタンのクリックイベント
        setupToggleButton();

        // Rawモードの行折り返しトグルボタン
        setupRawWrapToggle();
        setupExportPdf();

        // グローバルキーボードショートカット
        setupGlobalKeyboardShortcuts();

        // エディタのキーボードショートカット
        setupEditorKeyboardShortcuts();

        // 検索ウィジェットのイベント
        searchModule.setupEventListeners();

        // Mermaidコンテキストメニューのイベント
        mermaidModule.setupContextMenuEvents();

        // ブロック数式の右クリックメニュー（PNGコピー）
        mathModule.setupContextMenu(state.editor);

        // 平文領域の右クリックメニュー（表を挿入…）。数式より後に配線し、
        // 数式ブロック上の右クリックは数式メニューを優先する（対象が排他）。
        tableModule.setupContextMenu(state.editor);

        // 表のマウスドラッグによる矩形範囲選択（ボタンを離したらドラッグ終了）
        tableModule.setupRangeSelectionMouseUp();

        // コードブロック言語セレクタのイベント
        commands.setupCodeLangEvents();

        // 単語数・文字数ステータスバーを生成
        initWordCountStatus();

        // Rawモードの行番号ガターを生成（rawEditorをラッパーで包む）
        initRawLineGutter();
        applyRawWrapMode();

        // 見出しパンくずバーを生成（ツールバー直下・#editorの直前）。
        // #editor がまだ行番号ガターのラッパーで包まれる前（親がbody直下）に挿す必要があるため、
        // 次の initWysiwygLineGutter より必ず先に呼ぶ（後だと親がラッパー内になり縦積みが崩れる）。
        initHeadingBreadcrumb();

        // WYSIWYGモードの行番号ガターを生成（#editorをラッパーで包む）
        initWysiwygLineGutter();

        console.log('[Editor] Initialized');
    }

    /**
     * ツールバーボタンのイベント設定
     */
    function setupToolbarEvents() {
        document.querySelectorAll('.toolbar-btn').forEach(button => {
            // クリックでエディタの選択範囲が失われないようフォーカス移動を抑止
            if (button.hasAttribute('data-command')) {
                button.addEventListener('mousedown', (e) => e.preventDefault());
            }
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
     * 編集内容をVS Codeへ送信する。送信ごとに単調増加する編集シーケンス番号
     * （`state.editSeq`）を採番して `seq` に載せる。拡張機能側はこの編集を適用して
     * 返すエコー `update` にこの番号を反映するため、遅れて届いた古いエコーを
     * `utils.shouldIgnoreStaleUpdate` で無視でき、タイプ中のキャレット巻き戻りを防げる。
     */
    function postEdit(content) {
        state.lastSentMarkdown = content;
        state.editSeq = state.editSeq + 1;
        state.vscode.postMessage({
            type: 'edit',
            content: content,
            seq: state.editSeq
        });
    }

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

        postEdit(normalized);
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

            // 追加・変更された数式（KaTeX）をレンダリング
            mathModule.render(state.editor);

            // ローカル相対パス画像の src を webview URI へ解決
            resolveLocalImages(state.editor);

            // 単語数・文字数の表示を更新
            updateWordCount();

            // 行番号ガターを更新（変換コストが高いためデバウンス）
            scheduleWysiwygGutterUpdate();

            // 見出しパンくずバーを更新（見出しの追加・削除・移動に追従）
            updateHeadingBreadcrumb();

            // 文書への書き戻し（変換コストが高いためデバウンス）
            if (editSyncTimeout) {
                clearTimeout(editSyncTimeout);
            }
            editSyncTimeout = setTimeout(syncEditorToDocument, 150);
        });
    }

    /**
     * テキスト入力系のフォーム部品（Mermaidソースのtextarea・検索入力・リンクダイアログ等）に
     * フォーカスがあるか。この間のコピー／ペーストはその部品の既定動作に任せる
     * （`window.getSelection()` はフォーム部品内の選択を反映せず、直前のエディタ内選択が
     * 残ったままのことがあり、誤ってエディタへの操作として扱ってしまうため）。
     */
    function isFormFieldFocused() {
        const active = document.activeElement;
        return !!active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
    }

    /**
     * コピー／カット／ペーストのクリップボード連携の設定。
     *
     * コピー／カット: WYSIWYG表示のままコピーするとレンダリング後のテキスト（テーブルや
     * 数式・Mermaidが潰れた形）になってしまうため、選択範囲を生Markdownへ直列化して
     * text/plain で書き込む。段落・見出しの部分選択は既定動作（素のテキストコピー）に委ねる。
     * リスナーは document に張る: 選択が Mermaid図・テーブル・数式などの
     * `contenteditable=false` 島で始まる／終わると、copy イベントが #editor を
     * バブリングしない（フォーカスが editor に無い）ことがあるため。
     *
     * ペースト: ブロックMarkdown（見出し・リスト・コードフェンス・テーブル・`$$`数式・
     * Mermaid）を含むテキストは `commands.handleMarkdownPaste` でその場で変換して挿入する
     * （既定のプレーンテキスト挿入では再読み込みまでレンダリングされないため）。
     * テーブルセル内の paste は table.js が stopPropagation するためここには届かない。
     */
    function setupClipboardEvents() {
        const copyHandler = function (event) {
            if (state.isRawMode || isFormFieldFocused()) {
                return;
            }
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                return;
            }
            const range = selection.getRangeAt(0);
            if (!state.editor.contains(range.commonAncestorContainer)) {
                return;
            }
            const md = commands.getSelectedMarkdown(range);
            if (md === null || !event.clipboardData) {
                return;
            }
            event.preventDefault();
            event.clipboardData.setData('text/plain', md);
            if (event.type === 'cut') {
                range.deleteContents();
                selection.removeAllRanges();
                state.editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        document.addEventListener('copy', copyHandler);
        document.addEventListener('cut', copyHandler);

        document.addEventListener('paste', (event) => {
            if (state.isRawMode || isFormFieldFocused() || !event.clipboardData) {
                return;
            }

            const text = event.clipboardData.getData('text/plain');

            // テキストを持たないクリップボード（スクリーンショット等の純粋な画像）だけを
            // 画像貼り付けとして扱い、拡張機能側へ保存を依頼して相対パスを ![](…) で挿入する。
            // Excel等のように**テキスト（TSV/表）と画像を併載**するクリップボードは、
            // 従来どおりテキスト（表）貼り付けを優先する（画像で上書きしない）。
            if (!text) {
                const imageItem = commands.findClipboardImageItem(event.clipboardData.items);
                const file = imageItem && imageItem.getAsFile && imageItem.getAsFile();
                if (file) {
                    event.preventDefault();
                    // 非同期の保存応答（insertImagePath）まで挿入位置を保持する
                    const selection = window.getSelection();
                    pendingImagePasteRange =
                        (selection && selection.rangeCount > 0 &&
                            state.editor.contains(selection.getRangeAt(0).startContainer))
                            ? selection.getRangeAt(0).cloneRange()
                            : null;
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = String(reader.result || '');
                        const base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : '';
                        if (base64) {
                            state.vscode.postMessage({
                                type: 'saveClipboardImage',
                                base64: base64,
                                mime: file.type || 'image/png'
                            });
                        }
                    };
                    reader.readAsDataURL(file);
                }
                return;
            }

            if (!commands.handleMarkdownPaste(text)) {
                return;
            }
            event.preventDefault();
            // テーブルは input パイプラインの対象外のためここで描画する。
            // 残り（ハイライト・Mermaid・数式・文書への書き戻し）は input イベントで走る。
            tableModule.render();
            state.editor.dispatchEvent(new Event('input', { bubbles: true }));
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
     * キャレット位置に応じた生Markdown表示の切り替えの設定。
     * キャレットがリンクの内側にある間だけ生Markdown（`[text](url)`）を表示する。
     * `selectionchange` はdocumentにしか発火しないため、documentで監視してエディタ内かを判定する。
     * 切り替え自体がDOM・選択を変更して再度 `selectionchange` を呼ぶため、再入を抑止する。
     * Markdownの内容は展開の前後で変わらない（生テキストがそのまま直列化される）ため、
     * ここでは文書への書き戻しは行わない。
     */
    function setupRawMarkdownCaretEvent() {
        let isSyncingRawMarkdown = false;
        document.addEventListener('selectionchange', () => {
            if (isSyncingRawMarkdown ||
                state.isUpdating || state.isFormatting || state.isCreatingCodeBlock) {
                return;
            }
            isSyncingRawMarkdown = true;
            try {
                commands.syncRawMarkdownToCaret();
            } finally {
                isSyncingRawMarkdown = false;
            }
        });
    }

    /**
     * リンクの挿入・編集ダイアログの操作の設定。
     * ダイアログ内では Enter で適用、Escape でキャンセルする。
     */
    function setupLinkDialogEvents() {
        state.linkDialogOk.addEventListener('click', () => {
            commands.applyLinkDialog();
        });
        state.linkDialogCancel.addEventListener('click', () => {
            commands.closeLinkDialog();
        });
        state.linkDialogRemove.addEventListener('click', () => {
            commands.removeLinkFromDialog();
        });
        state.linkDialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commands.applyLinkDialog();
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                commands.closeLinkDialog();
            }
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
                case 'insertImagePath':
                    handleInsertImagePath(message);
                    break;
                case 'print':
                    // コマンドパレットの「Markdown: PDFとして出力」から届く
                    exportPdf();
                    break;
            }
        });
    }

    /**
     * 拡張機能側が保存した画像の相対パスを受け取り、貼り付け時のキャレット位置へ
     * `![](path)` を挿入する（クリップボード画像貼り付けの受け取り側・2/2）。
     */
    function handleInsertImagePath(message) {
        if (!message || !message.path) {
            return;
        }
        // 貼り付け時に控えたキャレット範囲を復元してから挿入する
        // （非同期応答の間にフォーカス・選択が変わっている可能性に備える）。
        // 保存先が untitled 等で応答が来ないケースの取りこぼしに備え、範囲が今も
        // エディタ内に生きているときだけ復元する（古い範囲の誤復元を避ける）。
        const range = pendingImagePasteRange;
        pendingImagePasteRange = null;
        if (range && state.editor.contains(range.startContainer)) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
        commands.insertImageMarkdown(message.path);
    }

    /**
     * 更新メッセージの処理
     */
    function handleUpdateMessage(message) {
        // ローカル画像表示用のベースURI（ドキュメントフォルダの webview URI）を取り込む。
        // ドキュメント単位で不変だが、毎回来ても上書きは無害。
        if (typeof message.imageBaseUri === 'string') {
            imageBaseUri = message.imageBaseUri;
        }

        // コードブロック作成中はスキップ
        if (state.isCreatingCodeBlock) {
            return;
        }

        // 競合する古いエコーを無視する。タイプ中に送った古い編集のエコーが、より新しい
        // ローカル編集の後に遅れて届くと、現在の内容を巻き戻してキャレットを乱すため、
        // エコーが反映する編集の seq が最新の送信 seq より小さければ破棄する。
        // （拡張機能側が seq を反映するまでは message.seq は undefined＝常に適用＝従来動作）
        if (utils.shouldIgnoreStaleUpdate(message.seq, state.editSeq)) {
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
            updateRawLineGutter();
            updateWordCount();
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

        // Mermaid図をレンダリング（非同期。描画完了後にキャレットを復元するため
        // Promiseを受け取る）
        const mermaidRenderPromise = mermaidModule.render();

        // 数式（KaTeX）をレンダリング
        mathModule.render(state.editor);

        // テーブルをレンダリング
        tableModule.render();

        // ローカル相対パス画像の src を webview URI へ解決
        resolveLocalImages(state.editor);

        // カーソル位置を復元（Mermaidの非同期描画完了後に行う。描画完了前に復元すると
        // ブロックの高さ・ノード構成が未確定でアンカーがずれ、キャレットが飛ぶため）
        if (savedPosition) {
            utils.restoreCaretAfterRender(mermaidRenderPromise, () => {
                utils.restoreCursorPosition(savedPosition);
            });
        }

        // 最新状態を記憶
        state.lastSentMarkdown = incoming;

        state.isUpdating = false;

        // 単語数・文字数の表示を更新
        updateWordCount();

        // 行番号ガターを更新（Mermaid/数式/テーブル描画後の高さで再配置）
        scheduleWysiwygGutterUpdate();

        // 見出しパンくずバーを更新（外部編集での見出し変化に追従）
        updateHeadingBreadcrumb();

        // 脚注ツールチップを閉じる（外部更新でDOMを丸ごと差し替えるため、表示中の
        // ツールチップが古い内容のまま残ったり、保留中のmouseoverタイマーが
        // detachedになった旧`sup`要素に対して発火して誤表示するのを防ぐ。
        // Raw⇔プレビュー切替の同種の全書き換え経路でも同様に閉じている）
        hideFootnoteTooltip();
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
            hideWysiwygLineGutter();
            hideHeadingBreadcrumb();
            hideSlashCommandMenu();
            hideFootnoteTooltip();
            showRawLineGutter();
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
            mathModule.render(state.editor);
            tableModule.render();
            resolveLocalImages(state.editor);
            hideRawLineGutter();
            showWysiwygLineGutter();
            updateHeadingBreadcrumb();
            state.toggleBtn.classList.remove('active');
            state.toggleBtn.innerHTML = '📄 Raw';
            state.toggleBtn.title = '生マークダウン表示切替 (Ctrl+/)';
            state.editor.focus();

            // 変更をVS Codeに通知
            postEdit(normalized);
        }

        // モード切り替え後の内容で単語数・文字数を更新
        updateWordCount();
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
            postEdit(md);

            // 行番号ガターを更新
            updateRawLineGutter();

            // 単語数・文字数の表示を更新
            updateWordCount();
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
            // 修飾キーはWin/Linuxの Ctrl と macOS の Cmd(⌘) の両方を受け付ける
            const mod = e.ctrlKey || e.metaKey;

            // Ctrl+/ (Cmd+/) でRAW/プレビューモード切り替え
            if (mod && e.key === '/') {
                e.preventDefault();
                toggleRawMode();
                return;
            }

            // Ctrl+F (Cmd+F) で検索ウィジェットを開く
            if (mod && e.key.toLowerCase() === 'f') {
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

            // F3 または Ctrl+G (Cmd+G) で次を検索
            if (e.key === 'F3' || (mod && e.key.toLowerCase() === 'g')) {
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

            // リンクの挿入・編集ダイアログ（Ctrl+K / Cmd+K）
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                commands.insertLink();
                return;
            }

            // 目次（TOC）の生成・挿入（Ctrl+Shift+O / Cmd+Shift+O）
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
                e.preventDefault();
                commands.executeCommand('toc');
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

            // アラートbox本文内でのEnter / Shift+Enter処理（末尾のEnterでboxを抜ける）
            if (commands.handleAlertEnter(e)) {
                return;
            }

            // 引用ブロック内でのEnter / Shift+Enter処理
            if (commands.handleBlockquoteEnter(e)) {
                return;
            }

            // タスクリスト項目内でのEnter処理（次のタスク項目を作成）
            if (commands.handleTaskListEnter(e)) {
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
                    case 'x':
                        // Ctrl+X（切り取り）と区別するためShift併用時のみ
                        if (e.shiftKey) {
                            e.preventDefault();
                            commands.executeCommand('strikethrough');
                        }
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
