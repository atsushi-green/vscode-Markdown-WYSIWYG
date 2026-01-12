// VS Code APIの取得
const vscode = acquireVsCodeApi();

// エディタ要素の取得
const editor = document.getElementById('editor');
const rawEditor = document.getElementById('rawEditor');
const toggleBtn = document.getElementById('toggleView');
let isUpdating = false;
let lastCursorPosition = null;
let lastSentMarkdown = '';
let isFormatting = false;
let isCreatingCodeBlock = false;
let isRawMode = false;
const ZERO_WIDTH = '\u200b';

// Mermaid関連の状態管理
let mermaidIdCounter = 0;
let currentMermaidTarget = null;
let isEditingMermaid = false; // Mermaid編集中フラグ
const mermaidContextMenu = document.getElementById('mermaidContextMenu');

// Mermaidの初期化
function initMermaid() {
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true
            }
        });
        console.log('[Mermaid] Initialized');
    }
}

// Mermaidが読み込まれたかチェック
function isMermaidReady() {
    return typeof mermaid !== 'undefined';
}

// highlight.jsが読み込まれたかチェック
function isHighlightJsReady() {
    return typeof hljs !== 'undefined';
}

// コードブロックにシンタックスハイライトを適用
function applySyntaxHighlighting() {
    if (!isHighlightJsReady()) {
        console.warn('[Syntax Highlight] highlight.js is not loaded yet');
        return;
    }

    // すべてのコードブロックを検索してハイライトを適用
    const codeBlocks = editor.querySelectorAll('pre code');

    codeBlocks.forEach((block) => {
        // 言語が指定されている場合
        const lang = block.getAttribute('data-lang');

        // mermaidは別処理
        if (lang === 'mermaid') {
            return;
        }

        // すでにハイライト済みかチェック（hljsクラスまたは子要素にspanがある）
        const hasHljsSpans = block.querySelector('span[class^="hljs-"]');
        if (block.classList.contains('hljs') || hasHljsSpans) {
            return; // スキップ
        }

        // コンテンツを取得（テキストのみ）
        const codeText = block.textContent || '';
        if (!codeText.trim()) {
            return; // 空のコードブロックはスキップ
        }

        try {
            let result;
            if (lang && hljs.getLanguage(lang)) {
                // 指定された言語でハイライト
                result = hljs.highlight(codeText, { language: lang, ignoreIllegals: true });
            } else if (lang) {
                // 言語が認識されない場合は自動検出
                result = hljs.highlightAuto(codeText);
            } else {
                // 言語指定なしの場合は自動検出
                result = hljs.highlightAuto(codeText);
            }

            if (result && result.value) {
                block.innerHTML = result.value;
                block.classList.add('hljs');
            }
        } catch (e) {
            console.error('[Syntax Highlight] Error:', e);
        }
    });
}

// ========== Mermaid図のレンダリング機能 ==========

// Mermaidコードブロックをレンダリング
async function renderMermaidDiagrams() {
    if (!isMermaidReady()) {
        console.warn('[Mermaid] mermaid.js is not loaded yet');
        return;
    }

    const mermaidBlocks = editor.querySelectorAll('pre code[data-lang="mermaid"]');

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
        const diagramId = `mermaid-diagram-${mermaidIdCounter++}`;

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
        // 編集可能なtextareaに変更
        const sourceCode = document.createElement('textarea');
        sourceCode.className = 'mermaid-source-code';
        sourceCode.value = mermaidCode;
        sourceCode.spellcheck = false;
        sourceCode.setAttribute('data-mermaid-id', diagramId);
        // キーイベントのバブリングを防止（エディタのイベントに伝播しないように）
        sourceCode.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        sourceCode.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });
        sourceCode.addEventListener('keypress', (e) => {
            e.stopPropagation();
        });
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

            // SVGにクラスを追加してスタイリング
            const svgElement = previewPanel.querySelector('svg');
            if (svgElement) {
                svgElement.classList.add('mermaid-svg');
            }
        } catch (error) {
            console.error('[Mermaid] Render error:', error);
            previewPanel.innerHTML = `<div class="mermaid-error">⚠️ Mermaidレンダリングエラー: ${error.message}</div>`;
        }

        // ビュー切り替えボタンのイベント
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

        // 右クリックメニューイベント
        previewPanel.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showMermaidContextMenu(e, previewPanel);
        });

        // 最後に成功したSVGを保持
        let lastValidSvg = previewPanel.innerHTML;

        // ソースコード編集時のプレビュー更新（デバウンス付き）
        let updateTimeout = null;
        sourceCode.addEventListener('input', (e) => {
            // イベントのバブリングを防止（エディタのinputイベントに伝播しないように）
            e.stopPropagation();

            // Mermaid編集中フラグをセット
            isEditingMermaid = true;

            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            updateTimeout = setTimeout(async () => {
                const newCode = sourceCode.value.trim();
                if (!newCode) {
                    isEditingMermaid = false;
                    return;
                }

                // 元のコードブロックも更新（ドキュメント保存用）
                const originalPre = document.querySelector(`pre.mermaid-source[data-mermaid-id="${diagramId}"]`);
                if (originalPre) {
                    const codeElement = originalPre.querySelector('code');
                    if (codeElement) {
                        codeElement.textContent = newCode;
                    }
                }

                // Mermaidを再レンダリング（安全にtry-catch）
                try {
                    // 一時的なコンテナでレンダリング（失敗してもDOMを壊さない）
                    const tempContainer = document.createElement('div');
                    tempContainer.style.position = 'absolute';
                    tempContainer.style.left = '-9999px';
                    tempContainer.style.top = '-9999px';
                    document.body.appendChild(tempContainer);

                    const svgId = 'mermaid-temp-' + Date.now();
                    const { svg } = await mermaid.render(svgId, newCode);

                    // 一時コンテナを削除
                    document.body.removeChild(tempContainer);

                    // 成功したらプレビューを更新
                    previewPanel.innerHTML = svg;
                    lastValidSvg = svg;

                    // SVGにクラスを追加
                    const svgElement = previewPanel.querySelector('svg');
                    if (svgElement) {
                        svgElement.classList.add('mermaid-svg');
                    }

                    // エラー表示をクリア
                    const existingError = previewPanel.querySelector('.mermaid-error');
                    if (existingError) {
                        existingError.remove();
                    }
                } catch (error) {
                    console.log('[Mermaid] Syntax error (editing):', error.message);
                    // エラー時は最後の有効なSVGを維持し、エラーメッセージを表示
                    // DOMに残る可能性のある一時的な要素を削除
                    const tempElements = document.querySelectorAll('[id^="mermaid-temp-"]');
                    tempElements.forEach(el => el.remove());
                    const dTemp = document.querySelectorAll('[id^="dmermaid-temp-"]');
                    dTemp.forEach(el => el.remove());

                    // エラー表示を更新（既存のSVGは維持）
                    let errorDiv = previewPanel.querySelector('.mermaid-error');
                    if (!errorDiv) {
                        errorDiv = document.createElement('div');
                        errorDiv.className = 'mermaid-error mermaid-error-inline';
                        previewPanel.insertBefore(errorDiv, previewPanel.firstChild);
                    }
                    errorDiv.textContent = `⚠️ 構文エラー: ${error.message.split('\n')[0]}`;
                }

                // 直接マークダウンをVSCodeに送信（updateDocument()を呼ばない）
                const markdown = htmlToMarkdown(editor.innerHTML);
                const normalized = normalizeEol(markdown);
                lastSentMarkdown = normalized;
                vscode.postMessage({
                    type: 'edit',
                    content: normalized
                });

                // Mermaid編集中フラグをクリア
                isEditingMermaid = false;
            }, 500); // 500ms のデバウンス
        });
    }
}

