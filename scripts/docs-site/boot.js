/**
 * ページ読込後にシンタックスハイライトと表の見た目を適用する。
 */
(function () {
    'use strict';

    /**
     * editor.css は `table:not(.table-rendered) { display: none; }` で、
     * media/modules/table.js（makeEditable）がインタラクティブ化するまで生の
     * <table> を隠す設計になっている。このドキュメントサイトは編集機能を持たないため
     * table.js は読み込まず、代わりに見た目だけ同じ .table-container 構造へ
     * 軽量に包んで「レンダリング済み」として表示する。
     */
    function renderTables() {
        document.querySelectorAll('#editor table:not(.table-rendered)').forEach(function (table) {
            table.classList.add('table-rendered');
            var wrapper = document.createElement('div');
            wrapper.className = 'table-wrapper';
            var container = document.createElement('div');
            container.className = 'table-container';
            table.parentNode.insertBefore(container, table);
            wrapper.appendChild(table);
            container.appendChild(wrapper);
        });
    }

    /**
     * media/modules/commands.js の highlightCodeBlock と同じ規則
     * （data-lang があれば優先、無ければ highlightAuto、mermaidは対象外）。
     */
    function highlight() {
        if (typeof hljs === 'undefined') {
            return;
        }
        document.querySelectorAll('#editor pre code').forEach(function (block) {
            var lang = block.getAttribute('data-lang');
            if (lang === 'mermaid') {
                return;
            }
            var codeText = block.textContent || '';
            if (!codeText.trim()) {
                return;
            }
            try {
                var result = (lang && hljs.getLanguage(lang))
                    ? hljs.highlight(codeText, { language: lang, ignoreIllegals: true })
                    : hljs.highlightAuto(codeText);
                if (result && result.value) {
                    block.innerHTML = result.value;
                    block.classList.add('hljs');
                }
            } catch (e) {
                console.error('[Syntax Highlight] Error:', e);
            }
        });
    }

    function init() {
        renderTables();
        highlight();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
