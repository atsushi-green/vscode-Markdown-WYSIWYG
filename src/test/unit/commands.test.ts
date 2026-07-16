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

        test('インラインコード内の記法はライブ変換で装飾されずcodeに保持される', () => {
            env.editor.innerHTML = '<p>`**太字**` 後続</p>';
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            const code = env.editor.querySelector('code');
            assert.ok(code, env.editor.innerHTML);
            // コード内はstrong化されず、記法文字がそのまま残る
            assert.strictEqual(code!.textContent, '**太字**');
            assert.strictEqual(code!.querySelector('strong'), null, env.editor.innerHTML);
        });

        test('インラインコードの外側の記法はライブ変換で装飾される', () => {
            env.editor.innerHTML = '<p>`code` と **太字**</p>';
            env.commands.applyInlineFormatting();
            assert.ok(env.editor.querySelector('code'), env.editor.innerHTML);
            const strong = env.editor.querySelector('strong');
            assert.ok(strong, env.editor.innerHTML);
            assert.strictEqual(strong!.textContent, '太字');
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

    suite('handleAutoBlock（引用・リストのプレフィックス変換）', () => {
        /** 指定テキストノードの指定オフセットにキャレットを置く */
        function caretAt(node: Node, offset: number): void {
            const range = env.document.createRange();
            range.setStart(node, offset);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        test('エディタ直下の裸テキスト「>」でも引用に変換される（空ドキュメント入力）', () => {
            const t = env.document.createTextNode('>');
            env.editor.appendChild(t);
            caretAt(t, 1);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('blockquote'), env.editor.innerHTML);
        });

        test('空の引用にはプレースホルダ<br>が入る（高さゼロで不可視になるのを防ぐ）', () => {
            env.editor.innerHTML = '<p>></p>';
            caretAt(env.editor.querySelector('p')!.firstChild as Text, 1);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const bq = env.editor.querySelector('blockquote');
            assert.ok(bq, env.editor.innerHTML);
            assert.ok(bq!.querySelector('br'), env.editor.innerHTML);
        });

        test('本文が続く「> text」の変換ではプレースホルダを入れずtextを保持する', () => {
            env.editor.innerHTML = '<p>>テキスト</p>';
            caretAt(env.editor.querySelector('p')!.firstChild as Text, 1);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const bq = env.editor.querySelector('blockquote');
            assert.strictEqual(bq?.textContent, 'テキスト', env.editor.innerHTML);
            assert.strictEqual(bq?.querySelector('br'), null, env.editor.innerHTML);
        });

        test('空のリスト項目にもプレースホルダ<br>が入る', () => {
            env.editor.innerHTML = '<p>-</p>';
            caretAt(env.editor.querySelector('p')!.firstChild as Text, 1);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const li = env.editor.querySelector('ul > li');
            assert.ok(li?.querySelector('br'), env.editor.innerHTML);
        });

        test('エディタ直下の裸テキストでもプレフィックス以外では発火しない', () => {
            const t = env.document.createTextNode('こんにちは');
            env.editor.appendChild(t);
            caretAt(t, 5);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, false);
            // 副作用（P化）も起きない
            assert.strictEqual(env.editor.querySelector('p'), null, env.editor.innerHTML);
        });

        test('複数行段落の2行目の「>」が引用に変換される', () => {
            env.editor.innerHTML = '<p>line1<br>></p>';
            const t = env.editor.querySelector('p')!.lastChild as Text;
            caretAt(t, 1);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const bq = env.editor.querySelector('blockquote');
            assert.ok(bq, env.editor.innerHTML);
            // 1行目は段落として残る
            const p = env.editor.querySelector('p');
            assert.strictEqual(p?.textContent, 'line1', env.editor.innerHTML);
        });

        test('複数行段落の中間行の「>」は前後の行を残して引用に変換される', () => {
            env.editor.innerHTML = '<p>line1<br>><br>line3</p>';
            const t = env.editor.querySelector('p')!.childNodes[2] as Text;
            caretAt(t, 1);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const children = Array.from(env.editor.children).map(el => el.tagName);
            assert.deepStrictEqual(children, ['P', 'BLOCKQUOTE', 'P'], env.editor.innerHTML);
            assert.strictEqual(env.editor.children[0].textContent, 'line1');
            assert.strictEqual(env.editor.children[2].textContent, 'line3');
        });

        test('複数行段落の2行目の「-」はリストに変換される', () => {
            env.editor.innerHTML = '<p>line1<br>-</p>';
            const t = env.editor.querySelector('p')!.lastChild as Text;
            caretAt(t, 1);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('ul > li'), env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('p')?.textContent, 'line1');
        });

        test('2行目の途中（行頭以外）では発火しない', () => {
            env.editor.innerHTML = '<p>line1<br>text></p>';
            const t = env.editor.querySelector('p')!.lastChild as Text;
            caretAt(t, 5);
            const handled = env.commands.handleAutoBlock(fakeKeyEvent(' '));
            assert.strictEqual(handled, false);
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

        test('引用末尾のShift+Enter 1回でプレースホルダ<br>が補われ改行が見える', () => {
            env.editor.innerHTML = '<blockquote>行1</blockquote>';
            const bq = env.editor.querySelector('blockquote') as HTMLElement;
            placeCaretAtEnd(bq);
            env.commands.handleBlockquoteEnter(fakeKeyEvent('Enter', { shiftKey: true }));
            // 末尾の<br>1つだけでは描画上改行が見えないため、2つ必要
            assert.strictEqual(bq.querySelectorAll('br').length, 2, env.editor.innerHTML);
            // キャレットは1つ目と2つ目の<br>の間（新しい行の先頭）
            const sel = env.window.getSelection();
            const range = sel.getRangeAt(0);
            const brs = bq.querySelectorAll('br');
            assert.strictEqual(range.comparePoint(bq, Array.from(bq.childNodes).indexOf(brs[1])), 0, env.editor.innerHTML);
        });

        test('プレースホルダ<br>はMarkdownへ余分な行を出力しない', () => {
            env.editor.innerHTML = '<blockquote>行1</blockquote>';
            const bq = env.editor.querySelector('blockquote') as HTMLElement;
            placeCaretAtEnd(bq);
            env.commands.handleBlockquoteEnter(fakeKeyEvent('Enter', { shiftKey: true }));
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML).trim();
            assert.strictEqual(md, '> 行1', JSON.stringify(md));
        });

        test('引用の途中のShift+Enterではプレースホルダを補わない', () => {
            env.editor.innerHTML = '<blockquote>行1</blockquote>';
            const bq = env.editor.querySelector('blockquote') as HTMLElement;
            placeCaretAt(bq, 1); // 「行」と「1」の間
            env.commands.handleBlockquoteEnter(fakeKeyEvent('Enter', { shiftKey: true }));
            assert.strictEqual(bq.querySelectorAll('br').length, 1, env.editor.innerHTML);
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

    suite('handleLinkClick（リンクのクリック挙動）', () => {
        /** クリックイベントの代用オブジェクト（target は指定要素） */
        function fakeClick(target: unknown, modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean }> = {}) {
            return {
                target,
                ctrlKey: false,
                metaKey: false,
                ...modifiers,
                defaultPrevented: false,
                preventDefault() { this.defaultPrevented = true; },
                stopPropagation() { /* noop */ }
            };
        }
        /** エディタ内の唯一のリンク要素 */
        function link(): HTMLElement {
            return env.editor.querySelector('a') as HTMLElement;
        }
        /**
         * openLink メッセージが1件だけpostされたことを検証する。
         * postされるオブジェクトはjsdom側のrealmで生成されるため、
         * deepStrictEqual（プロトタイプ検査）ではなくフィールドで比較する。
         */
        function assertPostedOpenLink(href: string): void {
            assert.strictEqual(env.posted.length, 1, JSON.stringify(env.posted));
            assert.strictEqual(env.posted[0].type, 'openLink');
            assert.strictEqual(env.posted[0].href, href);
        }

        test('通常クリックでは外部リンクへ飛ばない', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            const e = fakeClick(link());
            assert.strictEqual(env.commands.handleLinkClick(e), false);
            assert.deepStrictEqual(env.posted, []);
        });

        test('通常クリックでは既定動作を抑止しない（キャレット設置を妨げない）', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            const e = fakeClick(link());
            env.commands.handleLinkClick(e);
            assert.strictEqual(e.defaultPrevented, false, 'preventDefaultするとキャレットが動かなくなる');
        });

        test('Ctrl+クリックではキャレットを動かさない（既定動作を抑止する）', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            const e = fakeClick(link(), { ctrlKey: true });
            env.commands.handleLinkClick(e);
            assert.strictEqual(e.defaultPrevented, true, env.editor.innerHTML);
        });

        test('生Markdown展開中のリンクもCmd+クリックで開ける（キャレットが既にリンク内にある場合）', () => {
            // クリックでキャレットが入ると <a> は span.raw-markdown へ置き換わるため、
            // その状態からの修飾キー+クリックでも遷移できる必要がある
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            const range = env.document.createRange();
            range.setStart(link().firstChild as Text, 1);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            env.commands.syncRawMarkdownToCaret();
            const span = env.editor.querySelector('span.raw-markdown') as HTMLElement;
            assert.ok(span, '前提: リンクが展開されている');
            assert.strictEqual(env.commands.handleLinkClick(fakeClick(span, { metaKey: true })), true);
            assertPostedOpenLink('https://example.com');
        });

        test('生Markdown展開中でも記法が壊れていれば開かない', () => {
            env.editor.innerHTML = '<p><span class="raw-markdown">[サイト](https://example.com</span></p>';
            const span = env.editor.querySelector('span.raw-markdown') as HTMLElement;
            assert.strictEqual(env.commands.handleLinkClick(fakeClick(span, { metaKey: true })), false);
            assert.deepStrictEqual(env.posted, []);
        });

        test('Ctrl+クリックで外部リンクを開くよう拡張機能へ通知する', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            const e = fakeClick(link(), { ctrlKey: true });
            assert.strictEqual(env.commands.handleLinkClick(e), true);
            assertPostedOpenLink('https://example.com');
        });

        test('Cmd+クリック（macOS）でも外部リンクを開く', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            assert.strictEqual(env.commands.handleLinkClick(fakeClick(link(), { metaKey: true })), true);
            assertPostedOpenLink('https://example.com');
        });

        test('通常クリックではページ内アンカーへスクロールしない', () => {
            env.editor.innerHTML = '<h2 id="見出し">見出し</h2><p><a href="#見出し">目次リンク</a></p>';
            const heading = env.editor.querySelector('h2') as HTMLElement;
            let scrolled = false;
            (heading as unknown as { scrollIntoView: () => void }).scrollIntoView = () => { scrolled = true; };
            assert.strictEqual(env.commands.handleLinkClick(fakeClick(link())), false);
            assert.strictEqual(scrolled, false, '通常クリックでスクロールしている');
        });

        test('Ctrl+クリックでページ内アンカーの見出しへスクロールする', () => {
            env.editor.innerHTML = '<h2 id="見出し">見出し</h2><p><a href="#見出し">目次リンク</a></p>';
            const heading = env.editor.querySelector('h2') as HTMLElement;
            let scrolled = false;
            (heading as unknown as { scrollIntoView: () => void }).scrollIntoView = () => { scrolled = true; };
            assert.strictEqual(env.commands.handleLinkClick(fakeClick(link(), { ctrlKey: true })), true);
            assert.strictEqual(scrolled, true, 'アンカー先へスクロールしていない');
            assert.deepStrictEqual(env.posted, [], 'アンカーは外部リンクとして開かない');
        });

        test('javascript: など許可外のスキームはCtrl+クリックでも開かない', () => {
            env.editor.innerHTML = '<p><a href="javascript:alert(1)">あやしいリンク</a></p>';
            assert.strictEqual(env.commands.handleLinkClick(fakeClick(link(), { ctrlKey: true })), false);
            assert.deepStrictEqual(env.posted, []);
        });

        test('相対パスのリンクはCtrl+クリックでも何もしない（キャレット設置のみ）', () => {
            env.editor.innerHTML = '<p><a href="./other.md">別のファイル</a></p>';
            assert.strictEqual(env.commands.handleLinkClick(fakeClick(link(), { ctrlKey: true })), false);
            assert.deepStrictEqual(env.posted, []);
        });

        test('mailto: リンクはCtrl+クリックで開く', () => {
            env.editor.innerHTML = '<p><a href="mailto:a@example.com">メール</a></p>';
            assert.strictEqual(env.commands.handleLinkClick(fakeClick(link(), { ctrlKey: true })), true);
            assertPostedOpenLink('mailto:a@example.com');
        });

        test('リンク以外のCtrl+クリックでは何もしない（false）', () => {
            env.editor.innerHTML = '<p>ふつうの段落</p>';
            const e = fakeClick(env.editor.querySelector('p'), { ctrlKey: true });
            assert.strictEqual(env.commands.handleLinkClick(e), false);
            assert.strictEqual(e.defaultPrevented, false, 'リンク以外で既定動作を抑止している');
        });

        test('リンク内の装飾要素をクリックしてもリンクとして扱う', () => {
            env.editor.innerHTML = '<p><a href="https://example.com"><strong>太字リンク</strong></a></p>';
            const strong = env.editor.querySelector('strong') as HTMLElement;
            assert.strictEqual(env.commands.handleLinkClick(fakeClick(strong, { ctrlKey: true })), true);
            assertPostedOpenLink('https://example.com');
        });
    });

    suite('syncRawMarkdownToCaret（リンク上の生Markdown表示）', () => {
        /** 指定ノードの指定オフセットにキャレットを置く */
        function caretIn(node: Node, offset: number): void {
            const range = env.document.createRange();
            range.setStart(node, offset);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        /** リンクのテキストノードの指定オフセットにキャレットを置く */
        function caretInLink(offset: number): void {
            const a = env.editor.querySelector('a') as HTMLElement;
            caretIn(a.firstChild as Text, offset);
        }
        /** 生Markdown表示中のspanを返す */
        function rawSpan(): HTMLElement | null {
            return env.editor.querySelector('span.raw-markdown');
        }

        test('リンクの内側にキャレットがあると生Markdownへ展開される', () => {
            env.editor.innerHTML = '<p>前<a href="https://example.com">サイト</a>後</p>';
            caretInLink(1);
            const changed = env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(changed, true, env.editor.innerHTML);
            assert.strictEqual(rawSpan()?.textContent, '[サイト](https://example.com)', env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('a'), null, env.editor.innerHTML);
        });

        test('リンクテキストの途中（境界以外）でも展開される', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト名</a></p>';
            caretInLink(2); // 「サイ」と「ト名」の間
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(rawSpan()?.textContent, '[サイト名](https://example.com)', env.editor.innerHTML);
        });

        test('展開時のキャレットはリンクテキスト内の相対位置を保つ（`[` の分だけ後ろ）', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            env.editor.focus(); // 実機同様、キャレットがリンク内にある＝エディタはフォーカス済み
            caretInLink(2);
            env.commands.syncRawMarkdownToCaret();
            const range = env.window.getSelection().getRangeAt(0);
            assert.strictEqual(range.startContainer, rawSpan()!.firstChild, env.editor.innerHTML);
            assert.strictEqual(range.startOffset, 3, '`[` + 2文字'); // [サイ|ト](...)
        });

        test('展開中のテキストはMarkdownへ往復しても同じ（展開は内容を変えない）', () => {
            env.editor.innerHTML = '<p>前<a href="https://example.com">サイト</a>後</p>';
            const before = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            caretInLink(1);
            env.commands.syncRawMarkdownToCaret();
            const after = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.strictEqual(after, before, JSON.stringify(after));
            assert.ok(/前\[サイト\]\(https:\/\/example\.com\)後/.test(after), JSON.stringify(after));
        });

        test('展開中のテキストは walkInline に再変換されない（薄い表示が維持される）', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            caretInLink(1);
            env.commands.syncRawMarkdownToCaret();
            env.commands.applyInlineFormatting();
            assert.ok(rawSpan(), env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('a'), null, env.editor.innerHTML);
        });

        test('キャレットがリンクから外れるとレンダリング表示へ戻る', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a>後</p>';
            caretInLink(1);
            env.commands.syncRawMarkdownToCaret();
            // 段落の末尾テキスト「後」へキャレットを移す
            const tail = env.editor.querySelector('p')!.lastChild as Text;
            caretIn(tail, 1);
            const changed = env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(changed, true, env.editor.innerHTML);
            assert.strictEqual(rawSpan(), null, env.editor.innerHTML);
            const a = env.editor.querySelector('a') as HTMLAnchorElement;
            assert.strictEqual(a.getAttribute('href'), 'https://example.com', env.editor.innerHTML);
            assert.strictEqual(a.textContent, 'サイト', env.editor.innerHTML);
        });

        test('展開中に編集したURL・リンクテキストが復帰時のリンクへ反映される', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a>後</p>';
            caretInLink(1);
            env.commands.syncRawMarkdownToCaret();
            rawSpan()!.textContent = '[新しい名前](https://vscode.dev)';
            const tail = env.editor.querySelector('p')!.lastChild as Text;
            caretIn(tail, 1);
            env.commands.syncRawMarkdownToCaret();
            const a = env.editor.querySelector('a') as HTMLAnchorElement;
            assert.strictEqual(a.getAttribute('href'), 'https://vscode.dev', env.editor.innerHTML);
            assert.strictEqual(a.textContent, '新しい名前', env.editor.innerHTML);
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.ok(/\[新しい名前\]\(https:\/\/vscode\.dev\)/.test(md), JSON.stringify(md));
        });

        test('記法が壊れたまま外れた場合はプレーンテキストとして残す', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a>後</p>';
            caretInLink(1);
            env.commands.syncRawMarkdownToCaret();
            rawSpan()!.textContent = '[サイト](https://example.com'; // `)` を消した状態
            const tail = env.editor.querySelector('p')!.lastChild as Text;
            caretIn(tail, 1);
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(env.editor.querySelector('a'), null, env.editor.innerHTML);
            assert.strictEqual(rawSpan(), null, env.editor.innerHTML);
            assert.ok(env.editor.textContent!.includes('[サイト](https://example.com'), env.editor.innerHTML);
        });

        test('同じリンク内でキャレットを動かしても展開は維持される（DOM変更なし）', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            caretInLink(1);
            env.commands.syncRawMarkdownToCaret();
            const span = rawSpan();
            caretIn(span!.firstChild as Text, 5);
            const changed = env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(changed, false, env.editor.innerHTML);
            assert.strictEqual(rawSpan(), span, env.editor.innerHTML);
        });

        test('リンクの外にキャレットがあるときは何もしない（false）', () => {
            env.editor.innerHTML = '<p>ふつうの段落</p>';
            caretIn(env.editor.querySelector('p')!.firstChild as Text, 2);
            assert.strictEqual(env.commands.syncRawMarkdownToCaret(), false, env.editor.innerHTML);
        });

        test('選択範囲がある場合も開始位置の所属で判定する（展開中のテキストを選択して編集できる）', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            caretInLink(1);
            env.commands.syncRawMarkdownToCaret();
            const span = rawSpan()!;
            const range = env.document.createRange();
            range.setStart(span.firstChild as Text, 1);
            range.setEnd(span.firstChild as Text, 4); // span内を範囲選択
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            assert.strictEqual(env.commands.syncRawMarkdownToCaret(), false, env.editor.innerHTML);
            assert.strictEqual(rawSpan(), span, env.editor.innerHTML);
        });
    });

    suite('handleAlertEnter（アラートbox本文内のEnter/Shift+Enter）', () => {
        const ALERT = '<div class="markdown-alert markdown-alert-note" data-alert-type="NOTE">' +
            '<p class="markdown-alert-title" contenteditable="false">Note</p>' +
            '<div class="markdown-alert-body">補足です</div></div>';

        /** 本文の先頭テキストノードの指定オフセットにキャレットを置く */
        function placeCaretInBody(body: HTMLElement, offset: number): void {
            const text = (body.firstChild ?? body) as Text;
            const range = env.document.createRange();
            range.setStart(text, Math.min(offset, text.textContent!.length));
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        /** 本文の末尾にキャレットを置く */
        function placeCaretAtBodyEnd(body: HTMLElement): void {
            placeCaretInBody(body, ((body.firstChild ?? body) as Text).textContent!.length);
        }
        /** アラートを1つ持つエディタを用意し、本文要素を返す */
        function setupAlert(): HTMLElement {
            env.editor.innerHTML = ALERT;
            return env.editor.querySelector('.markdown-alert-body') as HTMLElement;
        }

        test('本文末尾のEnterでboxを抜けて後続の段落へ移る', () => {
            const body = setupAlert();
            placeCaretAtBodyEnd(body);
            const handled = env.commands.handleAlertEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const alertEl = env.editor.querySelector('.markdown-alert') as HTMLElement;
            assert.strictEqual(alertEl.nextElementSibling?.tagName, 'P', env.editor.innerHTML);
            // 段落はboxの外にある（本文は変化しない）
            assert.strictEqual(body.textContent, '補足です', env.editor.innerHTML);
        });

        test('boxを抜けた段落はアラートの外の段落としてMarkdownへ往復する', () => {
            const body = setupAlert();
            placeCaretAtBodyEnd(body);
            env.commands.handleAlertEnter(fakeKeyEvent('Enter'));
            const p = env.editor.querySelector('p:not(.markdown-alert-title)') as HTMLElement;
            p.textContent = '本文の続き';
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.ok(/^> \[!NOTE\]$/m.test(md), JSON.stringify(md));
            assert.ok(/^> 補足です$/m.test(md), JSON.stringify(md));
            assert.ok(/^本文の続き$/m.test(md), JSON.stringify(md));
        });

        test('本文の途中のEnterでは改行（<br>）を挿入しboxを抜けない', () => {
            const body = setupAlert();
            placeCaretInBody(body, 2); // 「補足」と「です」の間
            const handled = env.commands.handleAlertEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.strictEqual(body.querySelectorAll('br').length, 1, env.editor.innerHTML);
            const alertEl = env.editor.querySelector('.markdown-alert') as HTMLElement;
            assert.strictEqual(alertEl.nextElementSibling, null, env.editor.innerHTML);
        });

        test('本文の途中のEnterによる改行は2つの `> ` 行へ往復する', () => {
            const body = setupAlert();
            placeCaretInBody(body, 2);
            env.commands.handleAlertEnter(fakeKeyEvent('Enter'));
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.ok(/^> 補足$/m.test(md), JSON.stringify(md));
            assert.ok(/^> です$/m.test(md), JSON.stringify(md));
        });

        test('本文末尾のShift+Enterではboxを抜けずプレースホルダ<br>が補われる', () => {
            const body = setupAlert();
            placeCaretAtBodyEnd(body);
            const handled = env.commands.handleAlertEnter(fakeKeyEvent('Enter', { shiftKey: true }));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.strictEqual(body.querySelectorAll('br').length, 2, env.editor.innerHTML);
            const alertEl = env.editor.querySelector('.markdown-alert') as HTMLElement;
            assert.strictEqual(alertEl.nextElementSibling, null, env.editor.innerHTML);
        });

        test('プレースホルダ<br>はMarkdownへ余分な行を出力しない', () => {
            const body = setupAlert();
            placeCaretAtBodyEnd(body);
            env.commands.handleAlertEnter(fakeKeyEvent('Enter', { shiftKey: true }));
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML).trim();
            assert.strictEqual(md, '> [!NOTE]\n> 補足です', JSON.stringify(md));
        });

        test('タイトル行（contenteditable=false）は本文ではないので何もしない（false）', () => {
            env.editor.innerHTML = ALERT;
            const title = env.editor.querySelector('.markdown-alert-title') as HTMLElement;
            placeCaretAtBodyEnd(title);
            const handled = env.commands.handleAlertEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, false);
        });

        test('アラートboxの外では何もしない（false）', () => {
            env.editor.innerHTML = '<p>ふつうの段落</p>';
            placeCaretAtBodyEnd(env.editor.querySelector('p') as HTMLElement);
            const handled = env.commands.handleAlertEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, false);
        });

        test('Ctrl/Cmd+Enterなどの修飾キー付きでは何もしない（false）', () => {
            const body = setupAlert();
            placeCaretAtBodyEnd(body);
            assert.strictEqual(env.commands.handleAlertEnter(fakeKeyEvent('Enter', { ctrlKey: true })), false);
            assert.strictEqual(env.commands.handleAlertEnter(fakeKeyEvent('Enter', { metaKey: true })), false);
        });
    });

    suite('handleTaskListEnter（タスクリスト内のEnter）', () => {
        const CHECKBOX = '<input type="checkbox" class="task-checkbox" contenteditable="false">';

        /** タスク項目のテキストノード（チェックボックス直後）の指定オフセットにキャレットを置く */
        function placeCaretInTaskText(li: HTMLElement, offset: number): void {
            const text = li.lastChild as Text;
            const range = env.document.createRange();
            range.setStart(text, Math.min(offset, text.textContent!.length));
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        test('本文末尾でEnterすると次に未チェックのタスク項目が作られる', () => {
            env.editor.innerHTML = `<ul><li class="task-list-item">${CHECKBOX} タスク1</li></ul>`;
            const li = env.editor.querySelector('li') as HTMLElement;
            placeCaretInTaskText(li, (li.lastChild as Text).textContent!.length);
            const handled = env.commands.handleTaskListEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const items = env.editor.querySelectorAll('li.task-list-item');
            assert.strictEqual(items.length, 2, env.editor.innerHTML);
            const newLi = items[1];
            const checkbox = newLi.querySelector('input.task-checkbox') as HTMLInputElement;
            assert.ok(checkbox, env.editor.innerHTML);
            assert.strictEqual(checkbox.checked, false);
        });

        test('本文の途中でEnterすると項目が分割され後半が新項目へ移る', () => {
            env.editor.innerHTML = `<ul><li class="task-list-item">${CHECKBOX} 前半後半</li></ul>`;
            const li = env.editor.querySelector('li') as HTMLElement;
            placeCaretInTaskText(li, 3); // " 前半" の直後
            const handled = env.commands.handleTaskListEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const items = env.editor.querySelectorAll('li.task-list-item');
            assert.strictEqual(items.length, 2, env.editor.innerHTML);
            assert.strictEqual(items[0].textContent!.trim(), '前半');
            assert.strictEqual(items[1].textContent!.trim(), '後半');
        });

        test('Enter後のHTMLは htmlToMarkdown で2つの `* [ ]` 行へ往復する', () => {
            env.editor.innerHTML = `<ul><li class="task-list-item">${CHECKBOX} タスク1</li></ul>`;
            const li = env.editor.querySelector('li') as HTMLElement;
            placeCaretInTaskText(li, (li.lastChild as Text).textContent!.length);
            env.commands.handleTaskListEnter(fakeKeyEvent('Enter'));
            const newLi = env.editor.querySelectorAll('li')[1];
            newLi.appendChild(env.document.createTextNode('タスク2'));
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.ok(/^\* \[ \] タスク1$/m.test(md), JSON.stringify(md));
            assert.ok(/^\* \[ \] タスク2$/m.test(md), JSON.stringify(md));
        });

        test('空のタスク項目でEnterするとリストを抜けて段落へ移る', () => {
            env.editor.innerHTML =
                `<ul><li class="task-list-item">${CHECKBOX} タスク1</li>` +
                `<li class="task-list-item">${CHECKBOX} </li></ul>`;
            const empty = env.editor.querySelectorAll('li')[1] as HTMLElement;
            placeCaretInTaskText(empty, 1);
            const handled = env.commands.handleTaskListEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelectorAll('li').length, 1, env.editor.innerHTML);
            const ul = env.editor.querySelector('ul') as HTMLElement;
            assert.strictEqual(ul.nextElementSibling?.tagName, 'P', env.editor.innerHTML);
        });

        test('唯一の空タスク項目でEnterするとリスト自体が削除される', () => {
            env.editor.innerHTML = `<ul><li class="task-list-item">${CHECKBOX} </li></ul>`;
            const li = env.editor.querySelector('li') as HTMLElement;
            placeCaretInTaskText(li, 1);
            const handled = env.commands.handleTaskListEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('ul'), null, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('p'), env.editor.innerHTML);
        });

        test('リスト途中の空タスク項目でEnterするとリストが分割される', () => {
            env.editor.innerHTML =
                `<ul><li class="task-list-item">${CHECKBOX} タスク1</li>` +
                `<li class="task-list-item">${CHECKBOX} </li>` +
                `<li class="task-list-item">${CHECKBOX} タスク3</li></ul>`;
            const empty = env.editor.querySelectorAll('li')[1] as HTMLElement;
            placeCaretInTaskText(empty, 1);
            const handled = env.commands.handleTaskListEnter(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            const uls = env.editor.querySelectorAll('ul');
            assert.strictEqual(uls.length, 2, env.editor.innerHTML);
            assert.strictEqual(uls[0].nextElementSibling?.tagName, 'P', env.editor.innerHTML);
        });

        test('Shift+Enterでは何もしない（false）', () => {
            env.editor.innerHTML = `<ul><li class="task-list-item">${CHECKBOX} タスク1</li></ul>`;
            const li = env.editor.querySelector('li') as HTMLElement;
            placeCaretInTaskText(li, 4);
            const handled = env.commands.handleTaskListEnter(fakeKeyEvent('Enter', { shiftKey: true }));
            assert.strictEqual(handled, false);
        });

        test('通常のリスト項目では何もしない（false）', () => {
            env.editor.innerHTML = '<ul><li>ふつうの項目</li></ul>';
            placeCaretIn(env.editor.querySelector('li') as HTMLElement);
            const handled = env.commands.handleTaskListEnter(fakeKeyEvent('Enter'));
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

    suite('convertAlerts（GitHubアラートのライブ変換）', () => {
        test('マーカーのみのblockquoteをアラートboxへ変換する', () => {
            env.editor.innerHTML = '<blockquote>[!NOTE]</blockquote>';
            const { didFormat } = env.commands.convertAlerts(env.editor);
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            const alert = env.editor.querySelector('.markdown-alert');
            assert.ok(alert, env.editor.innerHTML);
            assert.strictEqual(alert!.getAttribute('data-alert-type'), 'NOTE');
            // 空の本文にはキャレット用のゼロ幅文字が入る
            const body = alert!.querySelector('.markdown-alert-body');
            assert.ok(body, env.editor.innerHTML);
            assert.strictEqual(body!.textContent, env.state.ZERO_WIDTH);
        });

        test('マーカー+本文のblockquoteは本文を保持して変換する', () => {
            env.editor.innerHTML = '<blockquote>[!WARNING]<br>注意1<br>注意2</blockquote>';
            const { didFormat } = env.commands.convertAlerts(env.editor);
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            const body = env.editor.querySelector('.markdown-alert-body');
            assert.ok(body, env.editor.innerHTML);
            assert.ok(body!.innerHTML.includes('注意1<br>注意2'), body!.innerHTML);
        });

        test('スペース無しの平文（>[!NOTE]）も変換する', () => {
            env.editor.innerHTML = '<p>&gt;[!NOTE]</p>';
            const { didFormat } = env.commands.convertAlerts(env.editor);
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('.markdown-alert-note'), env.editor.innerHTML);
        });

        test('マーカー行に余分なテキストがある場合は変換しない', () => {
            env.editor.innerHTML = '<blockquote>[!NOTE] 余分</blockquote>';
            const { didFormat } = env.commands.convertAlerts(env.editor);
            assert.strictEqual(didFormat, false, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('blockquote'), env.editor.innerHTML);
        });

        test('マーカーが不完全な入力途中は変換しない', () => {
            env.editor.innerHTML = '<blockquote>[!NOT</blockquote>';
            const { didFormat } = env.commands.convertAlerts(env.editor);
            assert.strictEqual(didFormat, false, env.editor.innerHTML);
        });

        test('本文中に[!NOTE]を含む通常段落は変換しない', () => {
            env.editor.innerHTML = '<p>引用の先頭行に [!NOTE] などのマーカーを書く</p>';
            const { didFormat } = env.commands.convertAlerts(env.editor);
            assert.strictEqual(didFormat, false, env.editor.innerHTML);
        });

        test('変換済みのアラートは再変換しない', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('> [!TIP]\n> 本文');
            const { didFormat } = env.commands.convertAlerts(env.editor);
            assert.strictEqual(didFormat, false, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelectorAll('.markdown-alert').length, 1);
        });

        test('キャレットが対象内にあれば本文末尾へ移動する', () => {
            env.editor.innerHTML = '<blockquote>[!NOTE]</blockquote>';
            const quote = env.editor.querySelector('blockquote')!;
            placeCaretIn(quote);
            const { caretHandled } = env.commands.convertAlerts(env.editor);
            assert.strictEqual(caretHandled, true);
            const sel = env.window.getSelection();
            const body = env.editor.querySelector('.markdown-alert-body')!;
            assert.ok(body.contains(sel.anchorNode), 'キャレットが本文内にない');
        });

        test('変換後のアラートは往復で > [!TYPE] 形式に保存される', () => {
            env.editor.innerHTML = '<blockquote>[!IMPORTANT]<br>重要</blockquote>';
            env.commands.convertAlerts(env.editor);
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.strictEqual(md, '> [!IMPORTANT]\n> 重要\n');
        });

        test('applyInlineFormatting経由でも変換される（入力イベントの統合経路）', () => {
            env.editor.innerHTML = '<blockquote>[!CAUTION]</blockquote>';
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('.markdown-alert-caution'), env.editor.innerHTML);
        });
    });

    suite('scrollToAnchor（TOCアンカーの遷移）', () => {
        test('#slug に対応するid要素へscrollIntoViewする', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('# Title\n\n## Section A');
            const targetId = env.markdown.slugify('Section A'); // 'section-a'
            const target = env.editor.querySelector('[id="' + targetId + '"]') as HTMLElement;
            assert.ok(target, env.editor.innerHTML);
            let scrolled = false;
            target.scrollIntoView = function () { scrolled = true; };
            env.commands.scrollToAnchor('#' + targetId);
            assert.ok(scrolled, 'scrollIntoView が呼ばれていない');
        });

        test('日本語のパーセントエンコードされたアンカーもデコードして遷移する', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('# 日本語見出し');
            const slug = env.markdown.slugify('日本語見出し');
            const target = env.editor.querySelector('[id="' + slug + '"]') as HTMLElement;
            assert.ok(target, env.editor.innerHTML);
            let scrolled = false;
            target.scrollIntoView = function () { scrolled = true; };
            env.commands.scrollToAnchor('#' + encodeURIComponent(slug));
            assert.ok(scrolled, 'エンコードされたアンカーで遷移できていない');
        });

        test('該当id要素が無ければ何もしない（例外を投げない）', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('# Title');
            assert.doesNotThrow(() => env.commands.scrollToAnchor('#does-not-exist'));
        });

        test('#で始まらないhrefは無視する', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('# Title');
            assert.doesNotThrow(() => env.commands.scrollToAnchor('https://example.com'));
        });
    });
});
