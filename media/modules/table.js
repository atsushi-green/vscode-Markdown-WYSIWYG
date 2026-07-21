/**
 * table.js - テーブル編集機能モジュール
 * インタラクティブテーブルの編集、ナビゲーション、行列操作を担当
 */
window.TableModule = (function() {
    'use strict';

    const state = window.EditorState;
    const utils = window.EditorUtils;
    const markdown = window.MarkdownModule;

    /**
     * Markdownテーブルをインタラクティブテーブルに変換
     */
    function render() {
        console.log('[renderTables] Starting table rendering');

        const tables = state.editor.querySelectorAll('table:not(.table-rendered)');
        console.log('[renderTables] Found', tables.length, 'tables to render');

        tables.forEach((table, index) => {
            if (table.classList.contains('table-rendered')) {
                return;
            }

            console.log('[renderTables] Rendering table', index);
            table.classList.add('table-rendered');
            const tableId = `table-${state.tableIdCounter++}`;
            table.setAttribute('data-table-id', tableId);

            // テーブルコンテナを作成
            const container = document.createElement('div');
            container.className = 'table-container';
            container.setAttribute('data-table-id', tableId);

            // ツールバーを作成
            const toolbar = document.createElement('div');
            toolbar.className = 'table-toolbar';
            toolbar.innerHTML = `
                <button class="table-btn" data-action="add-row-before" title="上に行を追加">⬆️ 行</button>
                <button class="table-btn" data-action="add-row-after" title="下に行を追加">⬇️ 行</button>
                <button class="table-btn" data-action="add-col-before" title="左に列を追加">⬅️ 列</button>
                <button class="table-btn" data-action="add-col-after" title="右に列を追加">➡️ 列</button>
                <span class="table-separator"></span>
                <button class="table-btn table-btn-danger" data-action="delete-row" title="行を削除">🗑️ 行</button>
                <button class="table-btn table-btn-danger" data-action="delete-col" title="列を削除">🗑️ 列</button>
                <button class="table-btn" data-action="copy-table" title="テーブルをコピー">📋 コピー</button>
            `;

            // テーブルをラップ
            const tableWrapper = document.createElement('div');
            tableWrapper.className = 'table-wrapper';

            // 元のテーブルをコンテナに移動
            table.parentNode.insertBefore(container, table);
            container.appendChild(toolbar);
            tableWrapper.appendChild(table);
            container.appendChild(tableWrapper);

            // 全てのセルを編集可能にし、イベントを設定
            makeEditable(table, tableId);

            // ツールバーボタンのイベント設定
            toolbar.querySelectorAll('.table-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    if (action === 'copy-table') {
                        copy(table);
                    } else {
                        handleAction(table, action);
                    }
                });
            });
        });
    }

    /**
     * テーブルを編集可能にする
     */
    function makeEditable(table, tableId) {
        console.log('[makeTableEditable] Making table editable:', tableId);
        const cells = table.querySelectorAll('th, td');

        cells.forEach((cell, index) => {
            cell.setAttribute('contenteditable', 'true');
            cell.setAttribute('data-cell-index', index);
            cell.setAttribute('tabindex', '0');
            cell.classList.add('table-cell');

            // セルのクリックイベント
            cell.addEventListener('click', (e) => {
                console.log('[Cell Click] Cell clicked:', cell.textContent);
                e.stopPropagation();
                cell.focus();
                selectCell(cell, table);
            });

            // マウスドラッグによる矩形範囲選択
            setupCellRangeDrag(cell, table);

            // フォーカスイベント
            cell.addEventListener('focus', () => {
                console.log('[Cell Focus] Cell focused:', cell.textContent);
            });

            // キーボードイベント
            cell.addEventListener('keydown', (e) => {
                console.log('[Cell Keydown] Key:', e.key);
                handleKeydown(e, cell, table);
            }, false);

            // 入力イベント
            cell.addEventListener('input', () => {
                state.isEditingTable = true;
                clearTimeout(cell._updateTimeout);
                cell._updateTimeout = setTimeout(() => {
                    updateDocument();
                    state.isEditingTable = false;
                }, 300);
            });

            // ペーストイベント
            cell.addEventListener('paste', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const text = e.clipboardData.getData('text/plain');
                if (text.includes('\t') || text.includes('\n')) {
                    pasteData(cell, table, text);
                } else {
                    document.execCommand('insertText', false, text);
                }
            });
        });
    }

    /**
     * セルを選択
     */
    function selectCell(cell, table) {
        table.querySelectorAll('.table-cell-selected').forEach(c => {
            c.classList.remove('table-cell-selected');
        });
        cell.classList.add('table-cell-selected');
        state.currentEditingCell = cell;
        // 単一セルの選択は、既存の矩形範囲選択（あれば）を解除する。
        if (currentCellRange) {
            clearRangeSelection(currentCellRange.table);
            currentCellRange = null;
        }
    }

    // ---- 表の矩形範囲選択（マウスドラッグ） ----
    // ドラッグ開始セル（mousedown時に記録。document の mouseup でクリアする）。
    let rangeDragStart = null;
    // 直近に確定した矩形範囲選択。コピー＆ペースト（(2/3)(3/3)）から参照する想定。
    let currentCellRange = null;

    /**
     * テーブル内でのセルの行・列インデックスを求める純粋関数寄りのヘルパ。
     * theadとtbodyをまたいだ表示順（`table.rows`）を行インデックスとして使う
     * （既存の矢印キーナビゲーション`handleKeydown`と同じ考え方）。
     */
    function cellPosition(table, cell) {
        const row = cell.parentElement;
        return {
            row: Array.from(table.rows).indexOf(row),
            col: Array.from(row.cells).indexOf(cell)
        };
    }

    /**
     * 開始・終了セルの行列インデックスから矩形範囲（開始・終了の前後を問わない）を
     * 正規化して返す純粋関数。
     */
    function computeCellRange(startRow, startCol, endRow, endCol) {
        return {
            minRow: Math.min(startRow, endRow),
            maxRow: Math.max(startRow, endRow),
            minCol: Math.min(startCol, endCol),
            maxCol: Math.max(startCol, endCol)
        };
    }

    /**
     * 行・列インデックスが矩形範囲内かどうかを判定する純粋関数。
     */
    function isCellInRange(row, col, range) {
        return row >= range.minRow && row <= range.maxRow &&
            col >= range.minCol && col <= range.maxCol;
    }

    /**
     * 矩形範囲内の各セルへハイライトclassを付与し、範囲外からは外す
     * （このテーブル内のみが対象）。単一セル選択（`table-cell-selected`）とは
     * 混在させず、範囲確定時にそちらは解除する。
     */
    function applyRangeHighlight(table, range) {
        table.querySelectorAll('.table-cell-selected').forEach(c => {
            c.classList.remove('table-cell-selected');
        });
        table.querySelectorAll('th, td').forEach(cell => {
            const pos = cellPosition(table, cell);
            cell.classList.toggle('table-cell-range-selected', isCellInRange(pos.row, pos.col, range));
        });
    }

    /**
     * 矩形範囲選択のハイライトを全解除する。
     */
    function clearRangeSelection(table) {
        table.querySelectorAll('.table-cell-range-selected').forEach(c => {
            c.classList.remove('table-cell-range-selected');
        });
    }

    /**
     * このテーブルに対して矩形範囲選択が確定している場合、それを無効化する。
     * 行・列の追加/削除は行・列インデックスの構造そのものを変えるため、
     * 確定済みの範囲（`minRow`/`maxRow`/`minCol`/`maxCol`）をそのまま使い続けると
     * ずれた行・列を指す stale な範囲になる（例: 削除後に範囲外のセルまで
     * 巻き込んで`copy()`が誤った内容を返す）。`addRow`/`addColumn`/`deleteRow`/
     * `deleteColumn`の冒頭で呼び、`selectCell`と同じ考え方で後始末する。
     */
    function invalidateRangeSelectionFor(table) {
        if (currentCellRange && currentCellRange.table === table) {
            clearRangeSelection(table);
            currentCellRange = null;
        }
    }

    /**
     * テーブル内のマウスドラッグによる矩形範囲選択を配線する（`makeEditable`の
     * セルループから各セルへ）。開始セルの`mousedown`を記録し、ドラッグ中
     * （主ボタン押下中）に別セルへ`mouseenter`すると範囲を確定・ハイライトする。
     * 単なるクリック（同一セルでmousedown/mouseup）は別セルへの`mouseenter`が
     * 発生しないため、この配線は一切反応せず既存の単一セル選択と競合しない。
     */
    function setupCellRangeDrag(cell, table) {
        cell.addEventListener('mousedown', (e) => {
            if (e.button !== 0) {
                return; // 主ボタン（左クリック）のみ対象
            }
            // 別のテーブルに残っている範囲選択があれば、ここで解除する。
            // clickは必ずmousedownの後に発火するため、単純クリック・ドラッグ開始の
            // どちらの経路でも「他テーブルの範囲ハイライトが永続的に残留する」
            // （複数テーブルを持つ文書での取り違え・消し忘れ）を防げる。
            if (currentCellRange && currentCellRange.table !== table) {
                clearRangeSelection(currentCellRange.table);
                currentCellRange = null;
            }
            rangeDragStart = { table: table, position: cellPosition(table, cell) };
        });

        cell.addEventListener('mouseenter', (e) => {
            if (!rangeDragStart || rangeDragStart.table !== table || e.buttons !== 1) {
                return;
            }
            const pos = cellPosition(table, cell);
            const range = computeCellRange(
                rangeDragStart.position.row, rangeDragStart.position.col, pos.row, pos.col
            );
            currentCellRange = { table: table, range: range };
            applyRangeHighlight(table, range);
        });
    }

    /**
     * マウスボタンを離したらドラッグ追跡を終了する（`document`に一度だけ配線）。
     * 確定した範囲のハイライト（`currentCellRange`）はここでは消さない
     * （次のクリック・別範囲の開始・別テーブルでの範囲開始のいずれかまで保持する）。
     */
    function setupRangeSelectionMouseUp() {
        document.addEventListener('mouseup', () => {
            rangeDragStart = null;
        });
    }

    /**
     * テーブル内のキーボード操作
     */
    function handleKeydown(e, cell, table) {
        const isNavigationKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key);

        if (!isNavigationKey) {
            return;
        }

        const cells = Array.from(table.querySelectorAll('th, td'));
        const currentIndex = cells.indexOf(cell);
        const currentRow = cell.parentElement;
        const cellsInRow = Array.from(currentRow.cells);
        const colIndex = cellsInRow.indexOf(cell);

        // thead / tbody をまたいで表示順に全行を取得する
        const rows = Array.from(table.rows);
        const rowIndex = rows.indexOf(currentRow);

        const cellInRowAt = (row, index) => {
            if (!row) return null;
            const rowCells = Array.from(row.cells);
            return rowCells[Math.min(index, rowCells.length - 1)] || null;
        };

        let targetCell = null;
        let shouldHandle = false;

        switch (e.key) {
            case 'ArrowUp':
                shouldHandle = true;
                if (rowIndex > 0) {
                    targetCell = cellInRowAt(rows[rowIndex - 1], colIndex);
                }
                break;

            case 'ArrowDown':
                shouldHandle = true;
                if (rowIndex >= 0 && rowIndex < rows.length - 1) {
                    targetCell = cellInRowAt(rows[rowIndex + 1], colIndex);
                }
                break;

            case 'ArrowLeft':
                if (colIndex > 0 && window.getSelection().anchorOffset === 0) {
                    shouldHandle = true;
                    targetCell = cellsInRow[colIndex - 1];
                }
                break;

            case 'ArrowRight':
                if (colIndex < cellsInRow.length - 1) {
                    const selection = window.getSelection();
                    const textLength = cell.textContent.length;
                    if (selection.anchorOffset === textLength) {
                        shouldHandle = true;
                        targetCell = cellsInRow[colIndex + 1];
                    }
                }
                break;

            case 'Tab':
                shouldHandle = true;
                if (e.shiftKey) {
                    targetCell = cells[Math.max(0, currentIndex - 1)];
                } else {
                    targetCell = cells[Math.min(cells.length - 1, currentIndex + 1)];
                }
                break;

            case 'Enter':
                if (!e.shiftKey) {
                    shouldHandle = true;
                    if (rowIndex >= 0 && rowIndex < rows.length - 1) {
                        targetCell = cellInRowAt(rows[rowIndex + 1], colIndex);
                    }
                }
                break;
        }

        e.stopPropagation();
        e.stopImmediatePropagation();

        if (shouldHandle) {
            e.preventDefault();

            if (targetCell) {
                selectCell(targetCell, table);
                const range = document.createRange();
                const selection = window.getSelection();
                range.selectNodeContents(targetCell);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
                targetCell.focus();
            }
        }
    }

    /**
     * キャレット位置からテーブルセルを解決する
     * #editor 自体が contenteditable のため、キー入力の target がセルではなく
     * エディタ本体になることがある。その場合の受け皿。
     */
    function findCellFromSelection() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return null;
        }
        const node = selection.anchorNode;
        if (!node) {
            return null;
        }
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return element ? element.closest('.table-cell') : null;
    }

    /**
     * エディタ本体で受け取ったキー入力をセルの操作に振り分ける
     * 処理した場合は true を返す
     */
    function handleEditorKeydown(e) {
        const target = e.target;
        const cell = (target && target.closest && target.closest('.table-cell')) || findCellFromSelection();
        if (!cell) {
            return false;
        }

        const table = cell.closest('table');
        if (!table) {
            return false;
        }

        selectCell(cell, table);
        handleKeydown(e, cell, table);
        return true;
    }

    /**
     * テーブルアクション処理
     */
    function handleAction(table, action) {
        if (!state.currentEditingCell) {
            utils.showToast('⚠️ セルを選択してください');
            return;
        }

        const currentRow = state.currentEditingCell.parentElement;
        const cellsInRow = Array.from(currentRow.querySelectorAll('th, td'));
        const colIndex = cellsInRow.indexOf(state.currentEditingCell);

        switch (action) {
            case 'add-row-before':
                addRow(table, currentRow, 'before');
                break;
            case 'add-row-after':
                addRow(table, currentRow, 'after');
                break;
            case 'add-col-before':
                addColumn(table, colIndex, 'before');
                break;
            case 'add-col-after':
                addColumn(table, colIndex, 'after');
                break;
            case 'delete-row':
                deleteRow(table, currentRow);
                break;
            case 'delete-col':
                deleteColumn(table, colIndex);
                break;
        }

        updateDocument();
    }

    /**
     * 行を追加
     */
    function addRow(table, currentRow, position) {
        invalidateRangeSelectionFor(table);
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const colCount = table.querySelectorAll('thead th').length;
        const newRow = document.createElement('tr');

        for (let i = 0; i < colCount; i++) {
            const cell = document.createElement('td');
            cell.textContent = '';
            newRow.appendChild(cell);
        }

        if (position === 'before') {
            currentRow.parentNode.insertBefore(newRow, currentRow);
        } else {
            if (currentRow.nextSibling) {
                currentRow.parentNode.insertBefore(newRow, currentRow.nextSibling);
            } else {
                currentRow.parentNode.appendChild(newRow);
            }
        }

        const tableId = table.getAttribute('data-table-id');
        makeEditable(table, tableId);
        utils.showToast('✅ 行を追加しました');
    }

    /**
     * 列を追加
     */
    function addColumn(table, colIndex, position) {
        invalidateRangeSelectionFor(table);
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        const targetIndex = position === 'before' ? colIndex : colIndex + 1;

        // ヘッダーに列を追加
        if (thead) {
            const headerRow = thead.querySelector('tr');
            const newHeader = document.createElement('th');
            newHeader.textContent = 'ヘッダー';
            const headers = Array.from(headerRow.querySelectorAll('th'));
            if (targetIndex < headers.length) {
                headerRow.insertBefore(newHeader, headers[targetIndex]);
            } else {
                headerRow.appendChild(newHeader);
            }
        }

        // ボディの各行に列を追加
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const newCell = document.createElement('td');
                newCell.textContent = '';
                const cells = Array.from(row.querySelectorAll('td'));
                if (targetIndex < cells.length) {
                    row.insertBefore(newCell, cells[targetIndex]);
                } else {
                    row.appendChild(newCell);
                }
            });
        }

        const tableId = table.getAttribute('data-table-id');
        makeEditable(table, tableId);
        utils.showToast('✅ 列を追加しました');
    }

    /**
     * 行を削除
     */
    function deleteRow(table, currentRow) {
        invalidateRangeSelectionFor(table);
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        if (rows.length <= 1) {
            utils.showToast('⚠️ 最後の行は削除できません');
            return;
        }

        currentRow.remove();
        state.currentEditingCell = null;
        utils.showToast('✅ 行を削除しました');
    }

    /**
     * 列を削除
     */
    function deleteColumn(table, colIndex) {
        invalidateRangeSelectionFor(table);
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');

        const colCount = thead ? thead.querySelectorAll('th').length : 0;
        if (colCount <= 1) {
            utils.showToast('⚠️ 最後の列は削除できません');
            return;
        }

        // ヘッダーから列を削除
        if (thead) {
            const headerRow = thead.querySelector('tr');
            const headers = headerRow.querySelectorAll('th');
            if (headers[colIndex]) {
                headers[colIndex].remove();
            }
        }

        // ボディの各行から列を削除
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells[colIndex]) {
                    cells[colIndex].remove();
                }
            });
        }

        state.currentEditingCell = null;
        utils.showToast('✅ 列を削除しました');
    }

    /**
     * テーブルデータを貼り付け
     */
    function pasteData(startCell, table, text) {
        const lines = text.split('\n').filter(line => line.trim());
        const data = lines.map(line => line.split('\t'));

        const tbody = table.querySelector('tbody');
        const startRow = startCell.parentElement;
        const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
        const startRowIndex = rows.indexOf(startRow);
        const cellsInStartRow = Array.from(startRow.querySelectorAll('th, td'));
        const startColIndex = cellsInStartRow.indexOf(startCell);

        if (startRowIndex === -1) return;

        data.forEach((rowData, rowOffset) => {
            const targetRowIndex = startRowIndex + rowOffset;
            if (targetRowIndex >= rows.length) return;

            const targetRow = rows[targetRowIndex];
            const cells = Array.from(targetRow.querySelectorAll('td'));

            rowData.forEach((cellData, colOffset) => {
                const targetColIndex = startColIndex + colOffset;
                if (targetColIndex >= cells.length) return;

                cells[targetColIndex].textContent = cellData;
            });
        });

        updateDocument();
        utils.showToast('✅ データを貼り付けました');
    }

    /**
     * テーブル全体、または矩形範囲（`isCellInRange`と同じ形の`{minRow,maxRow,minCol,maxCol}`。
     * 無ければテーブル全体）に含まれるセルのテキストを行列（文字列の二次元配列）として
     * 取り出す純粋関数寄りのヘルパ。
     */
    function extractCellTextMatrix(table, range) {
        const matrix = [];
        Array.from(table.rows).forEach((row, rowIndex) => {
            const line = [];
            Array.from(row.cells).forEach((cell, colIndex) => {
                if (range && !isCellInRange(rowIndex, colIndex, range)) {
                    return;
                }
                line.push(cell.textContent);
            });
            if (line.length) {
                matrix.push(line);
            }
        });
        return matrix;
    }

    /**
     * 文字列の行列をタブ区切り（TSV）テキストへ組み立てる純粋関数。
     */
    function buildTsvFromMatrix(matrix) {
        return matrix.map(row => row.join('\t')).join('\n');
    }

    /**
     * テーブル全体、または矩形範囲に含まれるセルを`<table>`断片のHTML文字列として
     * 組み立てる。セル内の装飾（`<strong>`・リンク等）を保つため`textContent`ではなく
     * `innerHTML`をそのまま使う（エディタ内の`contenteditable`等の属性はセル自身の
     * ものであり、ここでは新規に`<td>`/`<th>`タグを作って中身だけ包むため含まれない）。
     */
    function buildHtmlTableFragment(table, range) {
        const rowsHtml = [];
        Array.from(table.rows).forEach((row, rowIndex) => {
            const cellsHtml = [];
            Array.from(row.cells).forEach((cell, colIndex) => {
                if (range && !isCellInRange(rowIndex, colIndex, range)) {
                    return;
                }
                const tag = cell.tagName === 'TH' ? 'th' : 'td';
                cellsHtml.push(`<${tag}>${cell.innerHTML}</${tag}>`);
            });
            if (cellsHtml.length) {
                rowsHtml.push(`<tr>${cellsHtml.join('')}</tr>`);
            }
        });
        return `<table><tbody>${rowsHtml.join('')}</tbody></table>`;
    }

    /**
     * TSVテキストとHTML断片をクリップボードへ書き込む。`ClipboardItem`/
     * `navigator.clipboard.write`が使える環境（Webview＝Chromiumベースなので通常は使える）
     * ではその両方を書き込み、Excel等へはTSVプレーンテキストとして、装飾を保ちたい
     * 貼り付け先へは`text/html`として渡せるようにする。使えない環境（jsdomでのテスト等）
     * では従来どおり`writeText`（TSVのみ）へフォールバックする。
     */
    function writeToClipboard(tsv, html) {
        if (typeof ClipboardItem !== 'undefined' &&
            navigator.clipboard && typeof navigator.clipboard.write === 'function') {
            const item = new ClipboardItem({
                'text/plain': new Blob([tsv], { type: 'text/plain' }),
                'text/html': new Blob([html], { type: 'text/html' })
            });
            return navigator.clipboard.write([item]);
        }
        return navigator.clipboard.writeText(tsv);
    }

    /**
     * テーブルをコピーする。矩形範囲選択（`currentCellRange`）がこのテーブルに
     * 対して確定している場合はその範囲だけを、無ければテーブル全体をTSV＋text/htmlで
     * クリップボードへ書き込む（範囲が無い場合の挙動・出力内容は従来と同じ＝無退行）。
     */
    function copy(table) {
        const range = (currentCellRange && currentCellRange.table === table) ? currentCellRange.range : null;
        const matrix = extractCellTextMatrix(table, range);
        const tsv = buildTsvFromMatrix(matrix);
        const html = buildHtmlTableFragment(table, range);

        writeToClipboard(tsv, html).then(() => {
            utils.showToast(range ? '✅ 選択範囲をコピーしました' : '✅ テーブルをコピーしました');
        }).catch(err => {
            console.error('Copy failed:', err);
            utils.showToast('❌ コピーに失敗しました');
        });
    }

    /**
     * ドキュメントをテーブルから更新
     */
    function updateDocument() {
        if (state.isUpdating || state.isEditingTable) return;

        const cleanHtml = markdown.getCleanHtmlFromEditor();
        const md = markdown.htmlToMarkdown(cleanHtml);
        if (md !== state.lastSentMarkdown) {
            state.lastSentMarkdown = md;
            state.vscode.postMessage({
                type: 'edit',
                content: md
            });
        }
    }

    /**
     * 空のMarkdownテーブル文字列を生成する（純粋関数）。
     * rows = 本文（データ）行数（1以上）、cols = 列数（1以上）。
     * ヘッダ行＋区切り行（`---`）＋本文行を出力する（セルは空）。
     * 例: buildEmptyTableMarkdown(2, 3) → ヘッダ1行・区切り1行・本文2行。
     */
    function buildEmptyTableMarkdown(rows, cols) {
        const c = Math.max(1, cols | 0);
        const r = Math.max(1, rows | 0);
        const rowLine = (cells) => '| ' + cells.join(' | ') + ' |';
        const emptyCells = () => {
            const a = [];
            for (let i = 0; i < c; i++) {
                a.push(' ');
            }
            return a;
        };
        const sepCells = () => {
            const a = [];
            for (let i = 0; i < c; i++) {
                a.push('---');
            }
            return a;
        };
        const lines = [rowLine(emptyCells()), rowLine(sepCells())];
        for (let i = 0; i < r; i++) {
            lines.push(rowLine(emptyCells()));
        }
        return lines.join('\n') + '\n';
    }

    /**
     * 空のテーブルをキャレット位置（のあるトップレベルブロックの直後、
     * 無ければ末尾）へ挿入し、即座にインタラクティブ化する。
     * 挿入方式は commands.insertToc と同じ（読込時と同じ markdownToHtml を通す）。
     */
    function insertTable(rows, cols) {
        const tableMarkdown = buildEmptyTableMarkdown(rows, cols);
        const temp = document.createElement('div');
        temp.innerHTML = markdown.markdownToHtml(tableMarkdown);
        const nodes = Array.prototype.slice.call(temp.childNodes);
        if (!nodes.length) {
            return;
        }

        // 挿入位置（キャレットのあるトップレベルブロックの直後）
        const selection = window.getSelection();
        let block = null;
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (state.editor.contains(range.startContainer)) {
                block = utils.findBlockAncestor(range.startContainer);
                while (block && block.parentNode !== state.editor) {
                    block = block.parentNode;
                }
            }
        }

        if (block && block.parentNode === state.editor) {
            let ref = block;
            nodes.forEach((n) => {
                ref.after(n);
                ref = n;
            });
        } else {
            nodes.forEach((n) => state.editor.appendChild(n));
        }

        // 挿入した表をインタラクティブ化
        render();

        // 文書へ反映
        state.editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ---- 表の挿入UI（右クリックメニュー＋行数・列数ダイアログ）----
    // markdownEditor.ts のHTMLには持たせず、初回に動的生成して body へ挿す
    // （math.js のPNGコピーメニューと同じ方針。拡張機能側HTMLを触らずUIを足す）。
    let insertMenuEl = null;
    let insertDialogEl = null;
    // ダイアログ確定時に表を挿す位置。右クリック時のキャレット範囲を退避しておく
    // （ダイアログ入力へフォーカスが移るとエディタの選択が失われるため）。
    let pendingInsertRange = null;
    // 直近の showInsertDialog 呼び出し元へ、確定（実際に表を挿入できた）後にのみ通知する
    // コールバック。キャンセル時は呼ばない＝呼び出し元は「挿入されなかった」と判断できる。
    let onInsertConfirmed = null;

    // 挿入メニューを出さない「特別な」ブロック（数式・Mermaid・既存テーブル）。
    // これらの上での右クリックはそれぞれの担当（数式メニュー／Mermaidメニュー／
    // ブラウザ既定のセル操作）に委ね、「表を挿入」は平文領域だけで出す。
    const EXCLUDED_SELECTORS = [
        '.math-block', '.math-inline',
        '.mermaid-container', '.mermaid-preview-panel', 'pre.mermaid-source',
        'table', '.table-container'
    ];

    // 行数・列数の上限（極端な値での重い挿入・誤操作を防ぐ）。
    const MAX_ROWS = 50;
    const MAX_COLS = 20;

    /**
     * 右クリック対象から祖先を辿り、`EXCLUDED_SELECTORS` に一致する要素があれば返す。
     * root（＝エディタ）に達するまでに見つからなければ null＝平文領域とみなす（純粋関数）。
     */
    function findExcludedAncestor(target, root) {
        let node = target;
        while (node && node !== root) {
            if (node.nodeType === 1 && typeof node.matches === 'function') {
                for (let i = 0; i < EXCLUDED_SELECTORS.length; i++) {
                    if (node.matches(EXCLUDED_SELECTORS[i])) {
                        return node;
                    }
                }
            }
            node = node.parentNode;
        }
        return null;
    }

    /**
     * ブロックが「空」＝表を挿しても本文を壊さない場所か判定する純粋関数。
     * テキストが無く（空白・ゼロ幅のみ）、`<br>` 以外の要素（画像・数式など）も
     * 含まないブロックを空とみなす。
     */
    function isBlockEmpty(block) {
        if (!block) {
            return false;
        }
        const text = (block.textContent || '').replace(/\u200B/g, '').trim();
        if (text !== '') {
            return false;
        }
        return !Array.prototype.some.call(block.children || [], function(c) {
            return c.tagName !== 'BR';
        });
    }

    /**
     * 右クリック対象が「表を挿入」メニューを出してよい場所か判定する純粋関数。
     * 本文テキスト上ではブラウザ既定メニュー（貼り付け・スペル修正等）を尊重し、
     * **空行・エディタ余白**（＝ROADMAPの「エディタ空欄で右クリック」）でのみ true。
     * 数式・Mermaid・既存テーブル上は対象外（false）。
     */
    function shouldShowInsertMenu(target, editor) {
        if (!target || !editor) {
            return false;
        }
        if (findExcludedAncestor(target, editor)) {
            return false;
        }
        if (target === editor) {
            return true; // エディタ直下の余白
        }
        const block = utils.findBlockAncestor(target);
        if (!block) {
            return true; // ブロック外（エディタ直下のテキストノード等）
        }
        return isBlockEmpty(block);
    }

    /**
     * 右クリック位置からメニュー表示位置を決める純粋関数。
     * ビューポート右端・下端からはみ出す場合は内側へ寄せる（math.js と同じ調整）。
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
     * ダイアログの行数・列数入力（文字列でも数値でも可）を、1以上・上限以下の
     * 整数へ正規化する純粋関数。空・非数値・0以下は既定値へ丸める。
     * @returns {{rows:number, cols:number}}
     */
    function clampTableDimensions(rowsInput, colsInput) {
        const toInt = (v, fallback, max) => {
            const n = parseInt(v, 10);
            if (!isFinite(n) || n < 1) {
                return fallback;
            }
            return Math.min(n, max);
        };
        return {
            rows: toInt(rowsInput, 1, MAX_ROWS),
            cols: toInt(colsInput, 1, MAX_COLS)
        };
    }

    /**
     * 挿入メニュー（無ければ生成）を返す。見た目は mermaid/数式メニューと共有
     * （editor.css の `.table-context-menu`/`.table-menu-item` は同ルールを参照）。
     */
    function ensureInsertMenu() {
        if (insertMenuEl && document.body.contains(insertMenuEl)) {
            return insertMenuEl;
        }
        const menu = document.createElement('div');
        menu.id = 'tableContextMenu';
        menu.className = 'table-context-menu';
        menu.style.display = 'none';
        menu.style.position = 'fixed';

        const item = document.createElement('div');
        item.className = 'table-menu-item';
        item.setAttribute('data-action', 'insertTable');
        item.textContent = '➕ 表を挿入…';
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            hideInsertMenu();
            showInsertDialog();
        });
        menu.appendChild(item);

        document.body.appendChild(menu);
        insertMenuEl = menu;
        return menu;
    }

    /**
     * 指定座標へ挿入メニューを表示する。
     */
    function showInsertMenu(clientX, clientY) {
        const menu = ensureInsertMenu();
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
     * 挿入メニューを閉じる。
     */
    function hideInsertMenu() {
        if (insertMenuEl) {
            insertMenuEl.style.display = 'none';
        }
    }

    /**
     * 行数・列数ダイアログ（無ければ生成）を返す。Webviewでは `prompt()` が使えないため
     * `#linkDialog` と同じ `.link-dialog` 系スタイルで自前に組み立てる。
     */
    function ensureInsertDialog() {
        if (insertDialogEl && document.body.contains(insertDialogEl)) {
            return insertDialogEl;
        }
        const dialog = document.createElement('div');
        dialog.id = 'tableInsertDialog';
        dialog.className = 'link-dialog table-insert-dialog';
        dialog.style.display = 'none';

        const title = document.createElement('div');
        title.className = 'link-dialog-title';
        title.textContent = '表の挿入';
        dialog.appendChild(title);

        const makeField = (labelText, value) => {
            const field = document.createElement('label');
            field.className = 'link-dialog-field';
            const label = document.createElement('span');
            label.className = 'link-dialog-label';
            label.textContent = labelText;
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'link-dialog-input table-insert-input';
            input.min = '1';
            input.value = String(value);
            field.appendChild(label);
            field.appendChild(input);
            return { field: field, input: input };
        };

        const rowsField = makeField('行数', 2);
        const colsField = makeField('列数', 3);
        dialog.appendChild(rowsField.field);
        dialog.appendChild(colsField.field);

        const actions = document.createElement('div');
        actions.className = 'link-dialog-actions';
        const spacer = document.createElement('span');
        spacer.className = 'link-dialog-spacer';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'link-dialog-btn';
        cancelBtn.title = 'キャンセル (Escape)';
        cancelBtn.textContent = 'キャンセル';
        const okBtn = document.createElement('button');
        okBtn.className = 'link-dialog-btn link-dialog-btn-primary';
        okBtn.title = '挿入 (Enter)';
        okBtn.textContent = 'OK';
        actions.appendChild(spacer);
        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);
        dialog.appendChild(actions);

        // 参照を保持（表示時のフォーカス・確定時の値読み取り用）
        dialog._rowsInput = rowsField.input;
        dialog._colsInput = colsField.input;

        const confirm = () => {
            const dims = clampTableDimensions(rowsField.input.value, colsField.input.value);
            hideInsertDialog();
            restorePendingSelection();
            // 復元した範囲は使い切ったのでクリア（次回の古い範囲の誤用を防ぐ）
            pendingInsertRange = null;
            insertTable(dims.rows, dims.cols);
            // 実際に挿入できた場合のみ呼び出し元へ通知する（キャンセル時は呼ばない）
            if (onInsertConfirmed) {
                const callback = onInsertConfirmed;
                onInsertConfirmed = null;
                callback();
            }
        };
        // キャンセル（挿入しない）経路をまとめる。onInsertConfirmedは呼ばずに破棄することで、
        // 呼び出し元（スラッシュコマンドメニュー等）が「挿入されなかった」と判断できるようにする。
        const cancel = () => {
            onInsertConfirmed = null;
            hideInsertDialog();
        };

        okBtn.addEventListener('click', function(e) {
            e.preventDefault();
            confirm();
        });
        cancelBtn.addEventListener('click', function(e) {
            e.preventDefault();
            cancel();
        });
        // Enterで確定・Escapeでキャンセル（数値入力内から）。
        // ただしキャンセルボタン上でのEnterはキャンセルとして扱う。
        dialog.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.target === cancelBtn) {
                    cancel();
                } else {
                    confirm();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        document.body.appendChild(dialog);
        insertDialogEl = dialog;
        return dialog;
    }

    /**
     * 行数・列数ダイアログを表示し、行数入力へフォーカスする。
     * @param {Function} [onInserted] 実際に表を挿入できた（OK確定・キャンセルでない）場合にのみ
     * 呼ばれるコールバック。右クリックメニュー以外の呼び出し元（スラッシュコマンドメニュー等）が、
     * 挿入位置に置いたプレースホルダの後始末をキャンセル時と区別して行いたい場合に使う。
     */
    function showInsertDialog(onInserted) {
        onInsertConfirmed = typeof onInserted === 'function' ? onInserted : null;
        const dialog = ensureInsertDialog();
        dialog.style.display = '';
        if (dialog._rowsInput) {
            dialog._rowsInput.focus();
            if (typeof dialog._rowsInput.select === 'function') {
                dialog._rowsInput.select();
            }
        }
    }

    /**
     * 行数・列数ダイアログを閉じる。
     */
    function hideInsertDialog() {
        if (insertDialogEl) {
            insertDialogEl.style.display = 'none';
        }
    }

    /**
     * 退避しておいた右クリック時のキャレット範囲を選択へ復元する。
     * insertTable はライブの選択を読むため、ダイアログ操作で失われた選択を
     * 戻してから挿入することで、右クリックした位置の直後へ表を入れる。
     */
    function restorePendingSelection() {
        if (!pendingInsertRange) {
            return;
        }
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(pendingInsertRange);
        }
    }

    /**
     * ダイアログ確定時に復元する範囲を外部（右クリックメニュー以外の呼び出し元）から
     * 設定する。`showInsertDialog` はフォーカスを行数・列数入力へ移すため、それより前の
     * キャレット位置をここへ渡しておくと、確定時にそこへ表を挿入できる
     * （右クリックメニューの `contextmenu` ハンドラが自分自身の内部でやっているのと同じ仕組み）。
     */
    function setPendingInsertRange(range) {
        pendingInsertRange = range ? range.cloneRange() : null;
    }

    /**
     * エディタへ「表を挿入」右クリックメニューを配線する（editor.js の初期化から一度だけ）。
     * 対象が平文領域（数式・Mermaid・既存テーブル以外）のときだけ既定メニューを抑止して
     * 自前メニューを出す。数式/Mermaid のメニューとは対象が排他なので競合しない。
     */
    function setupContextMenu(editor) {
        if (!editor) {
            return;
        }
        ensureInsertMenu();

        editor.addEventListener('contextmenu', function(e) {
            // 数式など他ハンドラが既に処理済みなら何もしない
            if (e.defaultPrevented) {
                return;
            }
            // 空行・エディタ余白でのみ出す。本文テキスト・特別ブロック上では
            // ブラウザ既定メニュー（貼り付け・スペル修正等）を尊重する。
            if (!shouldShowInsertMenu(e.target, editor)) {
                return;
            }
            e.preventDefault();
            // 右クリック位置のキャレット範囲を退避（挿入位置に使う）
            pendingInsertRange = null;
            if (typeof document.caretRangeFromPoint === 'function') {
                const r = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (r && editor.contains(r.startContainer)) {
                    pendingInsertRange = r.cloneRange();
                }
            }
            showInsertMenu(e.clientX, e.clientY);
        });

        // メニュー外クリックで閉じる
        document.addEventListener('click', function(e) {
            if (insertMenuEl && !insertMenuEl.contains(e.target)) {
                hideInsertMenu();
            }
        });
    }

    /**
     * テーブルをクリーンアップ
     */
    function cleanup() {
        state.editor.querySelectorAll('.table-container').forEach(container => {
            const table = container.querySelector('table');
            if (table) {
                container.parentNode.insertBefore(table, container);
                table.classList.remove('table-rendered');
                table.removeAttribute('data-table-id');
                table.querySelectorAll('th, td').forEach(cell => {
                    cell.removeAttribute('contenteditable');
                    cell.classList.remove('table-cell', 'table-cell-selected', 'table-cell-range-selected');
                });
            }
            container.remove();
        });
        // インタラクティブ化を解除する＝表の状態は作り直される想定のため、
        // 古いテーブル要素への参照を範囲選択の状態にも残さない。
        rangeDragStart = null;
        currentCellRange = null;
    }

    // 公開API
    return {
        render: render,
        makeEditable: makeEditable,
        selectCell: selectCell,
        handleKeydown: handleKeydown,
        handleEditorKeydown: handleEditorKeydown,
        handleAction: handleAction,
        addRow: addRow,
        addColumn: addColumn,
        deleteRow: deleteRow,
        deleteColumn: deleteColumn,
        copy: copy,
        cleanup: cleanup,
        updateDocument: updateDocument,
        buildEmptyTableMarkdown: buildEmptyTableMarkdown,
        insertTable: insertTable,
        setupContextMenu: setupContextMenu,
        showInsertDialog: showInsertDialog,
        setPendingInsertRange: setPendingInsertRange,
        hideInsertDialog: hideInsertDialog,
        findExcludedAncestor: findExcludedAncestor,
        isBlockEmpty: isBlockEmpty,
        shouldShowInsertMenu: shouldShowInsertMenu,
        computeMenuPosition: computeMenuPosition,
        clampTableDimensions: clampTableDimensions,
        cellPosition: cellPosition,
        computeCellRange: computeCellRange,
        isCellInRange: isCellInRange,
        applyRangeHighlight: applyRangeHighlight,
        clearRangeSelection: clearRangeSelection,
        setupRangeSelectionMouseUp: setupRangeSelectionMouseUp,
        getCurrentCellRange: function () { return currentCellRange; },
        extractCellTextMatrix: extractCellTextMatrix,
        buildTsvFromMatrix: buildTsvFromMatrix,
        buildHtmlTableFragment: buildHtmlTableFragment
    };
})();
