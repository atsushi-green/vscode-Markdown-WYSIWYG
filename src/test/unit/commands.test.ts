/**
 * commands.test.ts - CommandsModule（コマンド・オートブロック変換）のユニットテスト
 */
import * as assert from 'assert';
import { createEditorEnv, EditorEnv } from './helper';

/** handleXxx 系に渡すキーボードイベントの疑似オブジェクトを作る */
function fakeKeyEvent(key: string, modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) {
    return {
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
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

    suite('handleAutoBlock（ネスト引用の入力）', () => {
        /** 指定ノードの先頭テキストノード末尾にキャレットを置く */
        function placeCaretAtEnd(node: Node): void {
            const text = (node.firstChild ?? node) as Text;
            const range = env.document.createRange();
            range.setStart(text, text.textContent!.length);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        test('引用ブロック内で「> 」を入力するとネスト引用ができる', () => {
            env.editor.innerHTML = '<blockquote>&gt;</blockquote>';
            placeCaretAtEnd(env.editor.querySelector('blockquote') as HTMLElement);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('blockquote > blockquote'), env.editor.innerHTML);
        });

        test('ネストした引用は htmlToMarkdown で `> > text` へ往復する', () => {
            env.editor.innerHTML = '<blockquote>&gt;</blockquote>';
            placeCaretAtEnd(env.editor.querySelector('blockquote') as HTMLElement);
            env.commands.handleAutoBlock(fakeKeyEvent(' '));
            const nested = env.editor.querySelector('blockquote > blockquote') as HTMLElement;
            nested.textContent = 'ネスト';
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.ok(/^> > ネスト$/m.test(md), JSON.stringify(md));
        });

        test('行頭が「>」だけでない（既存テキストあり）場合はネストしない', () => {
            env.editor.innerHTML = '<blockquote>既存 &gt;</blockquote>';
            placeCaretAtEnd(env.editor.querySelector('blockquote') as HTMLElement);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, false);
            assert.strictEqual(env.editor.querySelector('blockquote > blockquote'), null);
        });

        test('通常段落の「> 」は従来どおり単一の引用になる（ネストしない・回帰確認）', () => {
            env.editor.innerHTML = '<p>&gt;</p>';
            placeCaretAtEnd(env.editor.querySelector('p') as HTMLElement);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('blockquote'), env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('blockquote > blockquote'), null);
        });
    });

    suite('handleBlockquoteEnter（引用内のEnter/Shift+Enter）', () => {
        /** 指定要素の先頭テキストノードの指定オフセットにキャレットを置く */
        function placeCaretAt(node: Node, offset: number): void {
            const text = (node.firstChild ?? node) as Text;
            const range = env.document.createRange();
            range.setStart(text, offset);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        /** 先頭テキストノードの末尾にキャレットを置く */
        function placeCaretAtEnd(node: Node): void {
            const text = (node.firstChild ?? node) as Text;
            placeCaretAt(node, text.textContent!.length);
        }

        test('Shift+Enterで引用内に<br>が挿入される', () => {
            env.editor.innerHTML = '<blockquote>行1</blockquote>';
            const bq = env.editor.querySelector('blockquote') as HTMLElement;
            placeCaretAtEnd(bq);
            const handled = env.commands.handleBlockquoteEnter(fakeKeyEvent('Enter', { shiftKey: true }));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.ok(bq.querySelector('br'), env.editor.innerHTML);
        });

        test('Shift+Enterの改行は htmlToMarkdown で2つの `> ` 行へ往復する', () => {
            env.editor.innerHTML = '<blockquote>行1</blockquote>';
            const bq = env.editor.querySelector('blockquote') as HTMLElement;
            placeCaretAtEnd(bq);
            env.commands.handleBlockquoteEnter(fakeKeyEvent('Enter', { shiftKey: true }));
            bq.appendChild(env.document.createTextNode('行2'));
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.ok(/^> 行1$/m.test(md), JSON.stringify(md));
            assert.ok(/^> 行2$/m.test(md), JSON.stringify(md));
        });

        test('Enterを引用の末尾で押すと引用を抜けて後続の段落へ移る', () => {
            env.editor.innerHTML = '<blockquote>引用</blockquote>';
            const bq = env.editor.querySelector('blockquote') as HTMLElement;
            placeCaretAtEnd(bq);
            const handled = env.commands.handleBlockquoteEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.strictEqual(bq.nextElementSibling?.tagName, 'P', env.editor.innerHTML);
        });

        test('Enterを引用の途中で押した場合は何もしない（false）', () => {
            env.editor.innerHTML = '<blockquote>引用テキスト</blockquote>';
            const bq = env.editor.querySelector('blockquote') as HTMLElement;
            placeCaretAt(bq, 2);
            const handled = env.commands.handleBlockquoteEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, false);
            assert.strictEqual(bq.nextElementSibling, null);
        });

        test('ネストした引用の末尾でEnterすると最も外側の引用を抜ける', () => {
            env.editor.innerHTML = '<blockquote><blockquote>内側</blockquote></blockquote>';
            const inner = env.editor.querySelector('blockquote > blockquote') as HTMLElement;
            placeCaretAtEnd(inner);
            const handled = env.commands.handleBlockquoteEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const outer = env.editor.querySelector('blockquote') as HTMLElement;
            assert.strictEqual(outer.nextElementSibling?.tagName, 'P', env.editor.innerHTML);
        });

        test('引用ブロックの外では何もしない（false）', () => {
            env.editor.innerHTML = '<p>ふつうの段落</p>';
            placeCaretAtEnd(env.editor.querySelector('p') as HTMLElement);
            const handled = env.commands.handleBlockquoteEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, false);
        });
    });

    suite('insertToc（目次の生成・挿入）', () => {
        /** 見出しHTMLを組み立てる（実レンダリングと同じ heading-hash スパン付き） */
        function heading(level: number, text: string): string {
            return `<h${level}><span class="heading-hash">${'#'.repeat(level)} </span>${text}</h${level}>`;
        }

        test('見出しから目次リストを生成して挿入する', () => {
            env.editor.innerHTML =
                heading(1, 'タイトル') + heading(2, '節A') + heading(2, '節B') + '<p>本文</p>';
            env.commands.insertToc();
            const ul = env.editor.querySelector('ul');
            assert.ok(ul, env.editor.innerHTML);
            const links = ul!.querySelectorAll('a');
            assert.strictEqual(links.length, 3);
            assert.strictEqual(links[0].getAttribute('href'), '#タイトル');
            assert.strictEqual(links[1].getAttribute('href'), '#節a');
        });

        test('heading-hashスパンの「#」は目次テキストに含まれない', () => {
            env.editor.innerHTML = heading(2, 'はじめに');
            env.commands.insertToc();
            const link = env.editor.querySelector('ul a');
            assert.ok(link, env.editor.innerHTML);
            assert.strictEqual(link!.textContent, 'はじめに');
        });

        test('見出しが無い場合は目次を挿入しない', () => {
            env.editor.innerHTML = '<p>本文だけ</p>';
            env.commands.insertToc();
            assert.strictEqual(env.editor.querySelector('ul'), null);
        });

        test('挿入した目次は htmlToMarkdown で入れ子リンク付きリストになる', () => {
            env.editor.innerHTML = heading(1, 'Title') + heading(2, 'Sub');
            env.commands.insertToc();
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.ok(/\* \[Title\]\(#title\)/.test(md), md);
            assert.ok(/ {2}\* \[Sub\]\(#sub\)/.test(md), md);
        });
    });
});