// Mermaidコンテキストメニューを表示
function showMermaidContextMenu(event, previewPanel) {
    currentMermaidTarget = previewPanel;

    mermaidContextMenu.style.display = 'block';
    mermaidContextMenu.style.left = `${event.clientX}px`;
    mermaidContextMenu.style.top = `${event.clientY}px`;

    // メニューが画面外に出ないように調整
    const rect = mermaidContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        mermaidContextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
        mermaidContextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
}

// Mermaidコンテキストメニューを非表示
function hideMermaidContextMenu() {
    mermaidContextMenu.style.display = 'none';
    currentMermaidTarget = null;
}

// SVGをPNG Blobに変換
async function svgToPngBlob(svgElement, scale = 4) {
    return new Promise(async (resolve, reject) => {
        try {
            // html2canvasが利用可能か確認
            if (typeof html2canvas === 'undefined') {
                console.error('[Mermaid] html2canvas not available');
                reject(new Error('html2canvas library not loaded'));
                return;
            }

            console.log('[Mermaid] Starting PNG conversion with scale:', scale);
            console.log('[Mermaid] SVGElement:', svgElement);

            // SVGの親要素（プレビューパネル）
            const container = svgElement.parentElement;
            if (!container) {
                throw new Error('SVG parent element not found');
            }

            console.log('[Mermaid] Container element:', container);
            console.log('[Mermaid] Container class:', container.className);
            console.log('[Mermaid] Container computed style - padding:', window.getComputedStyle(container).padding);

            // SVGの正確なサイズを取得
            const svgStyle = window.getComputedStyle(svgElement);
            const svgRect = svgElement.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            console.log(`[Mermaid] SVG getBoundingClientRect:`, {
                width: svgRect.width,
                height: svgRect.height,
                top: svgRect.top,
                left: svgRect.left
            });
            console.log(`[Mermaid] Container getBoundingClientRect:`, {
                width: containerRect.width,
                height: containerRect.height,
                top: containerRect.top,
                left: containerRect.left
            });

            // デバイスピクセル比も考慮してさらに高画質化
            const devicePixelRatio = window.devicePixelRatio || 1;
            const effectiveScale = scale * Math.max(1, devicePixelRatio);

            console.log(`[Mermaid] Device pixel ratio: ${devicePixelRatio}, Effective scale: ${effectiveScale}`);

            // プレビューパネルのみをキャプチャ
            // 実際のコンテンツの境界を取得（すべての子要素のbboxを統合）
            let contentBBox = { x: Infinity, y: Infinity, width: 0, height: 0 };
            let hasContent = false;

            try {
                // SVG内のすべての描画要素のbboxを取得
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
                    console.log(`[Mermaid] Content bbox from children: x=${contentBBox.x}, y=${contentBBox.y}, width=${contentBBox.width}, height=${contentBBox.height}`);
                } else {
                    // フォールバック: SVG全体のbboxを使用
                    contentBBox = svgElement.getBBox();
                    console.log(`[Mermaid] Using SVG bbox as fallback: ${contentBBox.width}x${contentBBox.height}`);
                }
            } catch (e) {
                console.error('[Mermaid] Error getting bbox:', e);
                // 最終フォールバック: clientサイズを使用
                contentBBox = {
                    x: 0,
                    y: 0,
                    width: svgElement.clientWidth,
                    height: svgElement.clientHeight
                };
                console.log(`[Mermaid] Using client size as fallback: ${contentBBox.width}x${contentBBox.height}`);
            }

            // SVG要素だけをhtml2canvasでキャプチャ（コンテナではなく）
            console.log('[Mermaid] Capturing SVG element directly with html2canvas...');

            // 一時的なコンテナを作成してSVGのクローンを配置
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
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: false,
                width: contentBBox.width,
                height: contentBBox.height,
                windowWidth: contentBBox.width,
                windowHeight: contentBBox.height
            });

            // 一時コンテナを削除
            document.body.removeChild(tempContainer);

            console.log(`[Mermaid] Canvas created: ${fullCanvas.width}x${fullCanvas.height}`);
            console.log(`[Mermaid] Content dimensions: ${contentBBox.width}x${contentBBox.height}`);

            // 均等な余白を追加（全ての図に適用）
            const padding = 20 * effectiveScale; // 20pxの余白
            const finalWidth = fullCanvas.width + padding * 2;
            const finalHeight = fullCanvas.height + padding * 2;

            console.log(`[Mermaid] Final dimensions with padding: ${finalWidth}x${finalHeight}`);

            // 最終キャンバス（余白付き）
            const trimmedCanvas = document.createElement('canvas');
            trimmedCanvas.width = finalWidth;
            trimmedCanvas.height = finalHeight;

            const ctx = trimmedCanvas.getContext('2d', {
                alpha: false,
                desynchronized: false,
                colorSpace: 'srgb',
                willReadFrequently: false
            });
            if (!ctx) {
                throw new Error('Canvas context not available');
            }

            // 高画質レンダリング設定
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // 背景を白で塗りつぶす
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, finalWidth, finalHeight);

            // キャプチャしたCanvasを中央に配置してコピー
            console.log(`[Mermaid] Drawing canvas at position (${padding}, ${padding})`);
            ctx.drawImage(
                fullCanvas,
                0, 0, fullCanvas.width, fullCanvas.height,
                padding, padding, fullCanvas.width, fullCanvas.height
            );

            // PNG形式で最高品質で出力（PNGは無損失なので品質パラメータは不要）
            trimmedCanvas.toBlob((blob) => {
                if (blob) {
                    console.log(`[Mermaid] ✅ PNG successfully created: ${blob.size} bytes, ${trimmedCanvas.width}x${trimmedCanvas.height}`);
                    console.log(`[Mermaid] Final resolution: ${trimmedCanvas.width}x${trimmedCanvas.height}px (scale: ${scale}, effective: ${effectiveScale}x)`);
                    resolve(blob);
                } else {
                    console.error('[Mermaid] ❌ Failed to create blob');
                    reject(new Error('Failed to create PNG blob'));
                }
            }, 'image/png');
        } catch (error) {
            console.error('[Mermaid] ❌ svgToPngBlob error:', error);
            reject(error);
        }
    });
}

