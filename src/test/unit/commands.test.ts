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

    suite('インライン数式のライブ変換（$...$ の入力）', () => {
        /** math-inline コンテナの data-math（＝保持している生の式）を返す */
        function mathOf(): string | null {
            return env.editor.querySelector('.math-inline')?.getAttribute('data-math') ?? null;
        }

        test('$x$ を入力すると math-inline コンテナへ変換される', () => {
            env.editor.innerHTML = '<p>式 $x^2$ です</p>';
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            const span = env.editor.querySelector('.math-inline');
            assert.ok(span, env.editor.innerHTML);
            assert.strictEqual(mathOf(), 'x^2', env.editor.innerHTML);
            // KaTeX描画前なのでコンテナは空・編集不可
            assert.strictEqual(span!.getAttribute('contenteditable'), 'false');
            assert.strictEqual(span!.textContent, '');
        });

        test('数式の中身の _ や ^* は強調・斜体へ化けない', () => {
            env.editor.innerHTML = '<p>$a_1 + b_2$ と $\\alpha^*$</p>';
            env.commands.applyInlineFormatting();
            assert.strictEqual(env.editor.querySelector('em'), null, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('strong'), null, env.editor.innerHTML);
            assert.strictEqual(mathOf(), 'a_1 + b_2', env.editor.innerHTML);
        });

        test('閉じ `$` が無いうちは変換されない（入力途中で式が壊れない）', () => {
            env.editor.innerHTML = '<p>入力中 $x^2</p>';
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, false, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('.math-inline'), null, env.editor.innerHTML);
        });

        test('エスケープした \\$ は数式にならずリテラルの $ になる', () => {
            env.editor.innerHTML = '<p>価格は \\$100 と \\$200 です</p>';
            env.commands.applyInlineFormatting();
            assert.strictEqual(env.editor.querySelector('.math-inline'), null, env.editor.innerHTML);
            // ゼロ幅スペースを除いた表示は従来どおり素の $（マーカーは不可視）
            const ZW = new RegExp(env.state.ZERO_WIDTH, 'g');
            assert.ok(env.editor.textContent!.replace(ZW, '').includes('価格は $100 と $200 です'),
                env.editor.innerHTML);
        });

        test('エスケープした \\$ が複数あっても編集イベント（再変換）で数式化・破損しない', () => {
            // 回帰テスト: 同一テキストノード内に \$ が2つ以上あるとき、input イベントの
            // 再変換（applyInlineFormatting）で `$…$` がインライン数式へ誤変換され、
            // 書き戻しでバックスラッシュが失われるデータロスがあった
            env.editor.innerHTML = env.markdown.markdownToHtml('価格は \\$100 と \\$200 です');
            env.commands.applyInlineFormatting();
            assert.strictEqual(env.editor.querySelector('.math-inline'), null, env.editor.innerHTML);
            const back = env.markdown.htmlToMarkdown(env.editor.innerHTML).trim();
            assert.strictEqual(back, '価格は \\$100 と \\$200 です');
            // 2回目の再変換でも安定している（冪等）
            env.commands.applyInlineFormatting();
            const back2 = env.markdown.htmlToMarkdown(env.editor.innerHTML).trim();
            assert.strictEqual(back2, '価格は \\$100 と \\$200 です');
        });

        test('インラインコード内の $x$ は数式にならずコードに保持される', () => {
            env.editor.innerHTML = '<p>`$x$` はコード</p>';
            env.commands.applyInlineFormatting();
            assert.strictEqual(env.editor.querySelector('.math-inline'), null, env.editor.innerHTML);
            const code = env.editor.querySelector('code');
            assert.ok(code, env.editor.innerHTML);
            assert.strictEqual(code!.textContent, '$x$');
        });

        test('式に含まれるダブルクォートが属性を壊さない', () => {
            env.editor.innerHTML = '<p>$\\text{"x"}$</p>';
            env.commands.applyInlineFormatting();
            assert.strictEqual(mathOf(), '\\text{"x"}', env.editor.innerHTML);
        });

        test('markdownToHtml と同じ data-math を生成する（読込時とライブ変換の一致）', () => {
            const expr = '\\alpha + \\beta';
            env.editor.innerHTML = `<p>$${expr}$</p>`;
            env.commands.applyInlineFormatting();
            const live = mathOf();
            // 読込パス（markdownToHtml）の data-math と突き合わせる
            const div = env.document.createElement('div');
            div.innerHTML = env.markdown.markdownToHtml(`$${expr}$`);
            const loaded = div.querySelector('.math-inline')?.getAttribute('data-math') ?? null;
            assert.strictEqual(live, loaded, `live=${live} loaded=${loaded}`);
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

    suite('insertLink（リンクの挿入・編集ダイアログ / Ctrl+K）', () => {
        /** ダイアログのDOM参照 */
        function dialog() {
            return {
                root: env.document.getElementById('linkDialog') as HTMLElement,
                title: env.document.getElementById('linkDialogTitle') as HTMLElement,
                text: env.document.getElementById('linkTextInput') as HTMLInputElement,
                url: env.document.getElementById('linkUrlInput') as HTMLInputElement,
                remove: env.document.getElementById('linkDialogRemove') as HTMLElement
            };
        }
        /** 指定ノードの範囲を選択する（start〜endは先頭テキストノードのオフセット） */
        function selectIn(node: Node, start: number, end: number): void {
            const text = (node.firstChild ?? node) as Text;
            const range = env.document.createRange();
            range.setStart(text, start);
            range.setEnd(text, end);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        test('選択したテキストがリンクテキストの初期値になる', () => {
            env.editor.innerHTML = '<p>ここをリンクにする</p>';
            selectIn(env.editor.querySelector('p') as HTMLElement, 0, 2);
            assert.strictEqual(env.commands.insertLink(), true);
            const d = dialog();
            assert.strictEqual(d.root.style.display, '', 'ダイアログが表示されていない');
            assert.strictEqual(d.text.value, 'ここ');
            assert.strictEqual(d.url.value, '');
            assert.strictEqual(d.title.textContent, 'リンクの挿入');
        });

        test('選択テキストがリンクになりMarkdownへ往復する', () => {
            env.editor.innerHTML = '<p>ここをリンクにする</p>';
            selectIn(env.editor.querySelector('p') as HTMLElement, 0, 2);
            env.commands.insertLink();
            dialog().url.value = 'https://example.com';
            assert.strictEqual(env.commands.applyLinkDialog(), true);
            const a = env.editor.querySelector('a') as HTMLAnchorElement;
            assert.strictEqual(a.getAttribute('href'), 'https://example.com', env.editor.innerHTML);
            assert.strictEqual(a.textContent, 'ここ', env.editor.innerHTML);
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.ok(/\[ここ\]\(https:\/\/example\.com\)をリンクにする/.test(md), JSON.stringify(md));
        });

        test('適用後はダイアログが閉じる', () => {
            env.editor.innerHTML = '<p>ここをリンクにする</p>';
            selectIn(env.editor.querySelector('p') as HTMLElement, 0, 2);
            env.commands.insertLink();
            dialog().url.value = 'https://example.com';
            env.commands.applyLinkDialog();
            assert.strictEqual(dialog().root.style.display, 'none');
        });

        test('キャレットが既存リンク内にあるとそのリンクの編集になる', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            const a = env.editor.querySelector('a') as HTMLElement;
            selectIn(a, 1, 1);
            assert.strictEqual(env.commands.insertLink(), true);
            const d = dialog();
            assert.strictEqual(d.title.textContent, 'リンクの編集');
            assert.strictEqual(d.text.value, 'サイト');
            assert.strictEqual(d.url.value, 'https://example.com');
        });

        test('既存リンクの編集は新しいリンクへ置き換わる（二重リンクにならない）', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            selectIn(env.editor.querySelector('a') as HTMLElement, 1, 1);
            env.commands.insertLink();
            const d = dialog();
            d.text.value = '新しい名前';
            d.url.value = 'https://vscode.dev';
            env.commands.applyLinkDialog();
            assert.strictEqual(env.editor.querySelectorAll('a').length, 1, env.editor.innerHTML);
            const a = env.editor.querySelector('a') as HTMLAnchorElement;
            assert.strictEqual(a.getAttribute('href'), 'https://vscode.dev');
            assert.strictEqual(a.textContent, '新しい名前');
        });

        test('生Markdown展開中のリンクも編集対象になる', () => {
            env.editor.innerHTML = '<p><a href="https://example.com">サイト</a></p>';
            selectIn(env.editor.querySelector('a') as HTMLElement, 1, 1);
            env.commands.syncRawMarkdownToCaret();
            const span = env.editor.querySelector('span.raw-markdown') as HTMLElement;
            selectIn(span, 1, 1);
            assert.strictEqual(env.commands.insertLink(), true);
            const d = dialog();
            assert.strictEqual(d.title.textContent, 'リンクの編集');
            assert.strictEqual(d.text.value, 'サイト');
            assert.strictEqual(d.url.value, 'https://example.com');
            // 適用すると展開中のspanがリンクへ置き換わる（生テキストが残らない）
            d.url.value = 'https://vscode.dev';
            env.commands.applyLinkDialog();
            assert.strictEqual(env.editor.querySelector('span.raw-markdown'), null, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelectorAll('a').length, 1, env.editor.innerHTML);
        });

        test('テキスト未入力ならURLがリンクテキストになる', () => {
            env.editor.innerHTML = '<p>あ</p>';
            selectIn(env.editor.querySelector('p') as HTMLElement, 1, 1);
            env.commands.insertLink();
            const d = dialog();
            d.text.value = '';
            d.url.value = 'https://example.com';
            env.commands.applyLinkDialog();
            const a = env.editor.querySelector('a') as HTMLAnchorElement;
            assert.strictEqual(a.textContent, 'https://example.com', env.editor.innerHTML);
        });

        test('URL未入力では適用しない（false）', () => {
            env.editor.innerHTML = '<p>ここ</p>';
            selectIn(env.editor.querySelector('p') as HTMLElement, 0, 2);
            env.commands.insertLink();
            dialog().url.value = '   ';
            assert.strictEqual(env.commands.applyLinkDialog(), false);
            assert.strictEqual(env.editor.querySelector('a'), null, env.editor.innerHTML);
        });

        test('新規挿入では「リンク解除」ボタンを出さない', () => {
            env.editor.innerHTML = '<p>ここ</p>';
            selectIn(env.editor.querySelector('p') as HTMLElement, 0, 2);
            env.commands.insertLink();
            assert.strictEqual(dialog().remove.style.display, 'none');
        });

        test('リンク解除でリンクテキストだけが残る', () => {
            env.editor.innerHTML = '<p>前<a href="https://example.com">サイト</a>後</p>';
            selectIn(env.editor.querySelector('a') as HTMLElement, 1, 1);
            env.commands.insertLink();
            assert.strictEqual(dialog().remove.style.display, '');
            assert.strictEqual(env.commands.removeLinkFromDialog(), true);
            assert.strictEqual(env.editor.querySelector('a'), null, env.editor.innerHTML);
            assert.strictEqual(env.editor.textContent, '前サイト後', env.editor.innerHTML);
        });

        test('キャンセルするとエディタは変化しない', () => {
            env.editor.innerHTML = '<p>ここをリンクにする</p>';
            const before = env.editor.innerHTML;
            selectIn(env.editor.querySelector('p') as HTMLElement, 0, 2);
            env.commands.insertLink();
            env.commands.closeLinkDialog();
            assert.strictEqual(dialog().root.style.display, 'none');
            assert.strictEqual(env.editor.innerHTML, before);
        });

        test('エディタ外に選択がある場合は開かない（false）', () => {
            env.window.getSelection().removeAllRanges();
            assert.strictEqual(env.commands.insertLink(), false);
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

    suite('syncRawMarkdownToCaret（強調記法の生Markdown表示）', () => {
        /** 指定ノードの指定オフセットにキャレットを置く */
        function caretIn(node: Node, offset: number): void {
            const range = env.document.createRange();
            range.setStart(node, offset);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        /** 生Markdown表示中のspanを返す */
        function rawSpan(): HTMLElement | null {
            return env.editor.querySelector('span.raw-markdown');
        }
        /** 装飾要素の中のテキストノードにキャレットを置く（深い入れ子は最深のテキストへ） */
        function caretInDeepest(root: HTMLElement, offset: number): void {
            let node: Node = root;
            while (node.firstChild) { node = node.firstChild; }
            caretIn(node, offset);
        }

        test('太字（strong）の内側にキャレットがあると `**...**` へ展開される', () => {
            env.editor.innerHTML = '<p>前<strong>太字</strong>後</p>';
            caretInDeepest(env.editor.querySelector('strong') as HTMLElement, 1);
            const changed = env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(changed, true, env.editor.innerHTML);
            assert.strictEqual(rawSpan()?.textContent, '**太字**', env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('strong'), null, env.editor.innerHTML);
        });

        test('取り消し線（del）は `~~...~~` へ展開される', () => {
            env.editor.innerHTML = '<p><del>消し</del></p>';
            caretInDeepest(env.editor.querySelector('del') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(rawSpan()?.textContent, '~~消し~~', env.editor.innerHTML);
        });

        test('下線（u）は `++...++` へ展開される', () => {
            env.editor.innerHTML = '<p><u>下線</u></p>';
            caretInDeepest(env.editor.querySelector('u') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(rawSpan()?.textContent, '++下線++', env.editor.innerHTML);
        });

        test('斜体（em）は `*...*` へ展開される', () => {
            env.editor.innerHTML = '<p><em>斜体</em></p>';
            caretInDeepest(env.editor.querySelector('em') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(rawSpan()?.textContent, '*斜体*', env.editor.innerHTML);
        });

        test('入れ子（太字斜体 ***）は最も外側ごと `***...***` へ展開される', () => {
            env.editor.innerHTML = '<p><strong><em>強</em></strong></p>';
            caretInDeepest(env.editor.querySelector('strong') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            // 内側のemだけ展開すると *** が壊れるため、strongごと展開されること
            assert.strictEqual(rawSpan()?.textContent, '***強***', env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('strong'), null, env.editor.innerHTML);
        });

        test('展開中の記法は walkInline に再変換されない（生表示が維持される）', () => {
            env.editor.innerHTML = '<p><strong>太字</strong></p>';
            caretInDeepest(env.editor.querySelector('strong') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            env.commands.applyInlineFormatting();
            assert.ok(rawSpan(), env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('strong'), null, env.editor.innerHTML);
        });

        test('キャレットが外れると装飾表示へ戻る', () => {
            env.editor.innerHTML = '<p><strong>太字</strong>後</p>';
            caretInDeepest(env.editor.querySelector('strong') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            const tail = env.editor.querySelector('p')!.lastChild as Text;
            caretIn(tail, 1);
            const changed = env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(changed, true, env.editor.innerHTML);
            assert.strictEqual(rawSpan(), null, env.editor.innerHTML);
            const strong = env.editor.querySelector('strong');
            assert.ok(strong, env.editor.innerHTML);
            assert.strictEqual(strong!.textContent, '太字', env.editor.innerHTML);
        });

        test('展開中に記法を編集すると復帰時に反映される（** を ~~ へ）', () => {
            env.editor.innerHTML = '<p><strong>語</strong>後</p>';
            caretInDeepest(env.editor.querySelector('strong') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            rawSpan()!.textContent = '~~語~~';
            const tail = env.editor.querySelector('p')!.lastChild as Text;
            caretIn(tail, 1);
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(env.editor.querySelector('strong'), null, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('del'), env.editor.innerHTML);
        });

        test('記法が壊れたまま外れた場合はプレーンテキストとして残す', () => {
            env.editor.innerHTML = '<p><strong>語</strong>後</p>';
            caretInDeepest(env.editor.querySelector('strong') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            rawSpan()!.textContent = '**語'; // 閉じ ** を消した状態
            const tail = env.editor.querySelector('p')!.lastChild as Text;
            caretIn(tail, 1);
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(env.editor.querySelector('strong'), null, env.editor.innerHTML);
            assert.strictEqual(rawSpan(), null, env.editor.innerHTML);
            assert.ok(env.editor.textContent!.includes('**語'), env.editor.innerHTML);
        });

        test('展開中の太字が往復しても同じMarkdownになる', () => {
            env.editor.innerHTML = '<p>前<strong>太字</strong>後</p>';
            const before = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            caretInDeepest(env.editor.querySelector('strong') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            const after = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.strictEqual(after, before, JSON.stringify(after));
            assert.ok(/前\*\*太字\*\*後/.test(after), JSON.stringify(after));
        });

        /** 開始・終了ノードとオフセットで範囲選択を張る（非collapsed） */
        function selectRange(startNode: Node, startOffset: number, endNode: Node, endOffset: number): void {
            const range = env.document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        test('装飾をまたぐ範囲選択中は展開せず選択を保持する（ドラッグ選択の解除防止）', () => {
            // 「本文をドラッグ選択して装飾（**等）に到達すると選択が解除される」不具合の回帰テスト。
            env.editor.innerHTML = '<p>前<strong>太字</strong>後</p>';
            const p = env.editor.querySelector('p')!;
            const before = p.firstChild!;    // "前"
            const after = p.lastChild!;      // "後"
            // "前" の先頭から strong をまたいで "後" の末尾まで選択
            selectRange(before, 0, after, 1);

            const changed = env.commands.syncRawMarkdownToCaret();

            assert.strictEqual(changed, false, env.editor.innerHTML);
            // 装飾は生Markdownへ展開されない（DOMが書き換わらない）
            assert.strictEqual(env.editor.querySelector('span.raw-markdown'), null, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('strong'), env.editor.innerHTML);
            // 選択が破棄されていない（範囲のまま・内容も同じ）
            const sel = env.window.getSelection();
            assert.strictEqual(sel.isCollapsed, false, '選択が解除された');
            assert.strictEqual(sel.toString(), '前太字後', sel.toString());
        });

        test('選択の開始が装飾の内側にあっても、範囲選択中は展開しない', () => {
            env.editor.innerHTML = '<p>前<strong>太字</strong>後</p>';
            const strongText = env.editor.querySelector('strong')!.firstChild!; // "太字"
            const after = env.editor.querySelector('p')!.lastChild!;            // "後"
            // strong 内の途中から "後" まで選択（開始が装飾の内側）
            selectRange(strongText, 1, after, 1);

            const changed = env.commands.syncRawMarkdownToCaret();

            assert.strictEqual(changed, false, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('span.raw-markdown'), null, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('strong'), env.editor.innerHTML);
            assert.strictEqual(env.window.getSelection().isCollapsed, false, env.editor.innerHTML);
        });

        test('既に展開中のspanは範囲選択中に折り畳まれない（展開テキストのドラッグ編集を維持）', () => {
            // まずキャレットを装飾内に置いて展開させる
            env.editor.innerHTML = '<p>前<strong>太字</strong>後</p>';
            caretInDeepest(env.editor.querySelector('strong') as HTMLElement, 1);
            env.commands.syncRawMarkdownToCaret();
            const span = rawSpan();
            assert.ok(span, '前提: 展開されていること ' + env.editor.innerHTML);

            // 展開中の生テキスト（`**太字**`）内で範囲選択する
            const rawText = span!.firstChild!;
            selectRange(rawText, 0, rawText, 4);

            const changed = env.commands.syncRawMarkdownToCaret();

            // 範囲選択中は折り畳まれず、展開表示が維持される（＝ドラッグ選択して編集できる）
            assert.strictEqual(changed, false, env.editor.innerHTML);
            assert.ok(rawSpan(), '展開中spanが折り畳まれた: ' + env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('strong'), null, env.editor.innerHTML);
            assert.strictEqual(env.window.getSelection().isCollapsed, false, env.editor.innerHTML);
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

    suite('数式の生Markdown表示（クリックで展開・キャレット離脱で復帰）', () => {
        /** 指定ノードの指定オフセットにキャレットを置く */
        function caretIn(node: Node, offset: number): void {
            const range = env.document.createRange();
            range.setStart(node, offset);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        /** 生Markdown表示中の要素を返す（インラインspan / ブロックdiv） */
        function raw(): HTMLElement | null {
            return env.editor.querySelector('.raw-markdown');
        }

        test('インライン数式のクリックで `$式$` の生Markdownへ展開される', () => {
            env.editor.innerHTML = '<p>前<span class="math-inline" data-math="\\alpha + \\beta" contenteditable="false"></span>後</p>';
            env.commands.handleMathClick(env.editor.querySelector('.math-inline'));
            assert.strictEqual(raw()?.textContent, '$\\alpha + \\beta$', env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('.math-inline'), null, env.editor.innerHTML);
        });

        test('展開後のキャレットは開き `$` の直後に置かれる', () => {
            env.editor.innerHTML = '<p><span class="math-inline" data-math="x^2" contenteditable="false"></span></p>';
            env.editor.focus(); // 実機同様、数式をクリックする＝エディタはフォーカス済み
            env.commands.handleMathClick(env.editor.querySelector('.math-inline'));
            const range = env.window.getSelection().getRangeAt(0);
            assert.strictEqual(range.startContainer, raw()!.firstChild, env.editor.innerHTML);
            assert.strictEqual(range.startOffset, 1, '`$` の直後');
        });

        test('ブロック数式のクリックで `$$ ... $$` のdivへ展開される', () => {
            env.editor.innerHTML = '<div class="math-block" data-math="x = \\frac{1}{2}" contenteditable="false"></div>';
            env.commands.handleMathClick(env.editor.querySelector('.math-block'));
            const el = raw()!;
            assert.strictEqual(el.tagName, 'DIV', env.editor.innerHTML);
            assert.ok(el.classList.contains('raw-math-block'), env.editor.innerHTML);
            assert.strictEqual(el.textContent, '$$\nx = \\frac{1}{2}\n$$', env.editor.innerHTML);
        });

        test('展開中の数式は再変換されない（生表示が維持される）', () => {
            env.editor.innerHTML = '<p><span class="math-inline" data-math="a_1" contenteditable="false"></span></p>';
            env.commands.handleMathClick(env.editor.querySelector('.math-inline'));
            env.commands.applyInlineFormatting();
            assert.ok(raw(), env.editor.innerHTML);
            // `a_1` の `_` が斜体（<em>）へ化けていないこと
            assert.strictEqual(env.editor.querySelector('em'), null, env.editor.innerHTML);
        });

        test('キャレットが外れるとインライン数式コンテナへ戻る', () => {
            env.editor.innerHTML = '<p><span class="math-inline" data-math="x^2" contenteditable="false"></span>後</p>';
            env.commands.handleMathClick(env.editor.querySelector('.math-inline'));
            const tail = env.editor.querySelector('p')!.lastChild as Text;
            caretIn(tail, 1);
            const changed = env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(changed, true, env.editor.innerHTML);
            assert.strictEqual(raw(), null, env.editor.innerHTML);
            const math = env.editor.querySelector('.math-inline') as HTMLElement;
            assert.ok(math, env.editor.innerHTML);
            assert.strictEqual(math.getAttribute('data-math'), 'x^2', env.editor.innerHTML);
        });

        test('キャレットが外れるとブロック数式コンテナへ戻る', () => {
            env.editor.innerHTML = '<div class="math-block" data-math="x^2" contenteditable="false"></div><p>後</p>';
            env.commands.handleMathClick(env.editor.querySelector('.math-block'));
            const tail = env.editor.querySelector('p')!.firstChild as Text;
            caretIn(tail, 1);
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(raw(), null, env.editor.innerHTML);
            const math = env.editor.querySelector('.math-block') as HTMLElement;
            assert.ok(math, env.editor.innerHTML);
            assert.strictEqual(math.getAttribute('data-math'), 'x^2', env.editor.innerHTML);
        });

        test('展開中に式を編集すると復帰時に data-math へ反映される（インライン）', () => {
            env.editor.innerHTML = '<p><span class="math-inline" data-math="x" contenteditable="false"></span>後</p>';
            env.commands.handleMathClick(env.editor.querySelector('.math-inline'));
            raw()!.textContent = '$y^2$';
            const tail = env.editor.querySelector('p')!.lastChild as Text;
            caretIn(tail, 1);
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(
                env.editor.querySelector('.math-inline')!.getAttribute('data-math'), 'y^2',
                env.editor.innerHTML);
        });

        test('展開中に式を編集すると復帰時に data-math へ反映される（ブロック）', () => {
            env.editor.innerHTML = '<div class="math-block" data-math="x" contenteditable="false"></div><p>後</p>';
            env.commands.handleMathClick(env.editor.querySelector('.math-block'));
            raw()!.textContent = '$$\ny = mx + b\n$$';
            const tail = env.editor.querySelector('p')!.firstChild as Text;
            caretIn(tail, 1);
            env.commands.syncRawMarkdownToCaret();
            assert.strictEqual(
                env.editor.querySelector('.math-block')!.getAttribute('data-math'), 'y = mx + b',
                env.editor.innerHTML);
        });

        test('展開してもMarkdownは変わらない（インライン：往復不変）', () => {
            env.editor.innerHTML = '<p>前<span class="math-inline" data-math="\\alpha^2" contenteditable="false"></span>後</p>';
            const before = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            env.commands.handleMathClick(env.editor.querySelector('.math-inline'));
            const after = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.strictEqual(after, before, JSON.stringify(after));
            assert.ok(/前\$\\alpha\^2\$後/.test(after), JSON.stringify(after));
        });

        test('展開してもMarkdownは変わらない（ブロック：往復不変）', () => {
            env.editor.innerHTML = '<div class="math-block" data-math="x = \\frac{1}{2}" contenteditable="false"></div>';
            const before = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            env.commands.handleMathClick(env.editor.querySelector('.math-block'));
            const after = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.strictEqual(after, before, JSON.stringify(after));
            assert.ok(/\$\$\nx = \\frac\{1\}\{2\}\n\$\$/.test(after), JSON.stringify(after));
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

    suite('handleHeadingConfirm（見出しのEnter確定）', () => {
        /** ノードの内容の末尾にキャレットを置く */
        function placeCaretAtEndOf(node: Node): void {
            const range = env.document.createRange();
            range.selectNodeContents(node);
            range.collapse(false);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        /** テキストノードの指定オフセットにキャレットを置く */
        function placeCaretInText(textNode: Node, offset: number): void {
            const range = env.document.createRange();
            range.setStart(textNode, offset);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        test('生の`## ああ`段落でEnterすると見出し化し直下に空段落を作る', () => {
            env.editor.innerHTML = '<p>## ああ</p>';
            placeCaretAtEndOf(env.editor.querySelector('p') as HTMLElement);
            const ev = fakeKeyEvent('Enter');
            const handled = env.commands.handleHeadingConfirm(ev);
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelectorAll('h2').length, 1, env.editor.innerHTML);
            const h2 = env.editor.querySelector('h2')!;
            assert.ok(h2.textContent!.includes('ああ'), env.editor.innerHTML);
            const nextP = h2.nextElementSibling as HTMLElement;
            assert.strictEqual(nextP.tagName, 'P', env.editor.innerHTML);
            assert.strictEqual(nextP.textContent, '', env.editor.innerHTML);
        });

        test('レンダリング済み見出しの末尾でEnterしても見出しテキストが複製されない', () => {
            // 再現バグ: `## ああ` 確定後にエンターすると新しい行にも「ああ」が出る
            env.editor.innerHTML = env.markdown.markdownToHtml('## ああ');
            placeCaretAtEndOf(env.editor.querySelector('h2') as HTMLElement);
            const ev = fakeKeyEvent('Enter');
            const handled = env.commands.handleHeadingConfirm(ev);
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.strictEqual(ev.defaultPrevented, true, 'ブラウザ既定のEnterを抑止していない');
            // 見出しは1つだけ、テキストは複製されない
            assert.strictEqual(env.editor.querySelectorAll('h2').length, 1, env.editor.innerHTML);
            const h2 = env.editor.querySelector('h2')!;
            assert.strictEqual(h2.textContent, '## ああ', env.editor.innerHTML);
            // 直下に空の段落が1つ挿入される
            const nextP = h2.nextElementSibling as HTMLElement;
            assert.ok(nextP && nextP.tagName === 'P', env.editor.innerHTML);
            assert.strictEqual(nextP.textContent, '', env.editor.innerHTML);
            // 文書全体で「ああ」は1回だけ
            assert.strictEqual((env.editor.textContent!.match(/ああ/g) || []).length, 1, env.editor.innerHTML);
        });

        test('見出しの途中でEnterすると後半だけが新段落へ移る（テキストは失われない）', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('## ああいい');
            const h2 = env.editor.querySelector('h2')!;
            const textNode = h2.lastChild as Node; // "ああいい"
            placeCaretInText(textNode, 2); // "ああ" と "いい" の間
            const handled = env.commands.handleHeadingConfirm(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, true, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('h2')!.textContent, '## ああ', env.editor.innerHTML);
            const nextP = env.editor.querySelector('h2')!.nextElementSibling as HTMLElement;
            assert.strictEqual(nextP.tagName, 'P', env.editor.innerHTML);
            assert.strictEqual(nextP.textContent, 'いい', env.editor.innerHTML);
        });

        test('見出しでもリスト項目でもない段落ではEnterを処理しない（false）', () => {
            env.editor.innerHTML = '<p>ふつうの本文</p>';
            placeCaretAtEndOf(env.editor.querySelector('p') as HTMLElement);
            const handled = env.commands.handleHeadingConfirm(fakeKeyEvent('Enter'));
            assert.strictEqual(handled, false, env.editor.innerHTML);
        });

        test('修飾キー付きEnter（Shift+Enter）は処理しない', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('## ああ');
            placeCaretAtEndOf(env.editor.querySelector('h2') as HTMLElement);
            const handled = env.commands.handleHeadingConfirm(fakeKeyEvent('Enter', { shiftKey: true }));
            assert.strictEqual(handled, false, env.editor.innerHTML);
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

    suite('convertMathBlocks（ブロック数式のライブ変換）', () => {
        test('新規入力した $$ / 本文 / $$ の3ブロックを math-block へ変換する', () => {
            env.editor.innerHTML = '<p>$$</p><p>\\alpha = 2</p><p>$$</p>';
            const { didFormat } = env.commands.convertMathBlocks(env.editor);
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            const math = env.editor.querySelector('.math-block');
            assert.ok(math, env.editor.innerHTML);
            assert.strictEqual(math!.getAttribute('data-math'), '\\alpha = 2');
            // 元の3ブロックは消えている
            assert.strictEqual(env.editor.querySelectorAll('p').length <= 1, true, env.editor.innerHTML);
        });

        test('回帰: 変換後は往復で $$…$$ に戻り $ が \\$ へ破損しない', () => {
            env.editor.innerHTML = '<p>$$</p><p>\\alpha = 2</p><p>$$</p>';
            env.commands.convertMathBlocks(env.editor);
            const md = env.markdown.htmlToMarkdown(env.editor.innerHTML);
            assert.strictEqual(md, '$$\n\\alpha = 2\n$$\n', md);
            assert.strictEqual(md.includes('\\$'), false, 'ドル記号がエスケープされている: ' + md);
        });

        test('閉じ $$ がまだ無い入力途中は変換しない', () => {
            env.editor.innerHTML = '<p>$$</p><p>\\alpha = 2</p>';
            const { didFormat } = env.commands.convertMathBlocks(env.editor);
            assert.strictEqual(didFormat, false, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('.math-block'), null);
        });

        test('複数行の式本文をまとめて1つの math-block にする', () => {
            env.editor.innerHTML = '<p>$$</p><p>a = 1</p><p>b = 2</p><p>$$</p>';
            const { didFormat } = env.commands.convertMathBlocks(env.editor);
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelectorAll('.math-block').length, 1);
            assert.strictEqual(
                env.editor.querySelector('.math-block')!.getAttribute('data-math'),
                'a = 1\nb = 2'
            );
        });

        test('class付きコンテナ（テーブル等）に当たったら範囲を打ち切る', () => {
            env.editor.innerHTML = '<p>$$</p><div class="table-container">x</div><p>$$</p>';
            const { didFormat } = env.commands.convertMathBlocks(env.editor);
            assert.strictEqual(didFormat, false, env.editor.innerHTML);
            assert.strictEqual(env.editor.querySelector('.math-block'), null);
        });

        test('キャレットが変換範囲内にあれば math-block 直後の空段落へ移す', () => {
            env.editor.innerHTML = '<p>$$</p><p>x</p><p>$$</p>';
            const closing = env.editor.querySelectorAll('p')[2];
            placeCaretIn(closing);
            const { caretHandled } = env.commands.convertMathBlocks(env.editor);
            assert.strictEqual(caretHandled, true);
            const math = env.editor.querySelector('.math-block')!;
            const sel = env.window.getSelection();
            // キャレットは math-block 自身の外（直後の段落）にある
            assert.strictEqual(math.contains(sel.anchorNode), false, 'キャレットがmath-block内にある');
            assert.ok(math.nextSibling && (math.nextSibling as HTMLElement).contains(sel.anchorNode) ||
                math.nextSibling === sel.anchorNode, 'キャレットがmath-block直後の段落にない');
        });

        test('applyInlineFormatting経由でも変換される（入力イベントの統合経路）', () => {
            env.editor.innerHTML = '<p>$$</p><p>E = mc^2</p><p>$$</p>';
            const { didFormat } = env.commands.applyInlineFormatting();
            assert.strictEqual(didFormat, true, env.editor.innerHTML);
            assert.ok(env.editor.querySelector('.math-block'), env.editor.innerHTML);
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

    suite('getSelectedMarkdown（選択範囲の生Markdownコピー）', () => {
        /** エディタ全体を選択するRangeを返す */
        function selectAll(): Range {
            const range = env.document.createRange();
            range.selectNodeContents(env.editor);
            return range;
        }
        /** 指定ノードの内容を選択するRangeを返す */
        function selectContents(node: Node): Range {
            const range = env.document.createRange();
            range.selectNodeContents(node);
            return range;
        }

        test('全選択すると保存内容（htmlToMarkdown）と一致する生Markdownを返す', () => {
            const src = '# 見出し\n\n本文です。\n\n- 項目1\n- 項目2\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
            env.editor.innerHTML = env.markdown.markdownToHtml(src);

            const expected = env.markdown
                .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                .replace(/\s+$/, '');
            const actual = env.commands.getSelectedMarkdown(selectAll());
            assert.strictEqual(actual, expected);
            // レンダリング後のテキストではなく記法が保持されていること
            assert.ok(actual.includes('| A | B |'), 'テーブル記法が保持されていない');
            // htmlToMarkdown は箇条書きマーカーを `* ` に正規化する
            assert.ok(/^[*-] 項目1$/m.test(actual), 'リスト記法が保持されていない');
        });

        test('テーブル単体の選択でパイプ記法の生Markdownを返す', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('| A | B |\n| --- | --- |\n| 1 | 2 |');
            const table = env.editor.querySelector('table') as Node;
            const md = env.commands.getSelectedMarkdown(selectContents(table));
            assert.ok(md && md.split('\n')[0] === '| A | B |', 'テーブルが生Markdown化されていない: ' + md);
        });

        test('リスト単体の選択で箇条書き記法の生Markdownを返す', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('- 項目1\n- 項目2');
            const list = env.editor.querySelector('ul') as Node;
            const md = env.commands.getSelectedMarkdown(selectContents(list));
            assert.ok(md && /^[*-] 項目1/.test(md), 'リストが生Markdown化されていない: ' + md);
        });

        test('段落／見出しだけの単一ブロックの選択は null（既定のコピーに委ねる）', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('ただの段落');
            const p = env.editor.querySelector('p') as Node;
            assert.strictEqual(env.commands.getSelectedMarkdown(selectContents(p)), null);
        });

        test('選択が無い（range=null）場合は null を返す', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('# Title');
            assert.strictEqual(env.commands.getSelectedMarkdown(null as unknown as Range), null);
        });

        test('単一テーブルセル内の選択は null（セルのテキストコピーに委ねる）', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('| A | B |\n| --- | --- |\n| 1 | 2 |');
            const td = env.editor.querySelector('td') as HTMLElement;
            const range = env.document.createRange();
            range.selectNodeContents(td);
            assert.strictEqual(env.commands.getSelectedMarkdown(range), null);
        });

        test('Mermaidレンダリング済み（隠しpre＋container）でも生Markdownを返す', () => {
            // mermaid.js の render() が作る実DOMを再現する
            // （隠し pre.mermaid-source ＋ contenteditable=false の .mermaid-container）
            const src = '### 状態遷移図\n\n```mermaid\nstateDiagram-v2\n    [*] --> 待機中\n```';
            env.editor.innerHTML = env.markdown.markdownToHtml(src);
            const pre = env.editor.querySelector('pre') as HTMLElement;
            const container = env.document.createElement('div');
            container.className = 'mermaid-container';
            container.setAttribute('data-mermaid-id', 'mermaid-diagram-0');
            container.setAttribute('contenteditable', 'false');
            container.innerHTML =
                '<div class="mermaid-toolbar"><span class="mermaid-label">Mermaid</span></div>' +
                '<div class="mermaid-split-view"><div class="mermaid-preview-panel">' +
                '<svg class="mermaid-svg"><text>開始</text></svg></div></div>';
            pre.insertAdjacentElement('afterend', container);
            pre.style.display = 'none';
            pre.classList.add('mermaid-source');
            pre.setAttribute('data-mermaid-id', 'mermaid-diagram-0');

            // 見出しテキスト〜図の内部テキストまでのマウス選択相当
            const h3 = env.editor.querySelector('h3') as HTMLElement;
            const svgText = container.querySelector('svg text')!.firstChild as Text;
            const range = env.document.createRange();
            range.setStart(h3.firstChild as Node, 0);
            range.setEnd(svgText, svgText.textContent!.length);

            const md = env.commands.getSelectedMarkdown(range);
            assert.ok(md, 'Mermaid選択が生Markdown化されていない');
            assert.ok(md.includes('```mermaid'), 'mermaidフェンスが含まれていない: ' + md);
            assert.ok(md.includes('stateDiagram-v2'), 'ソースコードが含まれていない: ' + md);
            assert.ok(!md.includes('Mermaid\n'), 'ツールバーのテキストが混入している: ' + md);
        });
    });

    suite('handleMarkdownPaste（ブロックMarkdownの貼り付け変換）', () => {
        /** 指定ノード内オフセットにキャレットを置く */
        function setCaret(node: Node, offset: number): void {
            const range = env.document.createRange();
            range.setStart(node, offset);
            range.collapse(true);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        test('空の段落へ複数ブロックを貼り付けるとレンダリング済みDOMに変換される', () => {
            env.editor.innerHTML = '<p><br></p>';
            const p = env.editor.querySelector('p') as HTMLElement;
            setCaret(p, 0);

            const handled = env.commands.handleMarkdownPaste('# 見出し\n\n- 項目1\n- 項目2');
            assert.strictEqual(handled, true);
            assert.ok(env.editor.querySelector('h1'), '見出しが変換されていない');
            assert.ok(env.editor.querySelector('ul li'), 'リストが変換されていない');
            // 空段落は取り除かれている
            assert.strictEqual(env.editor.querySelectorAll('p:not(:last-child) br').length, 0);
        });

        test('mermaidフェンスの貼り付けで code[data-lang=mermaid] が生成される', () => {
            env.editor.innerHTML = '<p><br></p>';
            setCaret(env.editor.querySelector('p') as HTMLElement, 0);

            const handled = env.commands.handleMarkdownPaste(
                '```mermaid\nstateDiagram-v2\n    [*] --> 待機中\n```');
            assert.strictEqual(handled, true);
            const code = env.editor.querySelector('pre code[data-lang="mermaid"]');
            assert.ok(code, 'mermaidコードブロックが生成されていない');
            assert.ok(code!.textContent!.includes('stateDiagram-v2'));
            // 構造ブロックで終わるため直後に空段落（キャレット位置）ができる
            const last = env.editor.lastElementChild as HTMLElement;
            assert.strictEqual(last.tagName, 'P');
        });

        test('段落の途中への貼り付けは段落を分割して間に挿入する', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('前半後半');
            const textNode = env.editor.querySelector('p')!.firstChild as Text;
            setCaret(textNode, 2); // 「前半」と「後半」の間

            const handled = env.commands.handleMarkdownPaste('## 見出し');
            assert.strictEqual(handled, true);
            const tags = Array.from(env.editor.children).map(el => el.tagName);
            assert.deepStrictEqual(tags, ['P', 'H2', 'P']);
            assert.strictEqual(env.editor.children[0].textContent, '前半');
            assert.ok(env.editor.children[2].textContent!.includes('後半'));
        });

        test('インラインのみの単一段落テキストは false（既定の貼り付けに委ねる）', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('既存の段落');
            const before = env.editor.innerHTML;
            setCaret(env.editor.querySelector('p')!.firstChild as Text, 0);

            const handled = env.commands.handleMarkdownPaste('**太字** のテキスト');
            assert.strictEqual(handled, false);
            assert.strictEqual(env.editor.innerHTML, before, 'DOMが変更されてしまっている');
        });

        test('全選択への上書き貼り付けで空の殻ブロックが残らない（Ctrl+A→Ctrl+V）', () => {
            // 既存文書を全選択（実ブラウザ同様、端点はテキストノード内）して貼り付ける
            env.editor.innerHTML = env.markdown.markdownToHtml('# 旧見出し\n\n旧本文\n\n\n旧末尾');
            const firstText = env.editor.querySelector('h1')!.lastChild as Text;
            const lastP = env.editor.children[env.editor.children.length - 1];
            const lastText = lastP.firstChild as Text;
            const range = env.document.createRange();
            range.setStart(firstText, 0);
            range.setEnd(lastText, lastText.textContent!.length);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            const src = '段落1\n\n\n段落2';
            const handled = env.commands.handleMarkdownPaste(src);
            assert.strictEqual(handled, true);
            const out = env.markdown
                .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                .replace(/\s+$/, '');
            // 旧内容の殻（空見出し「# 」等）が混ざらず、貼り付け内容だけになる
            assert.strictEqual(out, '段落1\n\n\n段落2');
        });

        test('見出しの一部だけを選択して貼り付けても、残る見出しテキストは消えない', () => {
            // 「# 見出しABC」の "BC" 部分を選択して貼り付け（前半 "見出しA" は残す）
            env.editor.innerHTML = env.markdown.markdownToHtml('# 見出しABC\n\n本文');
            const h1Text = env.editor.querySelector('h1')!.lastChild as Text; // "見出しABC"
            const start = h1Text.textContent!.indexOf('B');
            const range = env.document.createRange();
            range.setStart(h1Text, start);
            range.setEnd(h1Text, h1Text.textContent!.length);
            const sel = env.window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            env.commands.handleMarkdownPaste('段落1\n\n段落2');
            // 見出しは殻ではない（"見出しA" が残る）ため除去されない
            const h1 = env.editor.querySelector('h1');
            assert.ok(h1, '見出しが誤って除去された: ' + env.editor.innerHTML);
            assert.ok(h1!.textContent!.includes('見出しA'), h1!.textContent!);
        });

        test('貼り付け後の内容が生Markdownとして往復する', () => {
            env.editor.innerHTML = '<p><br></p>';
            setCaret(env.editor.querySelector('p') as HTMLElement, 0);
            const src = '# タイトル\n\n```js\nconst a = 1;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
            env.commands.handleMarkdownPaste(src);

            const out = env.markdown
                .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                .replace(/\s+$/, '');
            assert.ok(out.includes('# タイトル'));
            assert.ok(out.includes('```js'));
            assert.ok(out.includes('| A | B |'));
        });
    });
});
