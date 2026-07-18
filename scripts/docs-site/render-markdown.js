'use strict';

/**
 * media/modules/markdown.js（Webview内で実際に使われている Markdown→HTML 変換器）を
 * そのまま vm サンドボックスへロードして再利用する。
 * これにより、GitHub Pages 上の静的ドキュメントも拡張機能のWYSIWYGエディタと
 * 完全に同じレンダリング結果（同じ関数・同じ規則）になる。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ZERO_WIDTH = String.fromCharCode(0x200b);

function loadMarkdownModule() {
    const markdownJsPath = path.join(__dirname, '..', '..', 'media', 'modules', 'markdown.js');
    const source = fs.readFileSync(markdownJsPath, 'utf8');

    const sandbox = {
        window: {
            // markdown.js が参照するのは EditorState.ZERO_WIDTH のみ（DOM非依存の方向＝markdownToHtml）
            EditorState: { ZERO_WIDTH: ZERO_WIDTH }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'markdown.js' });

    if (!sandbox.window.MarkdownModule || typeof sandbox.window.MarkdownModule.markdownToHtml !== 'function') {
        throw new Error('media/modules/markdown.js から MarkdownModule.markdownToHtml を取得できませんでした');
    }
    return sandbox.window.MarkdownModule;
}

module.exports = { loadMarkdownModule };