// クリップボードに画像をコピー
async function copyMermaidToClipboard(previewPanel) {
    const svg = previewPanel.querySelector('svg');
    if (!svg) {
        console.error('[Mermaid] No SVG found in preview panel');
        showToast('⚠️ SVG要素が見つかりません');
        return;
    }

    console.log('[Mermaid] Copying to clipboard...', svg);

    try {
        const blob = await svgToPngBlob(svg);
        await navigator.clipboard.write([
            new ClipboardItem({
                'image/png': blob
            })
        ]);
        showToast('📋 画像をクリップボードにコピーしました');
    } catch (error) {
        console.error('[Mermaid] Copy failed:', error);
        showToast(`⚠️ コピーに失敗しました: ${error.message}`);
    }
}

// PNG画像として保存
async function saveMermaidAsPng(previewPanel) {
    const svg = previewPanel.querySelector('svg');
    if (!svg) {
        console.error('[Mermaid] No SVG found in preview panel');
        showToast('⚠️ SVG要素が見つかりません');
        return;
    }

    console.log('[Mermaid] Saving as PNG...', svg);

    try {
        const blob = await svgToPngBlob(svg);
        console.log('[Mermaid] Blob created, converting to base64...');

        // BlobをBase64に変換
        const reader = new FileReader();
        reader.onerror = (error) => {
            console.error('[Mermaid] FileReader error:', error);
            showToast('⚠️ ファイル読み込みに失敗しました');
        };
        reader.onload = () => {
            try {
                const base64 = reader.result.split(',')[1]; // "data:image/png;base64," を削除
                const filename = `mermaid-diagram-${Date.now()}.png`;

                console.log('[Mermaid] Sending save request to VS Code...');
                // VS Code APIを通じてファイル保存ダイアログを表示
                vscode.postMessage({
                    type: 'saveMermaidPng',
                    pngBase64: base64,
                    filename: filename
                });
            } catch (error) {
                console.error('[Mermaid] Base64 conversion error:', error);
                showToast('⚠️ データ変換に失敗しました');
            }
        };
        reader.readAsDataURL(blob);
    } catch (error) {
        console.error('[Mermaid] Save failed:', error);
        showToast(`⚠️ 保存に失敗しました: ${error.message}`);
        showToast('⚠️ 保存に失敗しました');
    }
}

// トースト通知を表示
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'mermaid-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 2000);
}

// コンテキストメニューのイベント設定
if (mermaidContextMenu) {
    mermaidContextMenu.querySelectorAll('.mermaid-menu-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const action = item.getAttribute('data-action');
            if (currentMermaidTarget) {
                if (action === 'copyImage') {
                    await copyMermaidToClipboard(currentMermaidTarget);
                } else if (action === 'savePng') {
                    await saveMermaidAsPng(currentMermaidTarget);
                }
            }
            hideMermaidContextMenu();
        });
    });
}

// クリックでコンテキストメニューを閉じる
document.addEventListener('click', (e) => {
    if (!mermaidContextMenu.contains(e.target)) {
        hideMermaidContextMenu();
    }
});

// Mermaidコンテナを更新（内容変更時）
function updateMermaidDiagrams() {
    // Mermaid編集中は再構築をスキップ
    if (isEditingMermaid) {
        return;
    }
    // 既存のMermaidコンテナを削除
    editor.querySelectorAll('.mermaid-container').forEach(container => {
        container.remove();
    });
    // 元のコードブロックを再表示
    editor.querySelectorAll('pre.mermaid-source').forEach(pre => {
        pre.style.display = '';
        pre.classList.remove('mermaid-source');
        pre.removeAttribute('data-mermaid-id');
    });
    // 再レンダリング
    renderMermaidDiagrams();
}

// 改行コードをLFへ正規化
const normalizeEol = (text) => text.replace(/\r\n?/g, '\n');

// カーソル位置を保存する関数
function saveCursorPosition() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editor);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    return {
        offset: preCaretRange.toString().length,
        text: preCaretRange.toString()
    };
}

// カーソル位置を復元する関数
function restoreCursorPosition(position) {
    if (!position) return;

    const selection = window.getSelection();
    const range = document.createRange();

    try {
        let currentOffset = 0;
        let found = false;

        function findOffset(node) {
            if (found) return;

            if (node.nodeType === Node.TEXT_NODE) {
                const nodeLength = node.textContent.length;
                if (currentOffset + nodeLength >= position.offset) {
                    range.setStart(node, position.offset - currentOffset);
                    range.setEnd(node, position.offset - currentOffset);
                    found = true;
                    return;
                }
                currentOffset += nodeLength;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                for (let child of node.childNodes) {
                    findOffset(child);
                    if (found) return;
                }
            }
        }

        findOffset(editor);

        if (found) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
    } catch (e) {
        console.error('Failed to restore cursor position:', e);
    }
}

// ツールバーボタンのイベントリスナー設定
document.querySelectorAll('.toolbar-btn').forEach(button => {
    button.addEventListener('click', () => {
        const command = button.getAttribute('data-command');
        executeCommand(command);
    });
});

