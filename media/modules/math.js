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

    // 画像化の背景色の選択肢（Mermaidメニューと同じ 透過／白／黒。既定は白）。
    const BACKGROUND_OPTIONS = [
        { bg: 'transparent', label: '透過', title: '透過背景' },
        { bg: 'white', label: '白', title: '白背景' },
        { bg: 'black', label: '黒', title: '黒背景' }
    ];

    /**
     * コンテキストメニューで現在選択されている背景色を解決する純粋関数。
     * `.math-bg-btn.active` の `data-bg` を読み、`'transparent'`／`'black'` のみ
     * その値を、それ以外（未選択・不正値）は `'white'`（従来動作）を返す。
     * Mermaid メニューの `resolveMenuBackground` と同じ契約。
     *
     * @param {HTMLElement} menu コンテキストメニュー要素
     * @returns {string} 'transparent' | 'white' | 'black'
     */
    function resolveMenuBackground(menu) {
        if (!menu || typeof menu.querySelector !== 'function') {
            return 'white';
        }
        const active = menu.querySelector('.math-bg-btn.active');
        const bg = active && active.getAttribute('data-bg');
        return (bg === 'transparent' || bg === 'black') ? bg : 'white';
    }

    /**
     * コンテキストメニュー（無ければ生成）を返す。
     * 見た目は mermaid のメニューと共有（editor.css の `.math-context-menu` 系は
     * `.mermaid-context-menu` 系と同じルールを参照する）。
     * 上部に背景色トグル（透過／白／黒）を持ち、その下に「画像としてコピー」を置く。
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

        // 背景色トグル行。クリックで active を移すだけ（メニューは閉じず、続けてアクションを選ぶ）。
        const bgRow = document.createElement('div');
        bgRow.className = 'math-menu-bg-row';
        const bgLabel = document.createElement('span');
        bgLabel.className = 'math-menu-bg-label';
        bgLabel.textContent = '背景';
        bgRow.appendChild(bgLabel);
        BACKGROUND_OPTIONS.forEach(function(opt) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'math-bg-btn' + (opt.bg === 'white' ? ' active' : '');
            btn.setAttribute('data-bg', opt.bg);
            btn.title = opt.title;
            btn.textContent = opt.label;
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const btns = menu.querySelectorAll('.math-bg-btn');
                Array.prototype.forEach.call(btns, function(b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
            });
            bgRow.appendChild(btn);
        });
        menu.appendChild(bgRow);

        const item = document.createElement('div');
        item.className = 'math-menu-item';
        item.setAttribute('data-action', 'copyImage');
        item.textContent = '📋 画像としてコピー';
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const block = currentBlock;
            const background = resolveMenuBackground(menu);
            hideContextMenu();
            if (block) {
                copyBlockAsPng(block, background);
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
     * KaTeX が使う woff2 フォントの一覧（`font-family`／`font-style`／`font-weight` と
     * `media/katex/fonts/` 内のファイル名）。`katex.min.css` の `@font-face` 群と一致する。
     *
     * ブロック数式の foreignObject 画像化（(2/2)）では、SVG が隔離コンテキストで描画され
     * 外部の CSS もフォントも参照できないため、これらの woff2 を base64 化して
     * `@font-face(src: url(data:font/woff2;base64,…))` として SVG 内 `<style>` へ埋め込む。
     * 実際の fetch→base64 化と CSS 組み立ての呼び出しは(2/2)の配線側で行い、
     * ここでは「どのフォントを埋め込むべきか」の静的な正の一覧として持つ。
     */
    var KATEX_FONT_MANIFEST = [
        { family: 'KaTeX_AMS', style: 'normal', weight: 400, file: 'KaTeX_AMS-Regular.woff2' },
        { family: 'KaTeX_Caligraphic', style: 'normal', weight: 400, file: 'KaTeX_Caligraphic-Regular.woff2' },
        { family: 'KaTeX_Caligraphic', style: 'normal', weight: 700, file: 'KaTeX_Caligraphic-Bold.woff2' },
        { family: 'KaTeX_Fraktur', style: 'normal', weight: 400, file: 'KaTeX_Fraktur-Regular.woff2' },
        { family: 'KaTeX_Fraktur', style: 'normal', weight: 700, file: 'KaTeX_Fraktur-Bold.woff2' },
        { family: 'KaTeX_Main', style: 'normal', weight: 400, file: 'KaTeX_Main-Regular.woff2' },
        { family: 'KaTeX_Main', style: 'normal', weight: 700, file: 'KaTeX_Main-Bold.woff2' },
        { family: 'KaTeX_Main', style: 'italic', weight: 400, file: 'KaTeX_Main-Italic.woff2' },
        { family: 'KaTeX_Main', style: 'italic', weight: 700, file: 'KaTeX_Main-BoldItalic.woff2' },
        { family: 'KaTeX_Math', style: 'italic', weight: 400, file: 'KaTeX_Math-Italic.woff2' },
        { family: 'KaTeX_Math', style: 'italic', weight: 700, file: 'KaTeX_Math-BoldItalic.woff2' },
        { family: 'KaTeX_SansSerif', style: 'normal', weight: 400, file: 'KaTeX_SansSerif-Regular.woff2' },
        { family: 'KaTeX_SansSerif', style: 'normal', weight: 700, file: 'KaTeX_SansSerif-Bold.woff2' },
        { family: 'KaTeX_SansSerif', style: 'italic', weight: 400, file: 'KaTeX_SansSerif-Italic.woff2' },
        { family: 'KaTeX_Script', style: 'normal', weight: 400, file: 'KaTeX_Script-Regular.woff2' },
        { family: 'KaTeX_Size1', style: 'normal', weight: 400, file: 'KaTeX_Size1-Regular.woff2' },
        { family: 'KaTeX_Size2', style: 'normal', weight: 400, file: 'KaTeX_Size2-Regular.woff2' },
        { family: 'KaTeX_Size3', style: 'normal', weight: 400, file: 'KaTeX_Size3-Regular.woff2' },
        { family: 'KaTeX_Size4', style: 'normal', weight: 400, file: 'KaTeX_Size4-Regular.woff2' },
        { family: 'KaTeX_Typewriter', style: 'normal', weight: 400, file: 'KaTeX_Typewriter-Regular.woff2' }
    ];

    /**
     * base64 化した woff2 フォントの配列から、`data:` URL を `src` に持つ `@font-face`
     * CSS を組み立てる純粋関数。foreignObject 画像化用に SVG 内 `<style>` へインラインする。
     *
     * `base64` が空／未指定のエントリはスキップする（fetch 失敗時に壊れた `@font-face` を
     * 出さない）。`family` は CSS を壊さないよう引用符・バックスラッシュを除去し、`style` は
     * `italic` のみ許可（他は `normal`）、`weight` は3桁の数値文字列のみ許可（他は `400`）へ
     * 正規化する。
     *
     * @param {Array<{family:string, style:string, weight:(number|string), base64:string}>} fonts
     * @returns {string} `@font-face` 群のCSS文字列（該当なしなら空文字）
     */
    function buildKatexFontFaceCss(fonts) {
        if (!Array.isArray(fonts)) {
            return '';
        }
        return fonts
            .map(function(f) {
                if (!f || !f.base64) {
                    return '';
                }
                // base64 は fetch 由来の信頼値だが、family 側と同様に防御的に
                // base64 アルファベット以外を除去して data: URL を壊さないようにする。
                var base64 = String(f.base64).replace(/[^A-Za-z0-9+/=]/g, '');
                if (!base64) {
                    return '';
                }
                var family = String(f.family || '').replace(/["\\]/g, '');
                var style = f.style === 'italic' ? 'italic' : 'normal';
                var weightStr = String(f.weight);
                var weight = /^[1-9]00$/.test(weightStr) ? weightStr : '400';
                return '@font-face{font-family:"' + family + '";font-style:' + style +
                    ';font-weight:' + weight +
                    ';src:url(data:font/woff2;base64,' + base64 + ') format("woff2");}';
            })
            .filter(function(rule) { return rule; })
            .join('');
    }

    /**
     * 読み込まれた `katex.min.css` の href から、フォント（`fonts/*.woff2`）を置く
     * ディレクトリのベースURLを導く純粋関数。CSS と同じ階層の `fonts/` を指す。
     * 例: `https://…/media/katex/katex.min.css` → `https://…/media/katex/fonts/`
     *
     * @param {string} katexCssHref  katex.min.css の絶対URL（webview URI）
     * @returns {string} フォントディレクトリのベースURL（末尾スラッシュ付き）。href が空なら空文字
     */
    function resolveKatexFontBaseUrl(katexCssHref) {
        if (!katexCssHref) {
            return '';
        }
        var slash = String(katexCssHref).lastIndexOf('/');
        var base = slash >= 0 ? String(katexCssHref).slice(0, slash + 1) : '';
        return base + 'fonts/';
    }

    /**
     * ArrayBuffer（woff2バイナリ）を base64 文字列へ変換する。
     * バイト列は 0–255 なので `btoa(String.fromCharCode(...))` で安全に符号化できる。
     * 大きなバッファでもスタック超過しないよう分割して連結する。
     *
     * @param {ArrayBuffer} buffer
     * @returns {string} base64 文字列
     */
    function arrayBufferToBase64(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        var chunk = 0x8000;
        for (var i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    // foreignObject 画像化用の @font-face CSS（fetch→base64 は初回のみ・以降キャッシュ）
    var katexFontFaceCssCache = null;

    /**
     * KaTeXフォント（woff2）を webview URI から fetch→base64 化し、`buildKatexFontFaceCss`
     * で `@font-face` CSS を組み立てて返す。一度計算したらキャッシュする。個別のフォントの
     * fetch 失敗はスキップ（そのフォントだけ埋め込まれず、他は使える）。
     * @returns {Promise<string>} `@font-face` 群のCSS（フォントが1つも取れなければ空文字）
     */
    async function loadKatexFontFaceCss() {
        if (katexFontFaceCssCache !== null) {
            return katexFontFaceCssCache;
        }
        var link = document.querySelector('link[href*="katex.min.css"]');
        var baseUrl = resolveKatexFontBaseUrl(link ? link.href : '');
        if (!baseUrl) {
            katexFontFaceCssCache = '';
            return katexFontFaceCssCache;
        }
        var fonts = [];
        await Promise.all(KATEX_FONT_MANIFEST.map(async function(entry) {
            try {
                var res = await fetch(baseUrl + entry.file);
                if (!res || !res.ok) {
                    return;
                }
                var buf = await res.arrayBuffer();
                fonts.push({
                    family: entry.family,
                    style: entry.style,
                    weight: entry.weight,
                    base64: arrayBufferToBase64(buf)
                });
            } catch (e) {
                // このフォントは埋め込めない（他フォントは続行）
            }
        }));
        var css = buildKatexFontFaceCss(fonts);
        // 全フォントを取得できたときのみキャッシュする。一過性の fetch 失敗で
        // 部分的（または空の）結果を恒久キャッシュしてしまわないよう、部分失敗時は
        // キャッシュせず次回リトライさせる。
        if (fonts.length === KATEX_FONT_MANIFEST.length) {
            katexFontFaceCssCache = css;
        }
        return css;
    }

    /**
     * 読み込み済みの KaTeX スタイルシート（`katex.min.css`）の CSS ルールを文字列化する。
     * foreignObject は隔離コンテキストで描画され外部CSSを参照できないため、`.katex` の
     * 配置ルールを SVG 内 `<style>` へインラインする必要がある。読めないシート
     * （クロスオリジン等で `cssRules` 参照が投げる）はスキップする。
     * @returns {string} KaTeX の CSS テキスト
     */
    function collectKatexCssText() {
        var out = '';
        var sheets = document.styleSheets;
        for (var i = 0; i < sheets.length; i++) {
            var sheet = sheets[i];
            if (String(sheet.href || '').indexOf('katex') === -1) {
                continue;
            }
            var rules;
            try {
                rules = sheet.cssRules;
            } catch (e) {
                continue; // 読めないシートはスキップ
            }
            if (!rules) {
                continue;
            }
            for (var j = 0; j < rules.length; j++) {
                out += rules[j].cssText;
            }
        }
        return out;
    }

    /**
     * DOMノードを foreignObject へ埋め込める XHTML 文字列へ直列化する。
     *
     * `outerHTML`（HTML直列化）は KaTeX が√の描画に使うネストした `<svg>` に
     * xmlns を付けないため、`data:image/svg+xml` として XML 解釈されると
     * `<svg>` が XHTML 名前空間の未知要素扱いになり√記号が消える。
     * XMLSerializer は名前空間宣言込みで直列化するのでこれを防げる。
     *
     * @param {Node} node  直列化するノード
     * @returns {string} 名前空間宣言付きの XHTML 文字列
     */
    function serializeNodeToXhtml(node) {
        return new XMLSerializer().serializeToString(node);
    }

    /**
     * SVGマークアップを `<img>`（`data:image/svg+xml`）経由で canvas へ描画し、PNG Blob を返す。
     *
     * **重要（実機確認前提）**: SVG に `<foreignObject>` を含む場合、Chromium は
     * セキュリティ上 canvas を "taint" することがあり、`canvas.toBlob()` が SecurityError を
     * 投げうる。その場合は呼び出し側（`blockToPngBlob`）が html2canvas へフォールバックする。
     */
    function svgMarkupToPngBlob(svgMarkup, width, height, scale) {
        return new Promise(function(resolve, reject) {
            var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
            var img = new Image();
            var settled = false;
            // 画像読み込みが load/error のどちらも発火せず止まる事故に備えた保険。
            // 発火すればフォールバック（html2canvas）へ回れる。
            var timer = setTimeout(function() {
                finish(reject, new Error('SVG image load timed out'));
            }, 15000);
            function finish(fn, arg) {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                fn(arg);
            }
            img.onload = function() {
                try {
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(width * scale));
                    canvas.height = Math.max(1, Math.round(height * scale));
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob(function(blob) {
                        if (blob) {
                            finish(resolve, blob);
                        } else {
                            finish(reject, new Error('Failed to create PNG blob'));
                        }
                    }, 'image/png');
                } catch (e) {
                    finish(reject, e); // taint による toBlob の SecurityError 等
                }
            };
            img.onerror = function() {
                finish(reject, new Error('Failed to load SVG image'));
            };
            img.src = url;
        });
    }

    /**
     * ブロック数式（`.math-block`）をPNGのBlobへ変換する。
     *
     * KaTeXの出力はSVGではなくHTML+CSSのため、まず `<foreignObject>`（ブラウザ
     * ネイティブ描画）でラスタライズし、html2canvas が再現できない `.katex` のCSS配置
     * （`vertical-align`・負マージン・絶対配置・√overline）を正確に画像化する。
     * foreignObject は隔離コンテキストのため、KaTeXのCSSを `<style>` へインラインし、
     * フォントは `loadKatexFontFaceCss` が base64 で `@font-face` として埋め込む。
     *
     * **フォールバック**: foreignObject 経路が失敗（Chromium の canvas taint による
     * `toBlob` の SecurityError、画像読み込み失敗など）した場合は、従来の html2canvas 方式へ
     * 退避する（画像は崩れうるが最低限の出力は保つ＝無リグレッション）。
     *
     * @param {HTMLElement} block  対象の `.math-block`
     * @param {number} [scale]     解像度倍率（既定4×devicePixelRatio）
     * @param {string} [background] 背景色（既定 'white'。'transparent' で透過）
     */
    async function blockToPngBlob(block, scale, background) {
        // KaTeXのWebフォント読み込み完了を待つ（画面表示スタイルの安定化）
        if (document.fonts && document.fonts.ready) {
            try {
                await document.fonts.ready;
            } catch (e) {
                // フォント待機の失敗は致命的でないため無視して続行する
            }
        }

        var devicePixelRatio = window.devicePixelRatio || 1;
        var effectiveScale = (scale || 4) * Math.max(1, devicePixelRatio);
        var bg = background || 'white';

        // 画面外に余白付き・左寄せのラッパーを置いて実寸を採寸する。
        // エディタ用の中央寄せ・横スクロールを外し、式全体が欠けないようにする。
        var temp = document.createElement('div');
        temp.style.position = 'absolute';
        temp.style.left = '-9999px';
        temp.style.top = '-9999px';
        temp.style.display = 'inline-block';

        var wrapper = document.createElement('div');
        wrapper.style.display = 'inline-block';
        wrapper.style.padding = '16px 24px';
        // KaTeX は色を明示せず currentColor を継承するため、文字色は wrapper で決める。
        // 黒背景では黒文字だと数式が見えなくなるので白文字へ反転する
        // （白・透過背景は従来どおり黒文字）。
        wrapper.style.color = (bg === 'black') ? '#ffffff' : '#000000';
        wrapper.style.textAlign = 'left';

        var clone = block.cloneNode(true);
        clone.style.margin = '0';
        clone.style.overflow = 'visible';
        clone.style.textAlign = 'left';
        // `.katex-display` の既定 margin (1em 0) は画像では過大な上下余白になる。
        // 採寸前に消して wrapper の padding だけを余白にする。
        var display = clone.querySelector('.katex-display');
        if (display) {
            display.style.margin = '0';
        }
        wrapper.appendChild(clone);
        temp.appendChild(wrapper);
        document.body.appendChild(temp);

        try {
            var rect = wrapper.getBoundingClientRect();
            var width = Math.ceil(rect.width);
            var height = Math.ceil(rect.height);

            // まず foreignObject 方式を試みる
            try {
                var fontCss = await loadKatexFontFaceCss();
                // KaTeXのCSS＋フォント埋め込みを順に置く（@font-face は後勝ちのため
                // data: URL 版が katex.min.css の相対URL版を上書きする）
                var cssText = collectKatexCssText() + fontCss;
                var xhtml = serializeNodeToXhtml(wrapper);
                var svgMarkup = buildMathBlockSvgMarkup(xhtml, cssText, width, height, bg);
                return await svgMarkupToPngBlob(svgMarkup, width, height, effectiveScale);
            } catch (foErr) {
                console.warn('[Math] foreignObject rasterize failed, falling back to html2canvas:', foErr);
                if (typeof html2canvas === 'undefined') {
                    throw foErr;
                }
                // フォールバック: 従来の html2canvas 方式（白背景・余白付き）
                var h2cBg = (bg === 'transparent') ? null : (bg === 'black' ? '#000000' : '#ffffff');
                wrapper.style.background = h2cBg || 'transparent';
                var canvas = await html2canvas(wrapper, {
                    scale: effectiveScale,
                    backgroundColor: h2cBg,
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
            }
        } finally {
            document.body.removeChild(temp);
        }
    }

    /**
     * ブロック数式をPNGへ変換し、クリップボードへ画像としてコピーする。
     * 失敗しても例外は投げず、トーストで結果を知らせる（mermaidのコピーと同じ方針）。
     *
     * @param {HTMLElement} block  対象の `.math-block`
     * @param {string} [background] 背景色（既定 'white'。'transparent' で透過、'black' で黒）
     */
    async function copyBlockAsPng(block, background) {
        if (!block) {
            return;
        }
        try {
            const blob = await blockToPngBlob(block, undefined, background);
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
        resolveMenuBackground: resolveMenuBackground,
        computeMenuPosition: computeMenuPosition,
        buildMathBlockSvgMarkup: buildMathBlockSvgMarkup,
        serializeNodeToXhtml: serializeNodeToXhtml,
        buildKatexFontFaceCss: buildKatexFontFaceCss,
        KATEX_FONT_MANIFEST: KATEX_FONT_MANIFEST,
        resolveKatexFontBaseUrl: resolveKatexFontBaseUrl,
        arrayBufferToBase64: arrayBufferToBase64,
        loadKatexFontFaceCss: loadKatexFontFaceCss
    };
})();
