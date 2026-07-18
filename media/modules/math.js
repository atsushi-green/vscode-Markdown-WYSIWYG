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

    const utils = window.EditorUtils;

    // レンダリング済みを示す属性（再レンダリングによる二重描画・点滅を防ぐ）
    const RENDERED_ATTR = 'data-math-rendered';

    // 右クリックメニュー（ブロック数式のPNGコピー用）。
    // markdownEditor.ts のWebview HTMLには持たせず、初回に動的生成して body へ挿す
    // （単語数バーと同じく、UI追加で拡張機能側HTMLを触らずに済ませる方針）。
    let contextMenuEl = null;
    // メニュー表示中に対象としているブロック数式（`.math-block`）。
    let currentBlock = null;

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

    /**
     * イベントの発生要素から祖先を辿り、内包する `.math-block` を返す。
     * root（＝エディタ）に達するまでに見つからなければ null。
     */
    function findMathBlock(target, root) {
        let node = target;
        while (node && node !== root) {
            if (node.classList && node.classList.contains('math-block')) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    /**
     * 右クリック位置からメニュー表示位置を決める純粋関数。
     * メニューがビューポート右端・下端からはみ出す場合は内側へ寄せる
     * （mermaid の showContextMenu と同じ調整。テスト可能なよう切り出す）。
     */
    function computeMenuPosition(clientX, clientY, menuWidth, menuHeight, viewportWidth, viewportHeight) {
        let left = clientX;
        let top = clientY;
        if (left + menuWidth > viewportWidth) {
            left = Math.max(0, viewportWidth - menuWidth - 10);
        }
        if (top + menuHeight > viewportHeight) {
            top = Math.max(0, viewportHeight - menuHeight - 10);
        }
        return { left: left, top: top };
    }

    /**
     * コンテキストメニュー（無ければ生成）を返す。
     * 見た目は mermaid のメニューと共有（editor.css の `.math-context-menu` は
     * `.mermaid-context-menu` と同じルールを参照する）。
     */
    function ensureContextMenu() {
        if (contextMenuEl && document.body.contains(contextMenuEl)) {
            return contextMenuEl;
        }
        const menu = document.createElement('div');
        menu.id = 'mathContextMenu';
        menu.className = 'math-context-menu';
        menu.style.display = 'none';
        menu.style.position = 'fixed';

        const item = document.createElement('div');
        item.className = 'math-menu-item';
        item.setAttribute('data-action', 'copyImage');
        item.textContent = '📋 画像としてコピー';
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const block = currentBlock;
            hideContextMenu();
            if (block) {
                copyBlockAsPng(block);
            }
        });
        menu.appendChild(item);

        document.body.appendChild(menu);
        contextMenuEl = menu;
        return menu;
    }

    /**
     * 指定座標へコンテキストメニューを表示し、対象ブロックを記録する。
     */
    function showContextMenu(clientX, clientY, block) {
        currentBlock = block;
        const menu = ensureContextMenu();
        menu.style.display = 'block';
        const rect = menu.getBoundingClientRect();
        const pos = computeMenuPosition(
            clientX, clientY, rect.width, rect.height,
            window.innerWidth, window.innerHeight
        );
        menu.style.left = pos.left + 'px';
        menu.style.top = pos.top + 'px';
    }

    /**
     * コンテキストメニューを閉じる。
     */
    function hideContextMenu() {
        if (contextMenuEl) {
            contextMenuEl.style.display = 'none';
        }
        currentBlock = null;
    }

    /**
     * SVGの属性値に安全に埋め込めるよう最小限のエスケープを施す。
     * 背景色（`transparent`/`#fff`/`rgb(...)` 等の短い文字列）想定。
     */
    function escapeSvgAttr(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * 数式ブロックのHTMLとCSSから、`<foreignObject>` を使ってブラウザ自身の
     * レンダリングでラスタライズするためのSVGマークアップを組み立てる純粋関数。
     *
     * 画像化に使う html2canvas は KaTeX のCSS配置（`.katex` の `vertical-align`・
     * 負マージン・絶対配置、√の overline 罫線）を再現できず数式画像が崩れるため、
     * foreignObject 方式（＝ブラウザネイティブ描画）へ移行する。実際の Image→canvas
     * ラスタライズ・KaTeXフォントの base64 埋め込み・呼び出し側差し替えは別段階(2/2)で行う。
     *
     * @param {string} innerHtml  数式ブロックのinnerHTML（KaTeX出力を含む）
     * @param {string} cssText    SVG内へインラインするCSS（KaTeXのCSS＋@font-face 等）
     * @param {number} width      描画幅(px)
     * @param {number} height     描画高(px)
     * @param {string} [background] 背景色。省略／`'transparent'` は背景塗りなし（透過）
     * @returns {string} SVG文字列（data-URI化やImageラスタライズは呼び出し側の責務）
     */
    function buildMathBlockSvgMarkup(innerHtml, cssText, width, height, background) {
        const w = Math.max(1, Math.ceil(Number(width) || 0));
        const h = Math.max(1, Math.ceil(Number(height) || 0));
        const hasBackground = background && background !== 'transparent';
        const bgRect = hasBackground
            ? '<rect x="0" y="0" width="100%" height="100%" fill="' +
                escapeSvgAttr(background) + '"/>'
            : '';
        const style = cssText ? '<style>' + cssText + '</style>' : '';
        return '<svg xmlns="http://www.w3.org/2000/svg" ' +
            'width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
            bgRect +
            '<foreignObject x="0" y="0" width="100%" height="100%">' +
            '<div xmlns="http://www.w3.org/1999/xhtml">' + style + (innerHtml || '') + '</div>' +
            '</foreignObject>' +
            '</svg>';
    }

    /**
     * ブロック数式（`.math-block`）をPNGのBlobへ変換する。
     * KaTeXの出力はSVGではなくHTML+CSSのため、mermaidのSVG→canvasは使えない。
     * 同梱の html2canvas でHTML要素を直接ラスタライズする。
     * Webフォント（KaTeXのwoff2）の読み込み完了前だと文字が崩れるため、
     * `document.fonts.ready` を待ってから描画する。
     */
    async function blockToPngBlob(block, scale) {
        if (typeof html2canvas === 'undefined') {
            throw new Error('html2canvas library not loaded');
        }

        // KaTeXのWebフォント読み込み完了を待つ（未完了だと字形が崩れる）
        if (document.fonts && document.fonts.ready) {
            try {
                await document.fonts.ready;
            } catch (e) {
                // フォント待機の失敗は致命的でないため無視して続行する
            }
        }

        const devicePixelRatio = window.devicePixelRatio || 1;
        const effectiveScale = (scale || 4) * Math.max(1, devicePixelRatio);

        // 画面外の一時コンテナへクローンを置き、余白付き・白背景で切り出す。
        // エディタ用の中央寄せ・横スクロールを外し、式全体が欠けないようにする。
        const temp = document.createElement('div');
        temp.style.position = 'absolute';
        temp.style.left = '-9999px';
        temp.style.top = '-9999px';
        temp.style.display = 'inline-block';
        temp.style.padding = '16px 24px';
        temp.style.background = '#ffffff';
        temp.style.color = '#000000';

        const clone = block.cloneNode(true);
        clone.style.margin = '0';
        clone.style.overflow = 'visible';
        clone.style.textAlign = 'left';
        temp.appendChild(clone);
        document.body.appendChild(temp);

        try {
            const canvas = await html2canvas(temp, {
                scale: effectiveScale,
                backgroundColor: '#ffffff',
                logging: false
            });
            return await new Promise(function(resolve, reject) {
                canvas.toBlob(function(blob) {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create PNG blob'));
                    }
                }, 'image/png');
            });
        } finally {
            document.body.removeChild(temp);
        }
    }

    /**
     * ブロック数式をPNGへ変換し、クリップボードへ画像としてコピーする。
     * 失敗しても例外は投げず、トーストで結果を知らせる（mermaidのコピーと同じ方針）。
     */
    async function copyBlockAsPng(block) {
        if (!block) {
            return;
        }
        try {
            const blob = await blockToPngBlob(block);
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            utils.showToast('📋 数式を画像としてクリップボードにコピーしました');
        } catch (error) {
            console.error('[Math] copy failed:', error);
            utils.showToast('⚠️ コピーに失敗しました: ' + error.message);
        }
    }

    /**
     * エディタへ右クリックメニューを配線する（editor.js の初期化から一度だけ呼ぶ）。
     * 対象がブロック数式のときだけ既定メニューを抑止して自前メニューを出す。
     */
    function setupContextMenu(editor) {
        if (!editor) {
            return;
        }
        ensureContextMenu();

        editor.addEventListener('contextmenu', function(e) {
            const block = findMathBlock(e.target, editor);
            if (!block) {
                return; // 数式ブロック以外はブラウザ既定のメニューに任せる
            }
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, block);
        });

        // メニュー外クリックで閉じる
        document.addEventListener('click', function(e) {
            if (contextMenuEl && !contextMenuEl.contains(e.target)) {
                hideContextMenu();
            }
        });
    }

    // 公開API
    return {
        isReady: isReady,
        render: render,
        setupContextMenu: setupContextMenu,
        showContextMenu: showContextMenu,
        hideContextMenu: hideContextMenu,
        copyBlockAsPng: copyBlockAsPng,
        findMathBlock: findMathBlock,
        computeMenuPosition: computeMenuPosition,
        buildMathBlockSvgMarkup: buildMathBlockSvgMarkup
    };
})();