// エディタの変更を監視
editor.addEventListener('input', () => {
    if (isUpdating || isFormatting || isCreatingCodeBlock) {
        return;
    }

    isFormatting = true;
    const savedPosition = saveCursorPosition();
    const { didFormat, caretHandled } = applyInlineFormatting();
    if (didFormat && !caretHandled && savedPosition) {
        restoreCursorPosition(savedPosition);
    }
    isFormatting = false;

    // シンタックスハイライトを適用
    applySyntaxHighlighting();

    // Mermaid図を更新
    updateMermaidDiagrams();

    const markdown = htmlToMarkdown(editor.innerHTML);
    const normalized = normalizeEol(markdown);
    // 正規化前のmarkdownを保存して、Raw切り替え時の改行損失を防ぐ
    lastSentMarkdown = normalized;
    vscode.postMessage({
        type: 'edit',
        content: normalized
    });
});

// VS Codeからのメッセージを受信
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'update':
            // コードブロック作成中はスキップ
            if (isCreatingCodeBlock) {
                return;
            }

            // 改行コードを正規化して比較
            const incoming = normalizeEol(message.content);

            // RAWモードの場合はrawEditorを更新
            if (isRawMode) {
                const currentRaw = normalizeEol(rawEditor.value);
                if (incoming !== currentRaw) {
                    isUpdating = true;
                    rawEditor.value = message.content; // 正規化前の元の値を使用
                    isUpdating = false;
                }
                lastSentMarkdown = incoming;
                return;
            }

            // 現在のエディタ内容をMarkdown化し、同一なら何もしない
            const current = normalizeEol(htmlToMarkdown(editor.innerHTML));
            if (incoming === current) {
                return;
            }

            // 自分が送信した内容と同じ場合はスキップ（無限ループ防止）
            if (incoming === lastSentMarkdown) {
                return;
            }

            // カーソル位置を保存
            const savedPosition = saveCursorPosition();

            isUpdating = true;
            const html = markdownToHtml(incoming);
            editor.innerHTML = html;

            // シンタックスハイライトを適用
            applySyntaxHighlighting();

            // Mermaid図をレンダリング
            renderMermaidDiagrams();

            // カーソル位置を復元
            if (savedPosition) {
                setTimeout(() => {
                    restoreCursorPosition(savedPosition);
                }, 0);
            }

            // 最新状態を記憶
            lastSentMarkdown = incoming;

            isUpdating = false;
            break;
    }
});

// RAW/レンダリングモードの切り替え
function toggleRawMode() {
    isRawMode = !isRawMode;

    if (isRawMode) {
        // レンダリング → RAWモード
        // lastSentMarkdownを使用して、元の改行を保持
        const markdown = lastSentMarkdown || htmlToMarkdown(editor.innerHTML);
        rawEditor.value = markdown;
        editor.style.display = 'none';
        rawEditor.style.display = 'block';
        toggleBtn.classList.add('active');
        toggleBtn.innerHTML = '👁️ Preview';
        toggleBtn.title = 'プレビュー表示に切替 (Ctrl+/)';
        rawEditor.focus();
    } else {
        // RAWモード → レンダリング
        const markdown = rawEditor.value;
        const normalized = normalizeEol(markdown);
        editor.innerHTML = markdownToHtml(normalized);
        applySyntaxHighlighting();
        renderMermaidDiagrams();
        rawEditor.style.display = 'none';
        editor.style.display = 'block';
        toggleBtn.classList.remove('active');
        toggleBtn.innerHTML = '📄 Raw';
        toggleBtn.title = '生マークダウン表示切替 (Ctrl+/)';
        editor.focus();

        // 変更をVS Codeに通知
        lastSentMarkdown = normalized;
        vscode.postMessage({
            type: 'edit',
            content: normalized
        });
    }
}

// トグルボタンのクリックイベント
toggleBtn.addEventListener('click', () => {
    toggleRawMode();
});

// RAWエディタの変更を監視
rawEditor.addEventListener('input', () => {
    if (isUpdating) {
        return;
    }

    const markdown = normalizeEol(rawEditor.value);
    lastSentMarkdown = markdown;
    vscode.postMessage({
        type: 'edit',
        content: markdown
    });
});

// ========== 検索ウィジェット機能 ==========
const findWidget = document.getElementById('findWidget');
const findInput = document.getElementById('findInput');
const findCount = document.getElementById('findCount');
const findOptionCase = document.getElementById('findOptionCase');
const findOptionWord = document.getElementById('findOptionWord');
const findOptionRegex = document.getElementById('findOptionRegex');
const findPrev = document.getElementById('findPrev');
const findNext = document.getElementById('findNext');
const findClose = document.getElementById('findClose');

let findOptions = {
    caseSensitive: false,
    wholeWord: false,
    useRegex: false
};
let findMatches = [];
let currentMatchIndex = -1;

// 検索ウィジェットを開く
function openFindWidget() {
    findWidget.style.display = 'flex';
    const selectedText = window.getSelection()?.toString() || '';
    if (selectedText) {
        findInput.value = selectedText;
    }
    findInput.focus();
    findInput.select();
    performFind();
}

// 検索ウィジェットを閉じる
function closeFindWidget() {
    findWidget.style.display = 'none';
    clearHighlights();
    findMatches = [];
    currentMatchIndex = -1;
    findCount.textContent = '';
    editor.focus();
}

// ハイライトをクリア
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

// 検索を実行
function performFind() {
    clearHighlights();
    findMatches = [];
    currentMatchIndex = -1;

    const searchText = findInput.value;
    if (!searchText) {
        findCount.textContent = '';
        return;
    }

    const targetElement = isRawMode ? rawEditor : editor;

    if (isRawMode) {
        // RAWモードではテキストエリア内を検索
        performFindInTextarea(searchText);
    } else {
        // WYSIWYGモードではDOM内を検索
        performFindInDOM(searchText, targetElement);
    }

    updateFindCount();
    if (findMatches.length > 0) {
        currentMatchIndex = 0;
        highlightCurrentMatch();
    }
}

