/**
 * table.test.ts - TableModule（インタラクティブテーブル編集）のユニットテスト
 */
import * as assert from 'assert';
import { createEditorEnv, EditorEnv } from './helper';

const TABLE_MD = '| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |';

/** キーボードイベントの簡易スタブ */
function fakeKeyEvent(key: string, shiftKey = false): any {
    return {
        key,
        shiftKey,
        preventDefault: () => { /* noop */ },
        stopPropagation: () => { /* noop */ },
        stopImmediatePropagation: () => { /* noop */ }
    };
}

suite('TableModule', () => {
    let env: EditorEnv;
    let table: HTMLTableElement;

    /** Markdownテーブルをレンダリングしてインタラクティブ化する */
    function setupTable(md: string = TABLE_MD): HTMLTableElement {
        env.editor.innerHTML = env.markdown.markdownToHtml(md);
        env.table.render();
        return env.editor.querySelector('table') as HTMLTableElement;
    }

    setup(() => {
        env = createEditorEnv();
        table = setupTable();
    });

    suite('render', () => {
        test('テーブルをコンテナ・ツールバー付きのインタラクティブ構造に変換する', () => {
            const container = env.editor.querySelector('.table-container');
            assert.ok(container, 'コンテナが生成される');
            assert.ok(container!.querySelector('.table-toolbar'), 'ツールバーが生成される');
            assert.ok(table.classList.contains('table-rendered'));
            assert.ok(table.getAttribute('data-table-id'));

            // ツールバーには行列操作+コピーの7ボタン
            const buttons = container!.querySelectorAll('.table-btn');
            assert.strictEqual(buttons.length, 7);
        });

        test('すべてのセルが編集可能になる', () => {
            const cells = table.querySelectorAll('th, td');
            assert.strictEqual(cells.length, 6);
            cells.forEach(cell => {
                assert.strictEqual(cell.getAttribute('contenteditable'), 'true');
                assert.ok(cell.classList.contains('table-cell'));
            });
        });

        test('レンダリング済みテーブルは再レンダリングしない', () => {
            env.table.render();
            assert.strictEqual(env.editor.querySelectorAll('.table-container').length, 1);
        });
    });

    suite('行・列の操作', () => {
        test('add-row-after: 選択セルの下に空行を追加し、ドキュメント更新を送信する', () => {
            const firstBodyCell = table.querySelector('tbody td') as HTMLElement;
            env.table.selectCell(firstBodyCell, table);
            env.table.handleAction(table, 'add-row-after');

            const rows = table.querySelectorAll('tbody tr');
            assert.strictEqual(rows.length, 3);
            // 追加行は2番目（a1行の直後）で、列数分の空セルを持つ
            const newRow = rows[1];
            assert.strictEqual(newRow.querySelectorAll('td').length, 2);
            assert.strictEqual(newRow.textContent, '');

            // ドキュメントへ編集内容がpostMessageされる
            const editMessage = env.posted.filter(m => m.type === 'edit').pop();
            assert.ok(editMessage, 'editメッセージが送信される');
            assert.ok(editMessage.content.includes('|  |  |'), editMessage.content);
        });

        test('add-row-before: 選択セルの上に空行を追加する', () => {
            const firstBodyCell = table.querySelector('tbody td') as HTMLElement;
            env.table.selectCell(firstBodyCell, table);
            env.table.handleAction(table, 'add-row-before');

            const rows = table.querySelectorAll('tbody tr');
            assert.strictEqual(rows.length, 3);
            assert.strictEqual(rows[0].textContent, '');
            assert.strictEqual(rows[1].textContent, 'a1b1');
        });

        test('add-col-after: 選択セルの右に列を追加する（ヘッダー含む）', () => {
            const firstBodyCell = table.querySelector('tbody td') as HTMLElement;
            env.table.selectCell(firstBodyCell, table);
            env.table.handleAction(table, 'add-col-after');

            const headers = table.querySelectorAll('thead th');
            assert.strictEqual(headers.length, 3);
            assert.strictEqual(headers[1].textContent, 'ヘッダー');
            table.querySelectorAll('tbody tr').forEach(row => {
                assert.strictEqual(row.querySelectorAll('td').length, 3);
            });
        });

        test('delete-row: 選択行を削除する', () => {
            const secondRowCell = table.querySelectorAll('tbody tr')[1].querySelector('td') as HTMLElement;
            env.table.selectCell(secondRowCell, table);
            env.table.handleAction(table, 'delete-row');

            const rows = table.querySelectorAll('tbody tr');
            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].textContent, 'a1b1');
        });

        test('delete-row: 最後の1行は削除できない', () => {
            const singleRowTable = setupTable('| A |\n| --- |\n| only |');
            const cell = singleRowTable.querySelector('tbody td') as HTMLElement;
            env.table.selectCell(cell, singleRowTable);
            env.table.handleAction(singleRowTable, 'delete-row');

            assert.strictEqual(singleRowTable.querySelectorAll('tbody tr').length, 1);
        });

        test('delete-col: 選択列を削除する', () => {
            const firstBodyCell = table.querySelector('tbody td') as HTMLElement;
            env.table.selectCell(firstBodyCell, table);
            env.table.handleAction(table, 'delete-col');

            const headers = table.querySelectorAll('thead th');
            assert.strictEqual(headers.length, 1);
            assert.strictEqual(headers[0].textContent, '列B');
            assert.strictEqual(table.querySelector('tbody tr')!.textContent, 'b1');
        });

        test('delete-col: 最後の1列は削除できない', () => {
            const singleColTable = setupTable('| A |\n| --- |\n| a1 |');
            const cell = singleColTable.querySelector('tbody td') as HTMLElement;
            env.table.selectCell(cell, singleColTable);
            env.table.handleAction(singleColTable, 'delete-col');

            assert.strictEqual(singleColTable.querySelectorAll('thead th').length, 1);
        });

        test('セル未選択時は操作せずトーストで警告する', () => {
            env.state.currentEditingCell = null;
            env.table.handleAction(table, 'add-row-after');
            assert.strictEqual(table.querySelectorAll('tbody tr').length, 2);
        });
    });

    suite('キーボードナビゲーション', () => {
        test('Tab: 次のセルへ移動する', () => {
            const cells = Array.from(table.querySelectorAll('th, td')) as HTMLElement[];
            env.table.selectCell(cells[0], table);
            env.table.handleKeydown(fakeKeyEvent('Tab'), cells[0], table);

            assert.strictEqual(env.state.currentEditingCell, cells[1]);
            assert.ok(cells[1].classList.contains('table-cell-selected'));
            assert.ok(!cells[0].classList.contains('table-cell-selected'));
        });

        test('Shift+Tab: 前のセルへ移動する', () => {
            const cells = Array.from(table.querySelectorAll('th, td')) as HTMLElement[];
            env.table.selectCell(cells[2], table);
            env.table.handleKeydown(fakeKeyEvent('Tab', true), cells[2], table);

            assert.strictEqual(env.state.currentEditingCell, cells[1]);
        });

        test('ArrowDown: 同じ列の下のセルへ移動する（thead→tbodyもまたぐ）', () => {
            const headerCell = table.querySelectorAll('th')[1] as HTMLElement;
            const below = table.querySelectorAll('tbody tr')[0].querySelectorAll('td')[1];
            env.table.selectCell(headerCell, table);
            env.table.handleKeydown(fakeKeyEvent('ArrowDown'), headerCell, table);

            assert.strictEqual(env.state.currentEditingCell, below);
        });

        test('ArrowUp: 同じ列の上のセルへ移動する', () => {
            const cell = table.querySelectorAll('tbody tr')[1].querySelectorAll('td')[0] as HTMLElement;
            const above = table.querySelectorAll('tbody tr')[0].querySelectorAll('td')[0];
            env.table.selectCell(cell, table);
            env.table.handleKeydown(fakeKeyEvent('ArrowUp'), cell, table);

            assert.strictEqual(env.state.currentEditingCell, above);
        });

        test('Enter: 下の行の同じ列へ移動する', () => {
            const cell = table.querySelectorAll('tbody tr')[0].querySelectorAll('td')[1] as HTMLElement;
            const below = table.querySelectorAll('tbody tr')[1].querySelectorAll('td')[1];
            env.table.selectCell(cell, table);
            env.table.handleKeydown(fakeKeyEvent('Enter'), cell, table);

            assert.strictEqual(env.state.currentEditingCell, below);
        });

        test('最終行でのArrowDownは移動しない', () => {
            const lastCell = table.querySelectorAll('tbody tr')[1].querySelectorAll('td')[0] as HTMLElement;
            env.table.selectCell(lastCell, table);
            env.table.handleKeydown(fakeKeyEvent('ArrowDown'), lastCell, table);

            assert.strictEqual(env.state.currentEditingCell, lastCell);
        });
    });

    suite('copy', () => {
        test('テーブル全体をタブ区切りテキストとしてクリップボードへコピーする', async () => {
            env.table.copy(table);
            // clipboard.writeTextは非同期のためマイクロタスクを待つ
            await Promise.resolve();

            assert.strictEqual(env.copiedTexts.length, 1);
            assert.strictEqual(env.copiedTexts[0], '列A\t列B\na1\tb1\na2\tb2');
        });
    });

    suite('cleanup', () => {
        test('インタラクティブ化を解除して素のテーブルに戻す', () => {
            env.table.cleanup();

            assert.strictEqual(env.editor.querySelectorAll('.table-container').length, 0);
            const plainTable = env.editor.querySelector('table');
            assert.ok(plainTable, 'テーブル自体は残る');
            assert.ok(!plainTable!.classList.contains('table-rendered'));
            plainTable!.querySelectorAll('th, td').forEach(cell => {
                assert.strictEqual(cell.getAttribute('contenteditable'), null);
                assert.ok(!cell.classList.contains('table-cell'));
            });
        });
    });

    suite('updateDocument', () => {
        test('編集内容をMarkdownに変換してVS Codeへ送信する', () => {
            const cell = table.querySelector('tbody td') as HTMLElement;
            cell.textContent = '編集済み';
            env.table.updateDocument();

            const editMessage = env.posted.filter(m => m.type === 'edit').pop();
            assert.ok(editMessage);
            assert.ok(editMessage.content.includes('| 編集済み | b1 |'), editMessage.content);
            assert.strictEqual(env.state.lastSentMarkdown, editMessage.content);
        });

        test('内容が変わらなければ再送信しない', () => {
            env.table.updateDocument();
            const countAfterFirst = env.posted.length;
            env.table.updateDocument();
            assert.strictEqual(env.posted.length, countAfterFirst);
        });

        test('isUpdating中は送信しない', () => {
            env.state.isUpdating = true;
            env.table.updateDocument();
            assert.strictEqual(env.posted.length, 0);
            env.state.isUpdating = false;
        });
    });
});
