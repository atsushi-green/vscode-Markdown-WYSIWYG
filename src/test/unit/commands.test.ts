/**
 * commands.test.ts - CommandsModule（コマンド・オートブロック変換）のユニットテスト
 */
import * as assert from 'assert';
import { createEditorEnv, EditorEnv } from './helper';

/** handleXxx 系に渡すキーボードイベントの疑似オブジェクトを作る */
function fakeKeyEvent(key: string, modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) {
    return {
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        ...modifiers,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { /* noop */ }
    };
}

suite('CommandsModule', () => {
    let env: EditorEnv;

    setup(() => {
        env = createEditorEnv();
    });

    /**
     * 指定ノードの先頭にキャレットを置く
     * （utils.placeCaretAt は focus() を呼び、jsdomではセレクションが
     *  エディタ要素にリセットされるため、テストでは直接Rangeを張る）
     */
    function placeCaretIn(node: Node): void {
        const range = env.document.createRange();
        range.setStart(node.firstChild ?? node, 0);
        range.collapse(true);
        const sel = env.window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    suite('applyInlineFormatting', () => {
        test('~~text~~ のライブ変換でdel要素になる', () => {
            env.editor.innerHTML = '<p>~~取り消し~~ 後続</p>';
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, true);
            const del = env.editor.querySelector('del');
            assert.ok(del, env.editor.innerHTML);
            assert.strictEqual(del!.textContent, '取り消し');
        });

        test('++text++ のライブ変換でu要素になる（既存記法の回帰確認）', () => {
            env.editor.innerHTML = '<p>++下線++ 後続</p>';
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, true);
            assert.ok(env.editor.querySelector('u'), env.editor.innerHTML);
        });

        /**
         * 分割テキストノードを持つ段落を組み立てる（実機のcontenteditable相当）。
         * fragments を順に別々のテキストノードとして追加する。
         */
        function appendSplitParagraph(fragments: string[]): HTMLElement {
            const p = env.document.createElement('p');
            for (const frag of fragments) {
                p.appendChild(env.document.createTextNode(frag));
            }
            env.editor.appendChild(p);
            return p;
        }

        test('**太字** が複数テキストノードに割れていてもstrongへ変換される', () => {
            // 実機では入力途中に「**bo」「ld** 後続」のように隣接ノードへ分割される
            appendSplitParagraph(['**bo', 'ld** 後続']);
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            const strong = env.editor.querySelector('strong');
            assert.ok(strong, env.editor.innerHTML);
            assert.strictEqual(strong!.textContent, 'bold');
        });

        test('~~取り消し線~~ が複数テキストノードに割れていてもdelへ変換される', () => {
            appendSplitParagraph(['~~取り', '消し~~ 後続']);
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            const del = env.editor.querySelector('del');
            assert.ok(del, env.editor.innerHTML);
            assert.strictEqual(del!.textContent, '取り消し');
        });

        test('分割ノードでも要素境界はまたいで結合しない（回帰確認）', () => {
            // 既に<strong>がある場合、その前後のテキストは別要素なので結合されない
            env.editor.innerHTML = '<p>前<strong>太字</strong>*斜*後</p>';
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            // 既存のstrongは保持され、*斜* はemになる
            assert.strictEqual(env.editor.querySelectorAll('strong').length, 1);
            assert.ok(env.editor.querySelector('em'), env.editor.innerHTML);
        });
    });

    suite('handleHorizontalRule', () => {
        /** エディタに1ブロック置き、キャレットをその先頭に置く */
        function setupBlock(html: string): HTMLElement {
            env.editor.innerHTML = html;
            const block = env.editor.firstElementChild as HTMLElement;
            placeCaretIn(block);
            return block;
        }

        test('--- の行でEnterを押すと水平線に変換される', () => {
            setupBlock('<p>---</p>');
            const handled = env.commands.handleHorizontalRule(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true);
            assert.ok(env.editor.querySelector('hr'), env.editor.innerHTML);
            // 水平線の直後に編集続行用の段落が挿入される
            const hr = env.editor.querySelector('hr')!;
            assert.strictEqual(hr.nextElementSibling?.tagName, 'P');
        });

        test('*** と ___ も水平線に変換される', () => {
            for (const text of ['***', '___']) {
                env = createEditorEnv();
                setupBlock(`<p>${text}</p>`);
                const handled = env.commands.handleHorizontalRule(fakeKeyEvent('Enter'));
                assert.strictEqual(handled, true, text);
                assert.ok(env.editor.querySelector('hr'), text);
            }
        });

        test('-- （2文字以下）では変換しない', () => {
            setupBlock('<p>--</p>');
            const handled = env.commands.handleHorizontalRule(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, false);
            assert.strictEqual(env.editor.querySelector('hr'), null);
        });

        test('Enter以外のキーでは変換しない', () => {
            setupBlock('<p>---</p>');
            const handled = env.commands.handleHorizontalRule(fakeKeyEvent(' '));
            assert.strictEqual(handled, false);
        });

        test('リスト項目内では変換しない', () => {
            env.editor.innerHTML = '<ul><li>---</li></ul>';
            const li = env.editor.querySelector('li') as HTMLElement;
            placeCaretIn(li);
            const handled = env.commands.handleHorizontalRule(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, false);
            assert.strictEqual(env.editor.querySelector('hr'), null);
        });
    });

    suite('convertTaskLists（タスクリストのライブ変換）', () => {
        /** li直下にチェックボックスがあり、チェック状態が期待通りか検証する */
        function assertTaskItem(li: HTMLElement, checked: boolean): void {
            const box = li.querySelector('input.task-checkbox') as HTMLInputElement | null;
            assert.ok(box, li.outerHTML);
            assert.ok(li.classList.contains('task-list-item'), li.outerHTML);
            assert.strictEqual(box!.hasAttribute('checked'), checked, li.outerHTML);
            // チェックボックスはli直下の先頭要素であること
            assert.strictEqual(li.querySelector('input.task-checkbox')!.parentElement, li);
        }

        test('li先頭の [ ] がチェックボックスへ変換される（- [ ] 入力相当）', () => {
            env.editor.innerHTML = '<ul><li>[ ] 牛乳を買う</li></ul>';
            const { didFormat } = env.commands.convertTaskLists(env.editor);
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            const li = env.editor.querySelector('li') as HTMLElement;
            assertTaskItem(li, false);
            assert.ok(li.textContent!.includes('牛乳を買う'), li.textContent!);
        });

        test('li先頭の [] （中身なし）も変換される（- [] 入力相当）', () => {
            env.editor.innerHTML = '<ul><li>[] タスク</li></ul>';
            const { didFormat } = env.commands.convertTaskLists(env.editor);
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            assertTaskItem(env.editor.querySelector('li') as HTMLElement, false);
        });

        test('li先頭の [x] はチェック済みで変換される', () => {
            env.editor.innerHTML = '<ul><li>[x] 完了済み</li></ul>';
            env.commands.convertTaskLists(env.editor);
            assertTaskItem(env.editor.querySelector('li') as HTMLElement, true);
        });

        test('本文なしの [ ] だけでも変換される（閉じ括弧の直後が行末）', () => {
            env.editor.innerHTML = '<ul><li>[ ]</li></ul>';
            const { didFormat } = env.commands.convertTaskLists(env.editor);
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            assertTaskItem(env.editor.querySelector('li') as HTMLElement, false);
        });

        test('段落先頭の -[] （スペース無し）はタスクリストへ変換される', () => {
            env.editor.innerHTML = '<p>-[] やること</p>';
            const { didFormat } = env.commands.convertTaskLists(env.editor);
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            const ul = env.editor.querySelector('ul');
            assert.ok(ul, env.editor.innerHTML);
            assertTaskItem(ul!.querySelector('li') as HTMLElement, false);
            assert.ok(ul!.textContent!.includes('やること'), ul!.textContent!);
        });

        test('段落先頭の -[x] はチェック済みタスクリストへ変換される', () => {
            env.editor.innerHTML = '<p>-[x] 済</p>';
            env.commands.convertTaskLists(env.editor);
            const li = env.editor.querySelector('li') as HTMLElement;
            assertTaskItem(li, true);
        });

        test('既にチェックボックスを持つli（変換済み）は二重変換しない', () => {
            env.editor.innerHTML =
                '<ul><li class="task-list-item">' +
                '<input type="checkbox" class="task-checkbox" contenteditable="false"> タスク</li></ul>';
            const { didFormat } = env.commands.convertTaskLists(env.editor);
            assert.strictEqual(didFormat, false);
            assert.strictEqual(env.editor.querySelectorAll('input.task-checkbox').length, 1);
        });

        test('タスク記法でない通常のli/段落は変換しない', () => {
            env.editor.innerHTML = '<ul><li>普通の項目</li></ul><p>[未完]の括弧テキスト</p>';
            const { didFormat } = env.commands.convertTaskLists(env.editor);
            assert.strictEqual(didFormat, false);
            assert.strictEqual(env.editor.querySelector('input.task-checkbox'), null);
        });

        test('変換後にhtmlToMarkdownで [ ] / [x] へ往復する（ラウンドトリップ）', () => {
            env.editor.innerHTML = '<ul><li>[ ] 未完</li><li>[x] 完了</li></ul>';
            env.commands.convertTaskLists(env.editor);
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.ok(/\[ \] 未完/.test(md), md);
            assert.ok(/\[x\] 完了/.test(md), md);
        });
    });
});