// DOM内で検索
function performFindInDOM(searchText, container) {
    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null
    );

    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }

    let regex;
    try {
        if (findOptions.useRegex) {
            regex = new RegExp(searchText, findOptions.caseSensitive ? 'g' : 'gi');
        } else {
            let escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (findOptions.wholeWord) {
                escaped = `\\b${escaped}\\b`;
            }
            regex = new RegExp(escaped, findOptions.caseSensitive ? 'g' : 'gi');
        }
    } catch (e) {
        findCount.textContent = '無効な正規表現';
        return;
    }

    textNodes.forEach(node => {
        const text = node.textContent;
        let match;
        const matches = [];

        while ((match = regex.exec(text)) !== null) {
            matches.push({ index: match.index, length: match[0].length, text: match[0] });
        }

        if (matches.length > 0) {
            // 後ろから処理して位置がずれないようにする
            for (let i = matches.length - 1; i >= 0; i--) {
                const m = matches[i];
                const range = document.createRange();
                range.setStart(node, m.index);
                range.setEnd(node, m.index + m.length);

                const highlight = document.createElement('span');
                highlight.className = 'find-highlight';
                range.surroundContents(highlight);

                findMatches.unshift(highlight);
            }
        }
    });

    // 順序を正しくする（上から下へ）
    findMatches.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        if (rectA.top !== rectB.top) return rectA.top - rectB.top;
        return rectA.left - rectB.left;
    });
}

// テキストエリア内で検索（RAWモード用）
function performFindInTextarea(searchText) {
    const text = rawEditor.value;
    let regex;
    try {
        if (findOptions.useRegex) {
            regex = new RegExp(searchText, findOptions.caseSensitive ? 'g' : 'gi');
        } else {
            let escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (findOptions.wholeWord) {
                escaped = `\\b${escaped}\\b`;
            }
            regex = new RegExp(escaped, findOptions.caseSensitive ? 'g' : 'gi');
        }
    } catch (e) {
        findCount.textContent = '無効な正規表現';
        return;
    }

    let match;
    while ((match = regex.exec(text)) !== null) {
        findMatches.push({ start: match.index, end: match.index + match[0].length });
    }
}

// 検索カウント更新
function updateFindCount() {
    if (findMatches.length === 0) {
        findCount.textContent = findInput.value ? '結果なし' : '';
    } else {
        findCount.textContent = `${currentMatchIndex + 1}/${findMatches.length}`;
    }
}

// 現在のマッチをハイライト
function highlightCurrentMatch() {
    if (findMatches.length === 0 || currentMatchIndex < 0) return;

    if (isRawMode) {
        // RAWモードではテキストエリアの選択を使用
        const match = findMatches[currentMatchIndex];
        rawEditor.focus();
        rawEditor.setSelectionRange(match.start, match.end);
        // スクロールして表示
        const lineHeight = parseInt(getComputedStyle(rawEditor).lineHeight) || 20;
        const lines = rawEditor.value.substring(0, match.start).split('\n').length;
        rawEditor.scrollTop = (lines - 5) * lineHeight;
    } else {
        // WYSIWYGモードではハイライト要素を使用
        findMatches.forEach((el, i) => {
            if (i === currentMatchIndex) {
                el.classList.add('current');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                el.classList.remove('current');
            }
        });
    }
    updateFindCount();
}

// 次のマッチへ
function findNextMatch() {
    if (findMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % findMatches.length;
    highlightCurrentMatch();
}

// 前のマッチへ
function findPrevMatch() {
    if (findMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + findMatches.length) % findMatches.length;
    highlightCurrentMatch();
}

// オプションボタンのトグル
function toggleFindOption(option, button) {
    findOptions[option] = !findOptions[option];
    button.classList.toggle('active', findOptions[option]);
    performFind();
}

// イベントリスナー
findInput.addEventListener('input', () => {
    performFind();
});

findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            findPrevMatch();
        } else {
            findNextMatch();
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeFindWidget();
    }
});

findOptionCase.addEventListener('click', () => toggleFindOption('caseSensitive', findOptionCase));
findOptionWord.addEventListener('click', () => toggleFindOption('wholeWord', findOptionWord));
findOptionRegex.addEventListener('click', () => toggleFindOption('useRegex', findOptionRegex));

findPrev.addEventListener('click', findPrevMatch);
findNext.addEventListener('click', findNextMatch);
findClose.addEventListener('click', closeFindWidget);

// グローバルキーボードショートカット
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
        openFindWidget();
        return;
    }
    // Escape で検索ウィジェットを閉じる
    if (e.key === 'Escape' && findWidget.style.display !== 'none') {
        e.preventDefault();
        closeFindWidget();
        return;
    }
    // Alt+C で大文字/小文字オプション
    if (e.altKey && e.key === 'c') {
        e.preventDefault();
        toggleFindOption('caseSensitive', findOptionCase);
        return;
    }
    // Alt+W で単語単位オプション
    if (e.altKey && e.key === 'w') {
        e.preventDefault();
        toggleFindOption('wholeWord', findOptionWord);
        return;
    }
    // Alt+R で正規表現オプション
    if (e.altKey && e.key === 'r') {
        e.preventDefault();
        toggleFindOption('useRegex', findOptionRegex);
        return;
    }
    // F3 または Ctrl+G で次を検索
    if (e.key === 'F3' || (e.ctrlKey && e.key === 'g')) {
        e.preventDefault();
        if (e.shiftKey) {
            findPrevMatch();
        } else {
            findNextMatch();
        }
        return;
    }
});

// コマンドの実行
function executeCommand(command) {
    document.execCommand('styleWithCSS', false, false);

    switch (command) {
        case 'bold':
            document.execCommand('bold', false, null);
            break;
        case 'italic':
            document.execCommand('italic', false, null);
            break;
        case 'underline':
            // Markdownには下線がないため、代わりに強調表示
            document.execCommand('bold', false, null);
            break;
        case 'h1':
            formatHeading(1);
            break;
        case 'h2':
            formatHeading(2);
            break;
        case 'h3':
            formatHeading(3);
            break;
        case 'ul':
            document.execCommand('insertUnorderedList', false, null);
            break;
        case 'ol':
            document.execCommand('insertOrderedList', false, null);
            break;
        case 'link':
            insertLink();
            break;
        case 'code':
            insertCodeBlock();
            break;
        case 'quote':
            insertBlockquote();
            break;
    }

    editor.focus();
}

