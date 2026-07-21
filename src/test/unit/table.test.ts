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

    suite('表の矩形範囲選択（マウスドラッグ）', () => {
        // document の mouseup でドラッグ追跡を終了させる配線（editor.js の initEditor で
        // 一度だけ呼ぶのと同じ）。呼ばないと rangeDragStart が mouseup後も残り、
        // 後続の mouseenter で範囲が誤って更新され続けてしまう。
        setup(() => {
            env.table.setupRangeSelectionMouseUp();
        });

        /** マウスイベントを生成してディスパッチする */
        function dispatchMouse(target: Element, type: string, opts: Record<string, unknown> = {}) {
            const ev = new env.window.MouseEvent(type, Object.assign(
                { bubbles: true, cancelable: true, button: 0, buttons: 1 }, opts
            ));
            target.dispatchEvent(ev);
            return ev;
        }

        /** table.rows経由でrow行・col列のセルを取得する（theadとtbodyをまたぐ） */
        function cellAt(t: HTMLTableElement, row: number, col: number): HTMLElement {
            return Array.from(t.rows[row].cells)[col] as HTMLElement;
        }

        /** cellAからcellBへドラッグして確定するまでの一連のイベントを発火する */
        function dragRange(t: HTMLTableElement, fromRow: number, fromCol: number, toRow: number, toCol: number) {
            const from = cellAt(t, fromRow, fromCol);
            const to = cellAt(t, toRow, toCol);
            dispatchMouse(from, 'mousedown');
            dispatchMouse(to, 'mouseenter');
            dispatchMouse(to, 'mouseup');
        }

        // jsdomレルムで実行される関数が返すプレーンオブジェクトは、そのままだと
        // NodeレルムのオブジェクトリテラルとdeepStrictEqualした際にプロトタイプ不一致で
        // 失敗する（配列のArray.fromと同じ問題）。スプレッドでNodeレルムへコピーしてから比較する。
        const plain = (obj: any) => ({ ...obj });

        suite('cellPosition', () => {
            test('theadとtbodyをまたいだ表示順の行・列インデックスを返す', () => {
                assert.deepStrictEqual(plain(env.table.cellPosition(table, cellAt(table, 0, 0))), { row: 0, col: 0 });
                assert.deepStrictEqual(plain(env.table.cellPosition(table, cellAt(table, 0, 1))), { row: 0, col: 1 });
                assert.deepStrictEqual(plain(env.table.cellPosition(table, cellAt(table, 2, 0))), { row: 2, col: 0 });
            });
        });

        suite('computeCellRange', () => {
            test('開始→終了の方向によらず正規化した矩形範囲を返す', () => {
                assert.deepStrictEqual(
                    plain(env.table.computeCellRange(0, 0, 2, 1)),
                    { minRow: 0, maxRow: 2, minCol: 0, maxCol: 1 }
                );
                assert.deepStrictEqual(
                    plain(env.table.computeCellRange(2, 1, 0, 0)),
                    { minRow: 0, maxRow: 2, minCol: 0, maxCol: 1 }
                );
            });

            test('開始と終了が同じセルなら1x1の範囲になる', () => {
                assert.deepStrictEqual(
                    plain(env.table.computeCellRange(1, 1, 1, 1)),
                    { minRow: 1, maxRow: 1, minCol: 1, maxCol: 1 }
                );
            });
        });

        suite('isCellInRange', () => {
            const range = { minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 };

            test('範囲内の行・列はtrue（境界含む）', () => {
                assert.strictEqual(env.table.isCellInRange(0, 0, range), true);
                assert.strictEqual(env.table.isCellInRange(1, 1, range), true);
            });

            test('範囲外の行・列はfalse', () => {
                assert.strictEqual(env.table.isCellInRange(2, 0, range), false);
                assert.strictEqual(env.table.isCellInRange(0, 2, range), false);
            });
        });

        suite('applyRangeHighlight / clearRangeSelection', () => {
            test('範囲内のセルだけにハイライトclassを付与する', () => {
                const range = { minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 };
                env.table.applyRangeHighlight(table, range);

                assert.strictEqual(cellAt(table, 0, 0).classList.contains('table-cell-range-selected'), true);
                assert.strictEqual(cellAt(table, 1, 1).classList.contains('table-cell-range-selected'), true);
                assert.strictEqual(cellAt(table, 2, 0).classList.contains('table-cell-range-selected'), false);
            });

            test('既存の単一セル選択（table-cell-selected）は範囲確定で解除される', () => {
                env.table.selectCell(cellAt(table, 2, 0), table);
                env.table.applyRangeHighlight(table, { minRow: 0, maxRow: 0, minCol: 0, maxCol: 1 });
                assert.strictEqual(cellAt(table, 2, 0).classList.contains('table-cell-selected'), false);
            });

            test('clearRangeSelectionでハイライトを全解除する', () => {
                env.table.applyRangeHighlight(table, { minRow: 0, maxRow: 2, minCol: 0, maxCol: 1 });
                env.table.clearRangeSelection(table);
                table.querySelectorAll('th, td').forEach(cell => {
                    assert.strictEqual(cell.classList.contains('table-cell-range-selected'), false);
                });
            });
        });

        suite('マウスドラッグでの範囲選択（DOM配線）', () => {
            test('別セルへドラッグすると範囲がハイライトされ、getCurrentCellRangeで参照できる', () => {
                dragRange(table, 0, 0, 1, 1);

                assert.strictEqual(cellAt(table, 0, 0).classList.contains('table-cell-range-selected'), true);
                assert.strictEqual(cellAt(table, 1, 1).classList.contains('table-cell-range-selected'), true);
                assert.strictEqual(cellAt(table, 2, 0).classList.contains('table-cell-range-selected'), false);
                const current = env.table.getCurrentCellRange();
                assert.deepStrictEqual(
                    { table: current.table, range: plain(current.range) },
                    { table: table, range: { minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 } }
                );
            });

            test('mouseupでドラッグ追跡は終了するが、確定した範囲のハイライトは残る', () => {
                dragRange(table, 0, 0, 2, 0);
                // mouseup後にさらにmouseenterしても範囲は更新されない（ドラッグ終了済み）
                dispatchMouse(cellAt(table, 0, 1), 'mouseenter');

                assert.strictEqual(cellAt(table, 2, 0).classList.contains('table-cell-range-selected'), true);
                assert.strictEqual(cellAt(table, 0, 1).classList.contains('table-cell-range-selected'), false);
            });

            test('同一セルでのクリック（ドラッグ無し）は範囲選択を発生させない（既存の単一選択のみ）', () => {
                const cell = cellAt(table, 1, 0);
                dispatchMouse(cell, 'mousedown');
                dispatchMouse(cell, 'mouseup');
                cell.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));

                assert.strictEqual(cell.classList.contains('table-cell-selected'), true);
                table.querySelectorAll('th, td').forEach(c => {
                    assert.strictEqual(c.classList.contains('table-cell-range-selected'), false);
                });
            });

            test('ボタンを離した状態でのmouseenter（ホバーのみ）は範囲を更新しない', () => {
                dispatchMouse(cellAt(table, 0, 0), 'mousedown');
                dispatchMouse(cellAt(table, 1, 1), 'mouseenter', { buttons: 0 });

                assert.strictEqual(env.table.getCurrentCellRange(), null);
            });

            test('右クリック（mousedown button!=0）はドラッグを開始しない', () => {
                dispatchMouse(cellAt(table, 0, 0), 'mousedown', { button: 2, buttons: 2 });
                dispatchMouse(cellAt(table, 1, 1), 'mouseenter', { buttons: 2 });

                assert.strictEqual(env.table.getCurrentCellRange(), null);
            });

            test('範囲選択後に別セルを単純クリックすると範囲ハイライトが解除される', () => {
                dragRange(table, 0, 0, 1, 1);
                assert.notStrictEqual(env.table.getCurrentCellRange(), null);

                const other = cellAt(table, 2, 0);
                other.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));

                assert.strictEqual(env.table.getCurrentCellRange(), null);
                assert.strictEqual(cellAt(table, 0, 0).classList.contains('table-cell-range-selected'), false);
                assert.strictEqual(other.classList.contains('table-cell-selected'), true);
            });
        });

        suite('複数テーブル間の非干渉', () => {
            /** 2つ目の表を追加してレンダリングする */
            function addSecondTable(): HTMLTableElement {
                const div = env.document.createElement('div');
                div.innerHTML = env.markdown.markdownToHtml(TABLE_MD);
                Array.from(div.childNodes).forEach(n => env.editor.appendChild(n));
                env.table.render();
                return env.editor.querySelectorAll('table')[1] as HTMLTableElement;
            }

            test('表1で範囲確定後、表2でドラッグを開始すると表1のハイライトは残留せず解除される（/local-review A-1）', () => {
                const table2 = addSecondTable();

                dragRange(table, 0, 0, 1, 1); // 表1で範囲確定
                assert.ok(table.querySelector('.table-cell-range-selected'), '前提: 表1にハイライトがある');

                dragRange(table2, 0, 0, 1, 1); // 表2で新たに範囲確定

                table.querySelectorAll('th, td').forEach(c => {
                    assert.strictEqual(c.classList.contains('table-cell-range-selected'), false, '表1の残留ハイライトが解除されていない');
                });
                assert.ok(cellAt(table2, 0, 0).classList.contains('table-cell-range-selected'));
                const current = env.table.getCurrentCellRange();
                assert.strictEqual(current.table, table2);
            });

            test('表1で範囲確定後、表2のセルを単純クリックしても表1の残留ハイライトが正しく解除される', () => {
                const table2 = addSecondTable();

                dragRange(table, 0, 0, 1, 1); // 表1で範囲確定
                const cell2 = cellAt(table2, 0, 0);
                dispatchMouse(cell2, 'mousedown');
                dispatchMouse(cell2, 'mouseup');
                cell2.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));

                table.querySelectorAll('th, td').forEach(c => {
                    assert.strictEqual(c.classList.contains('table-cell-range-selected'), false, '表1の残留ハイライトが解除されていない');
                });
                assert.strictEqual(cell2.classList.contains('table-cell-selected'), true);
                assert.strictEqual(env.table.getCurrentCellRange(), null);
            });
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

        test('矩形範囲選択のハイライト（table-cell-range-selected）も除去し、選択状態をリセットする', () => {
            env.table.applyRangeHighlight(table, { minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 });
            assert.ok(table.querySelector('.table-cell-range-selected'), '前提: ハイライトが付いている');

            env.table.cleanup();

            const plainTable = env.editor.querySelector('table')!;
            plainTable.querySelectorAll('th, td').forEach(cell => {
                assert.ok(!cell.classList.contains('table-cell-range-selected'));
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

    suite('buildEmptyTableMarkdown', () => {
        test('ヘッダ1行＋区切り1行＋指定した本文行数を生成する', () => {
            const md: string = env.table.buildEmptyTableMarkdown(2, 3);
            const lines = md.trim().split('\n');
            assert.strictEqual(lines.length, 4, md); // ヘッダ + 区切り + 本文2
            // 区切り行は各列 --- （3列）
            assert.ok(/^\|\s*---\s*(\|\s*---\s*)+\|$/.test(lines[1]), lines[1]);
        });

        test('markdownToHtmlに通すと指定した列数・本文行数のtableになる', () => {
            const md: string = env.table.buildEmptyTableMarkdown(2, 3);
            const holder = env.document.createElement('div');
            holder.innerHTML = env.markdown.markdownToHtml(md);
            const table = holder.querySelector('table') as HTMLTableElement;
            assert.ok(table, holder.innerHTML);
            assert.strictEqual(table.querySelectorAll('thead th').length, 3);
            assert.strictEqual(table.querySelectorAll('tbody tr').length, 2);
        });

        test('rows/colsが0以下でも最低1行1列を保証する', () => {
            const md: string = env.table.buildEmptyTableMarkdown(0, 0);
            const holder = env.document.createElement('div');
            holder.innerHTML = env.markdown.markdownToHtml(md);
            const table = holder.querySelector('table') as HTMLTableElement;
            assert.ok(table, md);
            assert.strictEqual(table.querySelectorAll('thead th').length, 1);
            assert.strictEqual(table.querySelectorAll('tbody tr').length, 1);
        });
    });

    suite('insertTable', () => {
        test('キャレット位置のブロック直後に空テーブルを挿入し即インタラクティブ化する', () => {
            env.editor.innerHTML = '<p>本文</p>';
            const p = env.editor.querySelector('p')!;
            const range = env.document.createRange();
            range.setStart(p.firstChild!, 0);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            env.table.insertTable(2, 3);

            const container = env.editor.querySelector('.table-container');
            assert.ok(container, env.editor.innerHTML);
            const table = container!.querySelector('table');
            assert.ok(table!.classList.contains('table-rendered'));
            assert.strictEqual(table!.querySelectorAll('thead th').length, 3);
            assert.strictEqual(table!.querySelectorAll('tbody tr').length, 2);
            // 段落の後ろに入っている
            assert.ok(
                p.compareDocumentPosition(container!) & env.window.Node.DOCUMENT_POSITION_FOLLOWING
            );
        });

        test('キャレットが無ければ末尾へ挿入する', () => {
            env.editor.innerHTML = '<p>既存</p>';
            const sel = env.window.getSelection();
            sel.removeAllRanges();

            env.table.insertTable(1, 2);

            const table = env.editor.querySelector('.table-container table');
            assert.ok(table, env.editor.innerHTML);
            assert.strictEqual(table!.querySelectorAll('thead th').length, 2);
        });
    });

    suite('computeMenuPosition', () => {
        test('ビューポート内ならクリック座標をそのまま使う', () => {
            const pos = env.table.computeMenuPosition(100, 120, 180, 40, 1024, 768);
            assert.strictEqual(pos.left, 100);
            assert.strictEqual(pos.top, 120);
        });

        test('右端・下端からはみ出すなら内側へ寄せる', () => {
            const pos = env.table.computeMenuPosition(1000, 760, 180, 40, 1024, 768);
            assert.strictEqual(pos.left, 1024 - 180 - 10);
            assert.strictEqual(pos.top, 768 - 40 - 10);
        });

        test('メニューがビューポートより大きくても負にはしない', () => {
            const pos = env.table.computeMenuPosition(5, 5, 2000, 2000, 1024, 768);
            assert.strictEqual(pos.left, 0);
            assert.strictEqual(pos.top, 0);
        });
    });

    suite('clampTableDimensions', () => {
        test('正常な文字列/数値は整数化してそのまま返す', () => {
            assert.deepStrictEqual(
                { ...env.table.clampTableDimensions('4', '5') }, { rows: 4, cols: 5 }
            );
            assert.deepStrictEqual(
                { ...env.table.clampTableDimensions(2, 3) }, { rows: 2, cols: 3 }
            );
        });

        test('空・非数値・0以下は1へ丸める', () => {
            assert.deepStrictEqual({ ...env.table.clampTableDimensions('', 'x') }, { rows: 1, cols: 1 });
            assert.deepStrictEqual({ ...env.table.clampTableDimensions('0', '-3') }, { rows: 1, cols: 1 });
        });

        test('上限（行50・列20）を超える値は上限へ丸める', () => {
            assert.deepStrictEqual(
                { ...env.table.clampTableDimensions('999', '999') }, { rows: 50, cols: 20 }
            );
        });
    });

    suite('findExcludedAncestor', () => {
        test('数式・Mermaid・テーブル上は該当要素を返す（挿入メニュー非表示）', () => {
            env.editor.innerHTML =
                '<div class="math-block"><span>x</span></div>' +
                '<div class="table-container"><table><tbody><tr><td>a</td></tr></tbody></table></div>';
            const mathSpan = env.editor.querySelector('.math-block span')!;
            const td = env.editor.querySelector('td')!;
            assert.ok(env.table.findExcludedAncestor(mathSpan, env.editor));
            assert.ok(env.table.findExcludedAncestor(td, env.editor));
        });

        test('平文段落上では null（＝除外対象ではない）', () => {
            env.editor.innerHTML = '<p>ただの本文</p>';
            const p = env.editor.querySelector('p')!;
            assert.strictEqual(env.table.findExcludedAncestor(p.firstChild, env.editor), null);
        });
    });

    suite('isBlockEmpty', () => {
        test('空・<br>のみのブロックは空と判定', () => {
            const holder = env.document.createElement('div');
            holder.innerHTML = '<p></p><p><br></p><p>   </p>';
            const ps = holder.querySelectorAll('p');
            ps.forEach((p) => assert.strictEqual(env.table.isBlockEmpty(p), true, p.outerHTML));
        });

        test('テキストや<br>以外の要素を含むブロックは空でない', () => {
            const holder = env.document.createElement('div');
            holder.innerHTML = '<p>あ</p><p><img src="x"></p>';
            const ps = holder.querySelectorAll('p');
            assert.strictEqual(env.table.isBlockEmpty(ps[0]), false);
            assert.strictEqual(env.table.isBlockEmpty(ps[1]), false);
        });
    });

    suite('shouldShowInsertMenu', () => {
        test('空行・エディタ余白では true', () => {
            env.editor.innerHTML = '<p><br></p>';
            const emptyP = env.editor.querySelector('p')!;
            assert.strictEqual(env.table.shouldShowInsertMenu(emptyP, env.editor), true);
            assert.strictEqual(env.table.shouldShowInsertMenu(env.editor, env.editor), true);
        });

        test('本文テキスト上では false（ブラウザ既定メニューを尊重）', () => {
            env.editor.innerHTML = '<p>本文あり</p>';
            const p = env.editor.querySelector('p')!;
            assert.strictEqual(env.table.shouldShowInsertMenu(p.firstChild, env.editor), false);
        });

        test('数式・テーブル上では false', () => {
            env.editor.innerHTML =
                '<div class="math-block"><span>x</span></div>' +
                '<div class="table-container"><table><tbody><tr><td>a</td></tr></tbody></table></div>';
            assert.strictEqual(
                env.table.shouldShowInsertMenu(env.editor.querySelector('.math-block span'), env.editor),
                false
            );
            assert.strictEqual(
                env.table.shouldShowInsertMenu(env.editor.querySelector('td'), env.editor),
                false
            );
        });
    });

    suite('setupContextMenu と挿入ダイアログ', () => {
        function dispatchContextMenu(target: Element, clientX = 40, clientY = 40) {
            const ev = new env.window.MouseEvent('contextmenu', {
                bubbles: true, cancelable: true, clientX, clientY
            });
            target.dispatchEvent(ev);
            return ev;
        }

        test('空行の右クリックでメニューを表示し既定メニューを抑止する', () => {
            env.table.setupContextMenu(env.editor);
            env.editor.innerHTML = '<p><br></p>';
            const emptyP = env.editor.querySelector('p')!;

            const ev = dispatchContextMenu(emptyP);
            assert.strictEqual(ev.defaultPrevented, true);
            const menu = env.document.getElementById('tableContextMenu')!;
            assert.strictEqual(menu.style.display, 'block');
        });

        test('本文テキスト上の右クリックではメニューを出さず既定に任せる（回帰防止）', () => {
            env.table.setupContextMenu(env.editor);
            env.editor.innerHTML = '<p>本文あり</p>';
            const p = env.editor.querySelector('p')!;

            const ev = dispatchContextMenu(p.firstChild as unknown as Element);
            assert.strictEqual(ev.defaultPrevented, false, 'native menu preserved on text');
            const menu = env.document.getElementById('tableContextMenu');
            assert.ok(!menu || menu.style.display === 'none');
        });

        test('テーブル上の右クリックではメニューを出さず既定に任せる', () => {
            env.table.setupContextMenu(env.editor);
            env.editor.innerHTML =
                '<div class="table-container"><table><tbody><tr><td>a</td></tr></tbody></table></div>';
            const td = env.editor.querySelector('td')!;

            const ev = dispatchContextMenu(td);
            assert.strictEqual(ev.defaultPrevented, false);
            const menu = env.document.getElementById('tableContextMenu');
            // メニューは未生成 or 非表示
            assert.ok(!menu || menu.style.display === 'none');
        });

        test('メニュー項目クリックで行数・列数ダイアログが開く', () => {
            env.table.setupContextMenu(env.editor);
            env.editor.innerHTML = '<p><br></p>';
            dispatchContextMenu(env.editor.querySelector('p')!);

            const item = env.document.querySelector(
                '.table-menu-item[data-action="insertTable"]'
            ) as HTMLElement;
            assert.ok(item);
            item.click();

            const dialog = env.document.getElementById('tableInsertDialog')!;
            assert.notStrictEqual(dialog.style.display, 'none');
            assert.strictEqual(env.document.getElementById('tableContextMenu')!.style.display, 'none');
        });

        test('ダイアログでOKを押すと指定サイズの表を挿入する', () => {
            env.table.setupContextMenu(env.editor);
            env.editor.innerHTML = '<p>本文</p>';
            env.table.showInsertDialog();

            const dialog = env.document.getElementById('tableInsertDialog')!;
            const inputs = dialog.querySelectorAll('input');
            (inputs[0] as HTMLInputElement).value = '3'; // 行数
            (inputs[1] as HTMLInputElement).value = '4'; // 列数
            const ok = dialog.querySelector('.link-dialog-btn-primary') as HTMLElement;
            ok.click();

            const table = env.editor.querySelector('.table-container table')!;
            assert.ok(table, env.editor.innerHTML);
            assert.strictEqual(table.querySelectorAll('thead th').length, 4);
            assert.strictEqual(table.querySelectorAll('tbody tr').length, 3);
            assert.strictEqual(dialog.style.display, 'none', 'dialog closes after insert');
        });

        test('setPendingInsertRangeで指定した位置は、ダイアログを開く操作でライブ選択が別の場所へ動いても確定時にそこへ復元されて使われる', () => {
            // スラッシュコマンドメニュー等、右クリック以外からshowInsertDialogを呼ぶ経路を想定。
            env.editor.innerHTML = '<p>1つ目</p><p>2つ目</p>';
            const first = env.editor.querySelectorAll('p')[0];
            const pendingRange = env.document.createRange();
            pendingRange.selectNodeContents(first);
            pendingRange.collapse(true);
            env.table.setPendingInsertRange(pendingRange);

            // ダイアログを開く前に、ライブの選択を無関係な場所へ動かす
            // （数値入力へフォーカスが移ると選択が失われる状況を模す）。
            const second = env.editor.querySelectorAll('p')[1];
            const liveRange = env.document.createRange();
            liveRange.selectNodeContents(second);
            liveRange.collapse(true);
            const selection = env.window.getSelection();
            selection.removeAllRanges();
            selection.addRange(liveRange);

            env.table.showInsertDialog();
            const dialog = env.document.getElementById('tableInsertDialog')!;
            const ok = dialog.querySelector('.link-dialog-btn-primary') as HTMLElement;
            ok.click();

            // pendingInsertRangeで指定した「1つ目」の直後（＝「2つ目」の手前）に挿入される
            const children = Array.from(env.editor.children);
            assert.strictEqual(children.length, 3, env.editor.innerHTML);
            assert.strictEqual(children[0].tagName, 'P');
            assert.strictEqual(children[0].textContent, '1つ目');
            assert.ok(children[1].querySelector('table'), env.editor.innerHTML);
            assert.strictEqual(children[2].tagName, 'P');
            assert.strictEqual(children[2].textContent, '2つ目');
        });

        test('showInsertDialogのコールバックはOK確定時にのみ呼ばれる（キャンセルでは呼ばれない）', () => {
            // スラッシュコマンドメニューはこのコールバックで「/」プレースホルダの後始末をする。
            // キャンセル時にも呼ばれてしまうと、まだ何も挿入していないのに後始末をしてしまう
            // （＝入力していた文字が復元不能に消えるバグになる）ため、呼び分けを検証する。
            env.editor.innerHTML = '<p><br></p>';
            let confirmedCount = 0;

            env.table.showInsertDialog(() => { confirmedCount++; });
            let dialog = env.document.getElementById('tableInsertDialog')!;
            const cancelBtn = dialog.querySelector('.link-dialog-btn:not(.link-dialog-btn-primary)') as HTMLElement;
            cancelBtn.click();
            assert.strictEqual(confirmedCount, 0, 'キャンセルではコールバックを呼ばない');
            assert.strictEqual(dialog.style.display, 'none');

            env.table.showInsertDialog(() => { confirmedCount++; });
            dialog = env.document.getElementById('tableInsertDialog')!;
            const ok = dialog.querySelector('.link-dialog-btn-primary') as HTMLElement;
            ok.click();
            assert.strictEqual(confirmedCount, 1, 'OK確定では1回だけコールバックを呼ぶ');
        });

        test('コールバック無しでshowInsertDialogを呼んでも例外にならない（右クリックメニュー経路との後方互換）', () => {
            env.editor.innerHTML = '<p><br></p>';
            assert.doesNotThrow(() => env.table.showInsertDialog());
            const dialog = env.document.getElementById('tableInsertDialog')!;
            const ok = dialog.querySelector('.link-dialog-btn-primary') as HTMLElement;
            assert.doesNotThrow(() => ok.click());
        });
    });
});
