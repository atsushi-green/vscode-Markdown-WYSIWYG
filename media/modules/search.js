/**
 * search.js - 検索ウィジェット機能モジュール
 * 検索、ハイライト、ナビゲーションを担当
 */
window.SearchModule = (function() {
    'use strict';

    const state = window.EditorState;

    /**
     * 検索ウィジェットを開く
     */
    function open() {
        state.findWidget.style.display = 'flex';
        const selectedText = window.getSelection()?.toString() || '';
        if (selectedText) {
            state.findInput.value = selectedText;
        }
        state.findInput.focus();
        state.findInput.select();
        performFind();
    }

    /**
     * 検索ウィジェットを閉じる
     */
    function close() {
        state.findWidget.style.display = 'none';
        clearHighlights();
        state.findMatches = [];
        state.currentMatchIndex = -1;
        state.findCount.textContent = '';
        state.editor.focus();
    }

    /**
     * ハイライトをクリア
     */
    function clearHighlights() {
        const highlights = document.querySelectorAll('.find-highlight');
        highlights.forEach(el => {
            const parent = el.parentNode;
            while (el.firstChild) {
                parent.insertBefore(el.firstChild, el);
            }
            parent.removeChild(el);
            parent.normalize();
        });
    }

    /**
     * 検索オプションに従って正規表現を構築する
     * 不正な正規表現の場合はnullを返す
     */
    function buildSearchRegex(searchText) {
        const flags = state.findOptions.caseSensitive ? 'g' : 'gi';
        try {
            if (state.findOptions.useRegex) {
                return new RegExp(searchText, flags);
            }
            let escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (state.findOptions.wholeWord) {
                escaped = `\\b${escaped}\\b`;
            }
            return new RegExp(escaped, flags);
        } catch (e) {
            return null;
        }
    }

    /**
     * 検索を実行
     */
    function performFind() {
        clearHighlights();
        state.findMatches = [];
        state.currentMatchIndex = -1;

        const searchText = state.findInput.value;
        if (!searchText) {
            state.findCount.textContent = '';
            return;
        }

        // 正規表現の構築失敗時はエラーを表示して終了する
        // （updateFindCountで「結果なし」に上書きしないよう、ここで打ち切る）
        const regex = buildSearchRegex(searchText);
        if (!regex) {
            state.findCount.textContent = '無効な正規表現';
            return;
        }

        if (state.isRawMode) {
            performFindInTextarea(regex);
        } else {
            performFindInDOM(regex, state.editor);
        }

        updateFindCount();
        if (state.findMatches.length > 0) {
            state.currentMatchIndex = 0;
            highlightCurrentMatch();
        }
    }

    /**
     * DOM内で検索
     * findMatchesにはドキュメント順（上から下へ）でハイライト要素を格納する。
     * 順序はTreeWalkerの走査順から決まるため、レイアウト情報に依存しない。
     */
    function performFindInDOM(regex, container) {
        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            null
        );

        const textNodes = [];
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
        }

        textNodes.forEach(node => {
            const text = node.textContent;
            let match;
            const matches = [];

            regex.lastIndex = 0;
            while ((match = regex.exec(text)) !== null) {
                matches.push({ index: match.index, length: match[0].length });
                // 空マッチ（例: 正規表現 "a*"）による無限ループを防ぐ
                if (match[0].length === 0) {
                    regex.lastIndex++;
                }
            }

            if (matches.length === 0) {
                return;
            }

            // 後ろから処理してテキストノードの分割による位置ずれを避ける
            const highlights = [];
            for (let i = matches.length - 1; i >= 0; i--) {
                const m = matches[i];
                const range = document.createRange();
                range.setStart(node, m.index);
                range.setEnd(node, m.index + m.length);

                const highlight = document.createElement('span');
                highlight.className = 'find-highlight';
                range.surroundContents(highlight);

                highlights.push(highlight);
            }

            // 逆順に収集したノード内のマッチを前から順に並べ直して追加する
            highlights.reverse().forEach(highlight => {
                state.findMatches.push(highlight);
            });
        });
    }

    /**
     * テキストエリア内で検索（RAWモード用）
     */
    function performFindInTextarea(regex) {
        const text = state.rawEditor.value;

        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(text)) !== null) {
            state.findMatches.push({ start: match.index, end: match.index + match[0].length });
            if (match[0].length === 0) {
                regex.lastIndex++;
            }
        }
    }

    /**
     * 検索カウント更新
     */
    function updateFindCount() {
        if (state.findMatches.length === 0) {
            state.findCount.textContent = state.findInput.value ? '結果なし' : '';
        } else {
            state.findCount.textContent = `${state.currentMatchIndex + 1}/${state.findMatches.length}`;
        }
    }

    /**
     * 現在のマッチをハイライト
     */
    function highlightCurrentMatch() {
        if (state.findMatches.length === 0 || state.currentMatchIndex < 0) return;

        if (state.isRawMode) {
            // RAWモードではテキストエリアの選択を使用
            const match = state.findMatches[state.currentMatchIndex];
            state.rawEditor.focus();
            state.rawEditor.setSelectionRange(match.start, match.end);
            // スクロールして表示
            const lineHeight = parseInt(getComputedStyle(state.rawEditor).lineHeight) || 20;
            const lines = state.rawEditor.value.substring(0, match.start).split('\n').length;
            state.rawEditor.scrollTop = (lines - 5) * lineHeight;
        } else {
            // WYSIWYGモードではハイライト要素を使用
            state.findMatches.forEach((el, i) => {
                if (i === state.currentMatchIndex) {
                    el.classList.add('current');
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    el.classList.remove('current');
                }
            });
        }
        updateFindCount();
    }

    /**
     * 次のマッチへ
     */
    function findNext() {
        if (state.findMatches.length === 0) return;
        state.currentMatchIndex = (state.currentMatchIndex + 1) % state.findMatches.length;
        highlightCurrentMatch();
    }

    /**
     * 前のマッチへ
     */
    function findPrev() {
        if (state.findMatches.length === 0) return;
        state.currentMatchIndex = (state.currentMatchIndex - 1 + state.findMatches.length) % state.findMatches.length;
        highlightCurrentMatch();
    }

    /**
     * 置換後にエディタ内容の変更を編集フローへ通知する。
     * editor.js の input リスナーが文書への書き戻し・再整形を行う（このモジュールは
     * 直接同期しない）。ユニットテストでは editor.js 未ロードのため副作用は無い。
     */
    function notifyEdited(target) {
        target.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /**
     * 現在のマッチを置換文字列（置換なら空文字も可）で置き換える。
     * 置換は常にリテラル（置換入力の文字列そのまま）。置換後は再検索して
     * ハイライトを更新し、残りの先頭マッチへ移動する。
     */
    function replaceCurrent() {
        if (state.findMatches.length === 0 || state.currentMatchIndex < 0) {
            return;
        }
        const replacement = state.replaceInput ? state.replaceInput.value : '';

        if (state.isRawMode) {
            const match = state.findMatches[state.currentMatchIndex];
            const value = state.rawEditor.value;
            state.rawEditor.value =
                value.slice(0, match.start) + replacement + value.slice(match.end);
            notifyEdited(state.rawEditor);
        } else {
            const el = state.findMatches[state.currentMatchIndex];
            const parent = el.parentNode;
            if (!parent) {
                return;
            }
            parent.replaceChild(document.createTextNode(replacement), el);
            parent.normalize();
            notifyEdited(state.editor);
        }

        performFind();
    }

    /**
     * すべてのマッチをまとめて置換する。
     * WYSIWYGモードは検出済みハイライト要素を、RAWモードは検索正規表現（グローバル）を
     * 用いて一括置換する。置換文字列はリテラル。
     */
    function replaceAll() {
        if (state.findMatches.length === 0) {
            return;
        }
        const replacement = state.replaceInput ? state.replaceInput.value : '';

        if (state.isRawMode) {
            const regex = buildSearchRegex(state.findInput.value);
            if (!regex) {
                return;
            }
            // リテラル置換にするため置換関数で固定文字列を返す（$&等を無効化）
            state.rawEditor.value = state.rawEditor.value.replace(regex, () => replacement);
            notifyEdited(state.rawEditor);
        } else {
            state.findMatches.forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(replacement), el);
                }
            });
            state.editor.normalize();
            notifyEdited(state.editor);
        }

        performFind();
    }

    /**
     * オプションボタンのトグル
     */
    function toggleOption(option, button) {
        state.findOptions[option] = !state.findOptions[option];
        button.classList.toggle('active', state.findOptions[option]);
        performFind();
    }

    /**
     * イベントリスナーをセットアップ
     */
    function setupEventListeners() {
        // 入力イベント
        state.findInput.addEventListener('input', () => {
            performFind();
        });

        // キーダウンイベント
        state.findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    findPrev();
                } else {
                    findNext();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        });

        // オプションボタン
        state.findOptionCase.addEventListener('click', () => toggleOption('caseSensitive', state.findOptionCase));
        state.findOptionWord.addEventListener('click', () => toggleOption('wholeWord', state.findOptionWord));
        state.findOptionRegex.addEventListener('click', () => toggleOption('useRegex', state.findOptionRegex));

        // ナビゲーションボタン
        state.findPrev.addEventListener('click', findPrev);
        state.findNext.addEventListener('click', findNext);
        state.findClose.addEventListener('click', close);

        // 置換入力・ボタン
        if (state.replaceInput) {
            state.replaceInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    replaceCurrent();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                }
            });
        }
        if (state.replaceBtn) {
            state.replaceBtn.addEventListener('click', replaceCurrent);
        }
        if (state.replaceAllBtn) {
            state.replaceAllBtn.addEventListener('click', replaceAll);
        }
    }

    // 公開API
    return {
        open: open,
        close: close,
        clearHighlights: clearHighlights,
        performFind: performFind,
        findNext: findNext,
        findPrev: findPrev,
        replaceCurrent: replaceCurrent,
        replaceAll: replaceAll,
        toggleOption: toggleOption,
        setupEventListeners: setupEventListeners
    };
})();