// 見出しのフォーマット
function formatHeading(level) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const element = range.commonAncestorContainer.parentElement;

    // 既存の見出しタグをクリア
    if (element && element.tagName && element.tagName.match(/^H[1-6]$/)) {
        document.execCommand('formatBlock', false, 'p');
    }

    // 新しい見出しを適用
    document.execCommand('formatBlock', false, `h${level}`);
}

// リンクの挿入
function insertLink() {
    const url = prompt('リンクURLを入力してください:', 'https://');
    if (url) {
        document.execCommand('createLink', false, url);
    }
}

// コードブロックの挿入
function insertCodeBlock() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = selection.toString() || 'コードをここに入力';
    pre.appendChild(code);

    range.deleteContents();
    range.insertNode(pre);
}

// 引用の挿入
function insertBlockquote() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const blockquote = document.createElement('blockquote');
    blockquote.textContent = selection.toString() || '引用テキスト';

    range.deleteContents();
    range.insertNode(blockquote);
}

// MarkdownからHTMLへの変換（基本的な変換）
function markdownToHtml(markdown) {
    let html = markdown;

    // コードブロックを一時的に保護（改行を保持するため）
    const codeBlocks = [];
    html = html.replace(/```(\S*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const language = (lang || '').trim();
        const safeClass = language.replace(/[^\w-]+/g, '');
        const classAttr = safeClass ? ` class="language-${safeClass}"` : '';
        const dataAttr = language ? ` data-lang="${language}"` : '';

        // コード内容をエスケープ
        const escapedCode = code.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // ユニークなプレースホルダー（エスケープや他の処理の影響を受けにくい文字列）
        const placeholder = `\u0000CODEBLOCK${codeBlocks.length}\u0000`;
        codeBlocks.push(`<pre><code${classAttr}${dataAttr}>${escapedCode}</code></pre>`);
        return placeholder;
    });

    // エスケープ処理
    html = html.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(new RegExp(ZERO_WIDTH, 'g'), '');

    // 見出し（#マークを表示して残す）
    html = html.replace(/^###### (.*$)/gim, '<h6><span class="heading-hash">###### </span>$1</h6>');
    html = html.replace(/^##### (.*$)/gim, '<h5><span class="heading-hash">##### </span>$1</h5>');
    html = html.replace(/^#### (.*$)/gim, '<h4><span class="heading-hash">#### </span>$1</h4>');
    html = html.replace(/^### (.*$)/gim, '<h3><span class="heading-hash">### </span>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2><span class="heading-hash">## </span>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1><span class="heading-hash"># </span>$1</h1>');

    // 太字と斜体
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\_\_\_(.*?)\_\_\_/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\_\_(.*?)\_\_/g, '<strong>$1</strong>');
    html = html.replace(/\_(.*?)\_/g, '<em>$1</em>');

    // リンク
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // インラインコード
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 引用
    html = html.replace(/^&gt; (.*$)/gim, '<blockquote>$1</blockquote>');

    // リスト（番号なし）
    html = html.replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>');

    // リスト（番号付き）
    html = html.replace(/^\d+\. (.*$)/gim, '<ol><li>$1</li></ol>');

    // 連続するリストをマージ
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    html = html.replace(/<\/ol>\s*<ol>/g, '');

    // 段落
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    // コードブロックを復元（改行が保持されている）
    codeBlocks.forEach((block, index) => {
        const placeholder = `\u0000CODEBLOCK${index}\u0000`;
        html = html.replace(placeholder, block);
    });

    // 全体をpタグで囲む（既にタグがない部分のみ）
    if (!html.startsWith('<')) {
        html = '<p>' + html + '</p>';
    }

    return html;
}

// HTMLからMarkdownへの変換
function htmlToMarkdown(html) {
    let markdown = html.replace(new RegExp(ZERO_WIDTH, 'g'), '');

    // heading-hashスパンを削除（#マークはMarkdownに含めるが、spanは削除）
    markdown = markdown.replace(/<span class="heading-hash">[^<]*<\/span>/gi, '');

    // 見出し
    markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n\n');
    markdown = markdown.replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n\n');
    markdown = markdown.replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n\n');

    // 太字と斜体
    markdown = markdown.replace(/<strong><em>(.*?)<\/em><\/strong>/gi, '***$1***');
    markdown = markdown.replace(/<em><strong>(.*?)<\/strong><\/em>/gi, '***$1***');
    markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i>(.*?)<\/i>/gi, '*$1*');

    // リンク
    markdown = markdown.replace(/<a href="([^"]+)">(.*?)<\/a>/gi, '[$2]($1)');

    // コードブロック（言語指定を保持）
    markdown = markdown.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/gi, (match, attrs, content) => {
        const languageFromData = /data-lang="([^"]+)"/i.exec(attrs);
        const languageFromClass = /class="[^"]*language-([^\s"]+)/i.exec(attrs);
        const language = (languageFromData?.[1] || languageFromClass?.[1] || '').trim();

        // highlight.jsによって追加されたHTMLタグを除去してプレーンテキストに戻す
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';

        // コードブロック内の改行はそのまま保持（末尾の改行も削除しない）
        const codeBody = plainText.replace(/<br\s*\/?>\n?/gi, '\n');
        // 末尾の改行を削除しない
        const fence = language
            ? `\`\`\`${language}\n${codeBody}\`\`\`\n\n`
            : `\`\`\`\n${codeBody}\`\`\`\n\n`;
        return fence;
    });
    markdown = markdown.replace(/<code>(.*?)<\/code>/gi, '`$1`');

    // 引用
    markdown = markdown.replace(/<blockquote>(.*?)<\/blockquote>/gi, '> $1\n\n');

    // リスト
    markdown = markdown.replace(/<ul>(.*?)<\/ul>/gis, (match, content) => {
        return content.replace(/<li>(.*?)<\/li>/gi, '* $1\n');
    });
    markdown = markdown.replace(/<ol>(.*?)<\/ol>/gis, (match, content) => {
        let index = 1;
        return content.replace(/<li>(.*?)<\/li>/gi, () => `${index++}. ${RegExp.$1}\n`);
    });

    // 段落と改行
    markdown = markdown.replace(/<\/p><p>/gi, '\n\n');
    markdown = markdown.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    markdown = markdown.replace(/<div>(.*?)<\/div>/gi, '$1\n');

    // HTMLタグの除去
    markdown = markdown.replace(/<[^>]+>/g, '');

    // HTMLエンティティのデコード
    markdown = markdown.replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ');

    // 余分な空行を削除（ただし、末尾の改行は保持）
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    // 末尾の余分な空行を削除しつつ、最後の改行1つは保持
    markdown = markdown.replace(/\n+$/g, (match) => {
        return match.length > 0 ? '\n' : '';
    });

    return markdown;
}

