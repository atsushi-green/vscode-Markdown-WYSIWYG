/**
 * math.js - 数式レンダリングモジュール
 * KaTeX を使って数式（インライン `$...$` / ブロック `$$...$$`）を描画する。
 *
 * markdown.js は数式を「生の式を data-math に持つ空のコンテナ」
 * （`<span class="math-inline">` / `<div class="math-block">`）として出力するだけで、
 * KaTeX への依存を持たない（＝Markdown⇔HTMLの変換は純粋関数のままユニットテストできる）。
 * このモジュールがそのコンテナを後から走査してレンダリングする。
 * mermaid.js が `pre.mermaid-source` を図に描き替えるのと同じ役割分担。
 *
 * 直列化（htmlToMarkdown）は常に data-math を読むため、KaTeXが生成したDOMの中身は
 * Markdownへ影響しない。レンダリングに失敗しても元の式は失われない。
 */
window.MathModule = (function() {
    'use strict';

    // レンダリング済みを示す属性（再レンダリングによる二重描画・点滅を防ぐ）
    const RENDERED_ATTR = 'data-math-rendered';

    /**
     * KaTeXが読み込まれているか
     */
    function isReady() {
        return typeof window.katex !== 'undefined';
    }

    /**
     * 未レンダリングの数式コンテナを描画する。
     * 読み込み時・入力時に何度でも呼んでよい（描画済みは属性で判定してスキップする）。
     * 式が不正でも例外を投げず、KaTeX標準のエラー表示（赤字）に留める（throwOnError: false）。
     */
    function render(root) {
        if (!isReady() || !root) {
            return;
        }
        const targets = root.querySelectorAll(
            '.math-inline:not([' + RENDERED_ATTR + ']), .math-block:not([' + RENDERED_ATTR + '])'
        );
        Array.prototype.forEach.call(targets, function(el) {
            const expr = el.getAttribute('data-math') || '';
            const displayMode = el.classList.contains('math-block');
            try {
                window.katex.render(expr, el, {
                    displayMode: displayMode,
                    throwOnError: false,
                    output: 'html'
                });
            } catch (error) {
                // throwOnError:false でも構文以外の理由で落ちることがあるため、
                // その場合は生の式をそのまま見せて式が消えないようにする
                console.error('[Math] render failed:', error);
                el.textContent = displayMode ? '$$' + expr + '$$' : '$' + expr + '$';
            }
            el.setAttribute(RENDERED_ATTR, '');
        });
    }

    // 公開API
    return {
        isReady: isReady,
        render: render
    };
})();
