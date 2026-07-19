/**
 * mermaid.js - Mermaid図機能モジュール
 * Mermaid図のレンダリング、コンテキストメニュー、PNG出力を担当
 */
window.MermaidModule = (function() {
    'use strict';

    const state = window.EditorState;
    const utils = window.EditorUtils;
    const markdown = window.MarkdownModule;

    /**
     * VS Codeの現在のカラーテーマからMermaidテーマを判定
     * bodyには vscode-light / vscode-dark / vscode-high-contrast(-light) が付与される
     */
    function resolveTheme() {
        const cls = document.body.classList;
        const isLight = cls.contains('vscode-light') || cls.contains('vscode-high-contrast-light');
        return isLight ? 'default' : 'dark';
    }

    /**
     * 指定テーマでmermaid本体を初期化する（設定は常にここで一元管理）
     */
    function initializeMermaid(theme) {
        mermaid.initialize({
            startOnLoad: false,
            theme: theme,
            securityLevel: 'loose',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true
            }
        });
    }

    /**
     * Mermaidの初期化
     */
    function init() {
        if (typeof mermaid !== 'undefined') {
            initializeMermaid(resolveTheme());
            console.log('[Mermaid] Initialized with theme:', resolveTheme());
            observeThemeChange();
        }
    }

    /**
     * VS Codeのテーマ切り替えを監視し、Mermaidを再初期化・再描画する
     */
    let themeObserver = null;
    let currentTheme = null;
    function observeThemeChange() {
        if (themeObserver) {
            return;
        }
        currentTheme = resolveTheme();
        themeObserver = new MutationObserver(() => {
            const next = resolveTheme();
            if (next === currentTheme) {
                return;
            }
            currentTheme = next;
            initializeMermaid(next);
            // 既存の図を新テーマで再描画
            cleanup();
            render();
        });
        themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    /**
     * Mermaidが読み込まれたかチェック
     */
    function isReady() {
        return typeof mermaid !== 'undefined';
    }

    /**
     * Mermaidコードブロックをレンダリング
     */
    async function render() {
        if (!isReady()) {
            console.warn('[Mermaid] mermaid.js is not loaded yet');
            return;
        }

        const mermaidBlocks = state.editor.querySelectorAll('pre code[data-lang="mermaid"]');

        for (const block of mermaidBlocks) {
            const pre = block.parentElement;
            if (!pre) continue;

            // すでにレンダリング済みのコンテナがある場合はスキップ
            if (pre.nextElementSibling?.classList?.contains('mermaid-container')) {
                continue;
            }

            const mermaidCode = block.textContent.trim();
            if (!mermaidCode) continue;

            // ユニークIDを生成
            const diagramId = `mermaid-diagram-${state.mermaidIdCounter++}`;

            // Mermaidコンテナを作成
            const container = document.createElement('div');
            container.className = 'mermaid-container';
            container.setAttribute('data-mermaid-id', diagramId);
            container.setAttribute('contenteditable', 'false');

            // ツールバーを作成
            const toolbar = document.createElement('div');
            toolbar.className = 'mermaid-toolbar';
            toolbar.innerHTML = `
                <span class="mermaid-label">Mermaid</span>
                <div class="mermaid-toolbar-buttons">
                    <button class="mermaid-view-btn active" data-view="preview" title="プレビューのみ">👁️</button>
                    <button class="mermaid-view-btn" data-view="split" title="分割表示">⊞</button>
                </div>
            `;

            // 分割ビューコンテナ
            const splitView = document.createElement('div');
            splitView.className = 'mermaid-split-view';

            // ソースパネル（初期は非表示）
            const sourcePanel = document.createElement('div');
            sourcePanel.className = 'mermaid-source-panel';
            sourcePanel.style.display = 'none';

            // 編集可能なtextarea
            const sourceCode = document.createElement('textarea');
            sourceCode.className = 'mermaid-source-code';
            sourceCode.value = mermaidCode;
            sourceCode.spellcheck = false;
            sourceCode.setAttribute('data-mermaid-id', diagramId);

            // キーイベントのバブリングを防止
            sourceCode.addEventListener('keydown', (e) => e.stopPropagation());
            sourceCode.addEventListener('keyup', (e) => e.stopPropagation());
            sourceCode.addEventListener('keypress', (e) => e.stopPropagation());
            sourcePanel.appendChild(sourceCode);

            // プレビューパネル
            const previewPanel = document.createElement('div');
            previewPanel.className = 'mermaid-preview-panel';
            previewPanel.id = diagramId;

            splitView.appendChild(sourcePanel);
            splitView.appendChild(previewPanel);

            container.appendChild(toolbar);
            container.appendChild(splitView);

            // 元のコードブロックの後に挿入
            pre.insertAdjacentElement('afterend', container);
            // 元のコードブロックを非表示
            pre.style.display = 'none';
            pre.classList.add('mermaid-source');
            pre.setAttribute('data-mermaid-id', diagramId);

            // Mermaidをレンダリング
            try {
                const { svg } = await mermaid.render(diagramId + '-svg', mermaidCode);
                previewPanel.innerHTML = svg;

                // SVGにクラスを追加
                const svgElement = previewPanel.querySelector('svg');
                if (svgElement) {
                    svgElement.classList.add('mermaid-svg');
                }
            } catch (error) {
                console.error('[Mermaid] Render error:', error);
                previewPanel.innerHTML = `<div class="mermaid-error">⚠️ Mermaidレンダリングエラー: ${error.message}</div>`;
            }

            // ビュー切り替えボタンのイベント
            setupViewToggle(toolbar, sourcePanel, previewPanel, splitView);

            // 右クリックメニューイベント
            previewPanel.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e, previewPanel);
            });

            // ソースコード編集時のプレビュー更新
            setupSourceEditing(sourceCode, previewPanel, diagramId);
        }
    }

    /**
     * ビュー切り替えボタンのセットアップ
     */
    function setupViewToggle(toolbar, sourcePanel, previewPanel, splitView) {
        toolbar.querySelectorAll('.mermaid-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const view = btn.getAttribute('data-view');
                toolbar.querySelectorAll('.mermaid-view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (view === 'preview') {
                    sourcePanel.style.display = 'none';
                    previewPanel.style.flex = '1';
                    splitView.classList.remove('split-mode');
                } else {
                    sourcePanel.style.display = 'block';
                    previewPanel.style.flex = '1';
                    splitView.classList.add('split-mode');
                }
            });
        });
    }

    /**
     * ソースコード編集のセットアップ
     */
    function setupSourceEditing(sourceCode, previewPanel, diagramId) {
        let lastValidSvg = previewPanel.innerHTML;
        let updateTimeout = null;

        sourceCode.addEventListener('input', (e) => {
            e.stopPropagation();
            state.isEditingMermaid = true;

            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }

            updateTimeout = setTimeout(async () => {
                const newCode = sourceCode.value.trim();
                if (!newCode) {
                    state.isEditingMermaid = false;
                    return;
                }

                // 元のコードブロックも更新
                const originalPre = document.querySelector(`pre.mermaid-source[data-mermaid-id="${diagramId}"]`);
                if (originalPre) {
                    const codeElement = originalPre.querySelector('code');
                    if (codeElement) {
                        codeElement.textContent = newCode;
                    }
                }

                // Mermaidを再レンダリング
                try {
                    const tempContainer = document.createElement('div');
                    tempContainer.style.position = 'absolute';
                    tempContainer.style.left = '-9999px';
                    tempContainer.style.top = '-9999px';
                    document.body.appendChild(tempContainer);

                    const svgId = 'mermaid-temp-' + Date.now();
                    const { svg } = await mermaid.render(svgId, newCode);

                    document.body.removeChild(tempContainer);

                    previewPanel.innerHTML = svg;
                    lastValidSvg = svg;

                    const svgElement = previewPanel.querySelector('svg');
                    if (svgElement) {
                        svgElement.classList.add('mermaid-svg');
                    }

                    const existingError = previewPanel.querySelector('.mermaid-error');
                    if (existingError) {
                        existingError.remove();
                    }
                } catch (error) {
                    console.log('[Mermaid] Syntax error (editing):', error.message);
                    // 一時的な要素を削除
                    document.querySelectorAll('[id^="mermaid-temp-"]').forEach(el => el.remove());
                    document.querySelectorAll('[id^="dmermaid-temp-"]').forEach(el => el.remove());

                    let errorDiv = previewPanel.querySelector('.mermaid-error');
                    if (!errorDiv) {
                        errorDiv = document.createElement('div');
                        errorDiv.className = 'mermaid-error mermaid-error-inline';
                        previewPanel.insertBefore(errorDiv, previewPanel.firstChild);
                    }
                    errorDiv.textContent = `⚠️ 構文エラー: ${error.message.split('\n')[0]}`;
                }

                // 直接マークダウンをVSCodeに送信
                const cleanHtml = markdown.getCleanHtmlFromEditor();
                const md = markdown.htmlToMarkdown(cleanHtml);
                const normalized = utils.normalizeEol(md);
                state.lastSentMarkdown = normalized;
                state.vscode.postMessage({
                    type: 'edit',
                    content: normalized
                });

                state.isEditingMermaid = false;
            }, 500);
        });
    }

    /**
     * Mermaidコンテキストメニューを表示
     */
    function showContextMenu(event, previewPanel) {
        state.currentMermaidTarget = previewPanel;

        const menu = state.mermaidContextMenu;
        menu.style.display = 'block';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;

        // メニューが画面外に出ないように調整
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
    }

    /**
     * Mermaidコンテキストメニューを非表示
     */
    function hideContextMenu() {
        state.mermaidContextMenu.style.display = 'none';
        state.currentMermaidTarget = null;
    }

    /**
     * 画像化の背景指定（`'transparent'`/`'white'`/`'black'`）を、キャンバス／html2canvas
     * 用の設定へ変換する純粋関数。
     * - `'transparent'`: alpha 有効のキャンバスにして塗りつぶさない（透過PNG）。html2canvas
     *   側の中間ラスタライズでも白を焼き込まないよう背景を `null` にする。
     * - `'white'`/`'black'`: 不透明キャンバスに該当色を塗る（従来と同じ塗りつぶし方式）。
     * - 未指定・未知の値: `'white'`（従来動作）へフォールバックする。
     * @param {string} [background]
     * @returns {{ alpha: boolean, fillColor: (string|null), html2canvasBackground: (string|null) }}
     */
    function resolveImageBackground(background) {
        if (background === 'transparent') {
            return { alpha: true, fillColor: null, html2canvasBackground: null };
        }
        if (background === 'black') {
            return { alpha: false, fillColor: '#000000', html2canvasBackground: '#000000' };
        }
        // 'white' / 未指定 / 未知 → 白（従来動作）
        return { alpha: false, fillColor: '#ffffff', html2canvasBackground: '#ffffff' };
    }

    /**
     * 画像化の背景指定に合ったMermaidテーマを解決する純粋関数。
     * 画面がダークテーマのままのSVGを白／透過背景に載せると「白地に真っ黒なブロック」
     * になるため、背景が明るい（`'white'`/`'transparent'`）ときは `'default'`（ライト）、
     * `'black'` のときは `'dark'` を書き出しに使う。
     * @param {string} [background] 'transparent' | 'white' | 'black'
     * @returns {string} Mermaidテーマ名（'default' | 'dark'）
     */
    function resolveExportTheme(background) {
        return background === 'black' ? 'dark' : 'default';
    }

    /**
     * 画像化用に、背景に合ったテーマのSVGを用意する。
     * 画面表示のテーマと一致する場合は画面上のSVGをそのまま使い、異なる場合は
     * ソースコードから一時的に再レンダリングする（画面表示は変更しない）。
     * @param {HTMLElement} previewPanel 図のプレビューパネル（id = diagramId）
     * @param {string} background 'transparent' | 'white' | 'black'
     * @returns {Promise<{ svg: SVGElement, cleanup: function }|null>}
     */
    async function createExportSvg(previewPanel, background) {
        const onScreenSvg = previewPanel.querySelector('svg');
        if (!onScreenSvg) {
            return null;
        }

        const exportTheme = resolveExportTheme(background);
        const screenTheme = resolveTheme();
        if (exportTheme === screenTheme) {
            return { svg: onScreenSvg, cleanup: () => {} };
        }

        // ソースコードを取得（編集時に同期されている元のコードブロックから）
        const sourcePre = document.querySelector(`pre.mermaid-source[data-mermaid-id="${previewPanel.id}"] code`);
        const code = sourcePre ? sourcePre.textContent.trim() : '';
        if (!code) {
            console.warn('[Mermaid] Source not found; exporting on-screen SVG as-is');
            return { svg: onScreenSvg, cleanup: () => {} };
        }

        const holder = document.createElement('div');
        holder.style.position = 'absolute';
        holder.style.left = '-9999px';
        holder.style.top = '-9999px';
        holder.style.width = `${previewPanel.clientWidth || 800}px`;
        document.body.appendChild(holder);

        try {
            initializeMermaid(exportTheme);
            const { svg } = await mermaid.render(`mermaid-export-${Date.now()}`, code);
            holder.innerHTML = svg;
        } catch (error) {
            console.error('[Mermaid] Export re-render failed; falling back to on-screen SVG:', error);
            document.body.removeChild(holder);
            document.querySelectorAll('[id^="mermaid-export-"], [id^="dmermaid-export-"]').forEach(el => el.remove());
            return { svg: onScreenSvg, cleanup: () => {} };
        } finally {
            // 画面表示用のテーマへ必ず戻す
            initializeMermaid(screenTheme);
        }

        const exportSvg = holder.querySelector('svg');
        if (!exportSvg) {
            document.body.removeChild(holder);
            return { svg: onScreenSvg, cleanup: () => {} };
        }
        return {
            svg: exportSvg,
            cleanup: () => {
                if (holder.parentElement) {
                    holder.parentElement.removeChild(holder);
                }
            }
        };
    }

    /**
     * SVGをPNG Blobに変換
     */
    async function svgToPngBlob(svgElement, scale = 4, background = 'white') {
        const bg = resolveImageBackground(background);
        return new Promise(async (resolve, reject) => {
            try {
                if (typeof html2canvas === 'undefined') {
                    console.error('[Mermaid] html2canvas not available');
                    reject(new Error('html2canvas library not loaded'));
                    return;
                }

                console.log('[Mermaid] Starting PNG conversion with scale:', scale);

                const container = svgElement.parentElement;
                if (!container) {
                    throw new Error('SVG parent element not found');
                }

                // 実際のコンテンツの境界を取得
                let contentBBox = { x: Infinity, y: Infinity, width: 0, height: 0 };
                let hasContent = false;

                try {
                    const children = svgElement.querySelectorAll('g, rect, circle, ellipse, line, polyline, polygon, path, text');
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                    children.forEach(child => {
                        try {
                            const bbox = child.getBBox();
                            if (bbox.width > 0 && bbox.height > 0) {
                                minX = Math.min(minX, bbox.x);
                                minY = Math.min(minY, bbox.y);
                                maxX = Math.max(maxX, bbox.x + bbox.width);
                                maxY = Math.max(maxY, bbox.y + bbox.height);
                                hasContent = true;
                            }
                        } catch (e) {
                            // 個別要素のbbox取得失敗は無視
                        }
                    });

                    if (hasContent) {
                        contentBBox = {
                            x: minX,
                            y: minY,
                            width: maxX - minX,
                            height: maxY - minY
                        };
                    } else {
                        contentBBox = svgElement.getBBox();
                    }
                } catch (e) {
                    console.error('[Mermaid] Error getting bbox:', e);
                    contentBBox = {
                        x: 0,
                        y: 0,
                        width: svgElement.clientWidth,
                        height: svgElement.clientHeight
                    };
                }

                const devicePixelRatio = window.devicePixelRatio || 1;
                const effectiveScale = scale * Math.max(1, devicePixelRatio);

                // 一時的なコンテナを作成
                const tempContainer = document.createElement('div');
                tempContainer.style.position = 'absolute';
                tempContainer.style.left = '-9999px';
                tempContainer.style.top = '-9999px';
                tempContainer.style.width = `${contentBBox.width}px`;
                tempContainer.style.height = `${contentBBox.height}px`;
                tempContainer.style.overflow = 'hidden';
                document.body.appendChild(tempContainer);

                // SVGのクローンを作成
                const svgClone = svgElement.cloneNode(true);
                svgClone.setAttribute('width', contentBBox.width);
                svgClone.setAttribute('height', contentBBox.height);
                svgClone.setAttribute('viewBox', `${contentBBox.x} ${contentBBox.y} ${contentBBox.width} ${contentBBox.height}`);
                tempContainer.appendChild(svgClone);

                const fullCanvas = await html2canvas(tempContainer, {
                    scale: effectiveScale,
                    backgroundColor: bg.html2canvasBackground,
                    logging: false,
                    useCORS: true,
                    allowTaint: false,
                    width: contentBBox.width,
                    height: contentBBox.height,
                    windowWidth: contentBBox.width,
                    windowHeight: contentBBox.height
                });

                document.body.removeChild(tempContainer);

                // 均等な余白を追加
                const padding = 20 * effectiveScale;
                const finalWidth = fullCanvas.width + padding * 2;
                const finalHeight = fullCanvas.height + padding * 2;

                const trimmedCanvas = document.createElement('canvas');
                trimmedCanvas.width = finalWidth;
                trimmedCanvas.height = finalHeight;

                const ctx = trimmedCanvas.getContext('2d', {
                    alpha: bg.alpha,
                    desynchronized: false,
                    colorSpace: 'srgb',
                    willReadFrequently: false
                });

                if (!ctx) {
                    throw new Error('Canvas context not available');
                }

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // 透過（fillColor が null）のときは塗りつぶさず、SVG描画の透明部分を残す。
                if (bg.fillColor) {
                    ctx.fillStyle = bg.fillColor;
                    ctx.fillRect(0, 0, finalWidth, finalHeight);
                }

                ctx.drawImage(
                    fullCanvas,
                    0, 0, fullCanvas.width, fullCanvas.height,
                    padding, padding, fullCanvas.width, fullCanvas.height
                );

                trimmedCanvas.toBlob((blob) => {
                    if (blob) {
                        console.log(`[Mermaid] PNG successfully created: ${blob.size} bytes`);
                        resolve(blob);
                    } else {
                        console.error('[Mermaid] Failed to create blob');
                        reject(new Error('Failed to create PNG blob'));
                    }
                }, 'image/png');
            } catch (error) {
                console.error('[Mermaid] svgToPngBlob error:', error);
                reject(error);
            }
        });
    }

    /**
     * クリップボードに画像をコピー
     */
    async function copyToClipboard(previewPanel, background) {
        const exportSvg = await createExportSvg(previewPanel, background);
        if (!exportSvg) {
            console.error('[Mermaid] No SVG found in preview panel');
            utils.showToast('⚠️ SVG要素が見つかりません');
            return;
        }

        console.log('[Mermaid] Copying to clipboard...');

        try {
            const blob = await svgToPngBlob(exportSvg.svg, 4, background);
            await navigator.clipboard.write([
                new ClipboardItem({
                    'image/png': blob
                })
            ]);
            utils.showToast('📋 画像をクリップボードにコピーしました');
        } catch (error) {
            console.error('[Mermaid] Copy failed:', error);
            utils.showToast(`⚠️ コピーに失敗しました: ${error.message}`);
        } finally {
            exportSvg.cleanup();
        }
    }

    /**
     * PNG画像として保存
     */
    async function saveAsPng(previewPanel, background) {
        const exportSvg = await createExportSvg(previewPanel, background);
        if (!exportSvg) {
            console.error('[Mermaid] No SVG found in preview panel');
            utils.showToast('⚠️ SVG要素が見つかりません');
            return;
        }

        console.log('[Mermaid] Saving as PNG...');

        try {
            const blob = await svgToPngBlob(exportSvg.svg, 4, background);
            console.log('[Mermaid] Blob created, converting to base64...');

            const reader = new FileReader();
            reader.onerror = (error) => {
                console.error('[Mermaid] FileReader error:', error);
                utils.showToast('⚠️ ファイル読み込みに失敗しました');
            };
            reader.onload = () => {
                try {
                    const base64 = reader.result.split(',')[1];
                    const filename = `mermaid-diagram-${Date.now()}.png`;

                    console.log('[Mermaid] Sending save request to VS Code...');
                    state.vscode.postMessage({
                        type: 'saveMermaidPng',
                        pngBase64: base64,
                        filename: filename
                    });
                } catch (error) {
                    console.error('[Mermaid] Base64 conversion error:', error);
                    utils.showToast('⚠️ データ変換に失敗しました');
                }
            };
            reader.readAsDataURL(blob);
        } catch (error) {
            console.error('[Mermaid] Save failed:', error);
            utils.showToast(`⚠️ 保存に失敗しました: ${error.message}`);
        } finally {
            exportSvg.cleanup();
        }
    }

    /**
     * Mermaidコンテナを更新（内容変更時）
     * render()はレンダリング済みブロックをスキップするため、既存の図を破棄せず
     * 新規に現れたmermaidブロックのみを描画する（キーストロークごとの全再描画を回避）。
     */
    function update() {
        if (state.isEditingMermaid) {
            return;
        }
        render();
    }

    /**
     * Mermaidコンテナをクリーンアップ
     */
    function cleanup() {
        state.editor.querySelectorAll('.mermaid-container').forEach(container => {
            container.remove();
        });
        state.editor.querySelectorAll('pre.mermaid-source').forEach(pre => {
            pre.style.display = '';
            pre.classList.remove('mermaid-source');
            pre.removeAttribute('data-mermaid-id');
        });
    }

    /**
     * コンテキストメニューで現在選択されている背景色を解決する純粋関数。
     * `.mermaid-bg-btn.active` の `data-bg` を読み、`'transparent'`／`'black'` のみ
     * その値を、それ以外（未選択・不正値）は `'white'`（従来動作）を返す。
     *
     * @param {HTMLElement} menu コンテキストメニュー要素
     * @returns {string} 'transparent' | 'white' | 'black'
     */
    function resolveMenuBackground(menu) {
        if (!menu || typeof menu.querySelector !== 'function') {
            return 'white';
        }
        const active = menu.querySelector('.mermaid-bg-btn.active');
        const bg = active && active.getAttribute('data-bg');
        return (bg === 'transparent' || bg === 'black') ? bg : 'white';
    }

    /**
     * コンテキストメニューのイベント設定
     */
    function setupContextMenuEvents() {
        const menu = state.mermaidContextMenu;
        if (!menu) return;

        // 背景色トグル: クリックで active を移す（メニューは閉じない＝この後アクションを選ぶ）
        menu.querySelectorAll('.mermaid-bg-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                menu.querySelectorAll('.mermaid-bg-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        menu.querySelectorAll('.mermaid-menu-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const action = item.getAttribute('data-action');
                const background = resolveMenuBackground(menu);
                if (state.currentMermaidTarget) {
                    if (action === 'copyImage') {
                        await copyToClipboard(state.currentMermaidTarget, background);
                    } else if (action === 'savePng') {
                        await saveAsPng(state.currentMermaidTarget, background);
                    }
                }
                hideContextMenu();
            });
        });

        // クリックでコンテキストメニューを閉じる
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                hideContextMenu();
            }
        });
    }

    // 公開API
    return {
        init: init,
        isReady: isReady,
        render: render,
        update: update,
        cleanup: cleanup,
        showContextMenu: showContextMenu,
        hideContextMenu: hideContextMenu,
        copyToClipboard: copyToClipboard,
        saveAsPng: saveAsPng,
        setupContextMenuEvents: setupContextMenuEvents,
        resolveImageBackground: resolveImageBackground,
        resolveMenuBackground: resolveMenuBackground,
        resolveExportTheme: resolveExportTheme
    };
})();