// キーボードショートカット
editor.addEventListener('keydown', (e) => {
    if (handleInlineCodeExitRight(e)) {
        return;
    }

    if (handleAutoBlock(e)) {
        return;
    }

    if (handleCodeFence(e)) {
        return;
    }

    // 見出しの確定処理（Enterキー）
    if (handleHeadingConfirm(e)) {
        return;
    }

    // コードブロック内でのEnterキー処理
    if (e.key === 'Enter' && !e.shiftKey) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            // カーソルがPRE/CODE内にいるか確認
            const preElement = findAncestor(range.startContainer, (el) => el.nodeName === 'PRE');
            if (preElement) {
                // コードブロック内では改行文字のみを挿入
                e.preventDefault();

                // 改行テキストノードを挿入
                const textNode = document.createTextNode('\n');
                range.deleteContents();
                range.insertNode(textNode);

                // カーソルを改行の後ろに移動
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);

                // 変更を通知
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
        }
        // コードブロック外ではデフォルトの改行動作を許可
        return;
    }

    if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
            case 'b':
                e.preventDefault();
                executeCommand('bold');
                break;
            case 'i':
                e.preventDefault();
                executeCommand('italic');
                break;
            case 'u':
                e.preventDefault();
                executeCommand('underline');
                break;
        }
    }
});

// インラインコード末尾で→押下時にコード外へキャレットを移動
function handleInlineCodeExitRight(event) {
    if (event.key !== 'ArrowRight' || event.ctrlKey || event.metaKey || event.altKey) {
        return false;
    }

    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
        return false;
    }

    const range = selection.getRangeAt(0);
    const { endContainer, endOffset } = range;

    // ケース1: キャレットがコード内にあり末尾
    let codeEl = findAncestor(endContainer, (el) => el.nodeName === 'CODE');
    let inPre = findAncestor(endContainer, (el) => el.nodeName === 'PRE');
    let atEnd = false;

    if (codeEl && !inPre) {
        atEnd = (() => {
            if (endContainer.nodeType === Node.TEXT_NODE) {
                return endOffset === endContainer.textContent.length && codeEl.contains(endContainer);
            }
            if (endContainer === codeEl) {
                return endOffset === codeEl.childNodes.length;
            }
            return false;
        })();
    }

    // ケース2: キャレットがコード直後（兄弟としてCODEが直前）
    if (!atEnd) {
        const siblingInfo = findCodeBeforeCaret(endContainer, endOffset);
        if (siblingInfo) {
            codeEl = siblingInfo;
            inPre = findAncestor(codeEl, (el) => el.nodeName === 'PRE');
            if (inPre) {
                return false;
            }
            atEnd = true;
        }
    }

    if (!codeEl || inPre || !atEnd) {
        return false;
    }

    event.preventDefault();

    const nextText = ensureTrailingTextNode(codeEl);

    const after = document.createRange();
    if (nextText) {
        const len = nextText.textContent.length;
        after.setStart(nextText, Math.min(len, len === 0 ? 0 : len));
    } else {
        after.setStartAfter(codeEl);
    }
    after.collapse(true);
    selection.removeAllRanges();
    selection.addRange(after);
    editor.focus();

    return true;
}

// 先頭プレフィックス入力でブロックを変換
function handleAutoBlock(event) {
    if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) {
        return false;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return false;
    }

    const range = selection.getRangeAt(0);
    const block = findBlockAncestor(range.startContainer);
    if (!block) {
        return false;
    }

    const textBefore = getTextBeforeCaret(block, range);
    const remaining = block.textContent.slice(textBefore.length).replace(/^\s+/, '');
    const trimmed = textBefore.trim();

    const unordered = /^[-*]$/.test(trimmed);
    const ordered = /^\d+\.$/.test(trimmed);
    // 見出しはスペースで変換しない（Enterで確定）
    const quote = /^>$/.test(trimmed);

    if (!unordered && !ordered && !quote) {
        return false;
    }

    event.preventDefault();

    if (unordered || ordered) {
        const list = document.createElement(ordered ? 'ol' : 'ul');
        const li = document.createElement('li');
        li.textContent = remaining;
        list.appendChild(li);
        block.replaceWith(list);
        placeCaretAt(li, 0);
        return true;
    }

    if (quote) {
        const bq = document.createElement('blockquote');
        bq.textContent = remaining;
        block.replaceWith(bq);
        placeCaretAt(bq, 0);
        return true;
    }

    return false;
}

