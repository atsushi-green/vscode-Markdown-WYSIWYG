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
     * テーブルをコピー
     */
    function copy(table) {
        const rows = table.querySelectorAll('tr');
        const data = Array.from(rows).map(row => {
            const cells = Array.from(row.querySelectorAll('th, td'));
            return cells.map(cell => cell.textContent).join('\t');
        });

        const text = data.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            utils.showToast('✅ テーブルをコピーしました');
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
                    cell.classList.remove('table-cell', 'table-cell-selected');
                });
            }
            container.remove();
        });
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
        updateDocument: updateDocument
    };
})();