// ``` の直後にEnterでコードブロック化
function handleCodeFence(event) {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey) {
        return false;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return false;
    }

    const range = selection.getRangeAt(0);
    const block = findBlockAncestor(range.startContainer);
    if (!block) {
        return false;
    }

    const text = block.textContent.trim();
    const match = /^```(\S+)?$/.exec(text);
    if (!match) {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();

    const language = (match[1] || '').trim();
    const safeClass = language.replace(/[^\w-]+/g, '');

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    if (language) {
        code.setAttribute('data-lang', language);
    }
    if (safeClass) {
        code.classList.add(`language-${safeClass}`);
    }
    // 空のテキストノードではなくゼロ幅スペースを入れてカーソルを配置可能にする
    const textNode = document.createTextNode(ZERO_WIDTH);
    code.appendChild(textNode);
    pre.appendChild(code);

    isCreatingCodeBlock = true;
    block.replaceWith(pre);

    // カーソル配置を複数回試行して確実にコードブロック内に配置
    function placeCaretInCode() {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(textNode, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
    }

    placeCaretInCode();

    setTimeout(() => {
        placeCaretInCode();
        editor.focus();
    }, 0);

    setTimeout(() => {
        placeCaretInCode();
    }, 10);

    setTimeout(() => {
        placeCaretInCode();
    }, 50);

    // フラグをリセット（VS Codeからの応答を待つため十分な時間を確保）
    setTimeout(() => {
        isCreatingCodeBlock = false;
    }, 200);

    return true;
}

// 見出しの確定処理（Enterキーで確定）
function handleHeadingConfirm(event) {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return false;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return false;
    }

    const range = selection.getRangeAt(0);
    const block = findBlockAncestor(range.startContainer);
    if (!block) {
        return false;
    }

    const text = block.textContent;
    // 見出しパターン: # から ###### まで、その後にスペースと内容
    const match = /^(#{1,6})\s+(.*)$/.exec(text);
    if (!match) {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();

    const level = match[1].length;
    const content = match[2];
    const hashMarks = '#'.repeat(level);

    // 見出し要素を作成（#マークを残して表示）
    const h = document.createElement(`h${level}`);

    // #マーク用のspanを作成
    const hashSpan = document.createElement('span');
    hashSpan.className = 'heading-hash';
    hashSpan.textContent = hashMarks + ' ';
    h.appendChild(hashSpan);

    // 見出しの内容を追加
    const contentText = document.createTextNode(content);
    h.appendChild(contentText);

    block.replaceWith(h);

    // 見出しの後に新しい段落を作成してカーソルを移動
    const newP = document.createElement('p');
    const br = document.createElement('br');
    newP.appendChild(br);
    h.insertAdjacentElement('afterend', newP);

    // 新しい段落にカーソルを配置
    const newRange = document.createRange();
    newRange.setStart(newP, 0);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
    editor.focus();

    // 変更を通知
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    return true;
}

function findBlockAncestor(node) {
    let current = node;
    while (current && current !== editor) {
        if (current.nodeType === Node.ELEMENT_NODE) {
            const tag = current.tagName;
            if (tag === 'P' || tag === 'DIV' || tag === 'LI') {
                return current;
            }
        }
        current = current.parentNode;
    }
    return null;
}

function getTextBeforeCaret(block, range) {
    const clone = range.cloneRange();
    clone.selectNodeContents(block);
    clone.setEnd(range.startContainer, range.startOffset);
    return clone.toString();
}

function placeCaretAt(node, offset) {
    const selection = window.getSelection();
    const range = document.createRange();

    if (!node.firstChild) {
        node.appendChild(document.createTextNode(''));
    }

    const target = node.firstChild;
    range.setStart(target, Math.min(offset, target.textContent.length));
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
}

// インラインマークダウンを即時反映
function applyInlineFormatting() {
    return walkInline(editor);
}

function walkInline(root) {
    const selection = window.getSelection();
    const focusNode = selection ? selection.focusNode : null;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const toReplace = [];
    let caretHandled = false;

    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (shouldSkipInline(node)) {
            continue;
        }

        const converted = convertInlineText(node.textContent);
        if (converted !== node.textContent) {
            toReplace.push({ node, html: converted });
        }
    }

    toReplace.forEach(({ node, html }) => {
        const span = document.createElement('span');
        span.innerHTML = html;
        let lastInserted = null;
        while (span.firstChild) {
            lastInserted = span.firstChild;
            node.parentNode.insertBefore(span.firstChild, node);
        }
        node.parentNode.removeChild(node);

        if (!caretHandled && node === focusNode && lastInserted) {
            const range = document.createRange();
            range.setStartAfter(lastInserted);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            caretHandled = true;
        }
    });

    return {
        didFormat: toReplace.length > 0,
        caretHandled
    };
}

function findAncestor(start, predicate) {
    let current = start;
    while (current && current !== editor) {
        if (current.nodeType === Node.ELEMENT_NODE && predicate(current)) {
            return current;
        }
        current = current.parentNode;
    }
    return null;
}

function ensureTrailingTextNode(codeEl) {
    const parent = codeEl.parentNode;
    if (!parent) {
        return null;
    }

    const next = codeEl.nextSibling;
    if (next && next.nodeType === Node.TEXT_NODE) {
        return next;
    }

    const text = document.createTextNode(ZERO_WIDTH);
    parent.insertBefore(text, codeEl.nextSibling);
    return text;
}

function findCodeBeforeCaret(container, offset) {
    if (!container) {
        return null;
    }

    // キャレットがテキストノード内にいる場合
    if (container.nodeType === Node.TEXT_NODE && container.parentNode) {
        const parent = container.parentNode;
        const idx = Array.prototype.indexOf.call(parent.childNodes, container);
        if (idx > 0) {
            const prev = parent.childNodes[idx - 1];
            if (prev.nodeType === Node.ELEMENT_NODE && prev.nodeName === 'CODE') {
                return prev;
            }
        }
        return null;
    }

    // キャレットが要素ノード内のオフセット位置にある場合
    if (container.nodeType === Node.ELEMENT_NODE) {
        if (offset === 0) {
            return null;
        }
        const prev = container.childNodes[offset - 1];
        if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.nodeName === 'CODE') {
            return prev;
        }
    }

    return null;
}

function shouldSkipInline(node) {
    let current = node.parentNode;
    while (current && current !== editor) {
        if (current.nodeName === 'CODE' || current.nodeName === 'PRE') {
            return true;
        }
        current = current.parentNode;
    }
    return false;
}

function convertInlineText(text) {
    let html = text;

    // リンク
    html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // インラインコード
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 下線（++text++）
    html = html.replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>');

    // 太字
    html = html.replace(/(\*\*|__)([^*]+?)\1/g, '<strong>$2</strong>');

    // 斜体
    html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
    html = html.replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');

    return html;
}

// ページ読み込み完了時に初期ハイライトを適用
document.addEventListener('DOMContentLoaded', () => {
    // highlight.jsの読み込みを待つ
    const waitForHljs = () => {
        if (typeof hljs !== 'undefined') {
            console.log('[Syntax Highlight] hljs loaded, languages:', hljs.listLanguages());
            applySyntaxHighlighting();
        } else {
            console.log('[Syntax Highlight] Waiting for hljs...');
            setTimeout(waitForHljs, 50);
        }
    };
    waitForHljs();

    // Mermaidの初期化を待つ
    const waitForMermaid = () => {
        if (typeof mermaid !== 'undefined') {
            initMermaid();
            renderMermaidDiagrams();
        } else {
            console.log('[Mermaid] Waiting for mermaid.js...');
            setTimeout(waitForMermaid, 50);
        }
    };
    waitForMermaid();
});
