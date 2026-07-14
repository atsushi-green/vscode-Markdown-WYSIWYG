/**
 * search.test.ts - SearchModule（検索ウィジェット）のユニットテスト
 */
import * as assert from 'assert';
import { createEditorEnv, EditorEnv } from './helper';

suite('SearchModule', () => {
    let env: EditorEnv;

    /** 検索語を設定して検索を実行する */
    function find(text: string): void {
        (env.state.findInput as HTMLInputElement).value = text;
        env.search.performFind();
    }

    setup(() => {
        env = createEditorEnv();
        env.editor.innerHTML = '<p>Hello world hello HELLO</p><p>別の段落のhello</p>';
    });

    suite('performFind（WYSIWYGモード）', () => {
        test('大文字小文字を区別せずに全マッチをハイライトする', () => {
            find('hello');

            assert.strictEqual(env.state.findMatches.length, 4);
            assert.strictEqual(env.editor.querySelectorAll('.find-highlight').length, 4);
            assert.strictEqual(env.state.findCount.textContent, '1/4');
            assert.strictEqual(env.state.currentMatchIndex, 0);
        });

        test('ハイライトしてもテキスト内容は変化しない', () => {
            const before = env.editor.textContent;
            find('hello');
            assert.strictEqual(env.editor.textContent, before);
        });

        test('大文字小文字を区別するオプション', () => {
            env.state.findOptions.caseSensitive = true;
            find('hello');
            assert.strictEqual(env.state.findMatches.length, 2);
        });

        test('単語単位で検索するオプション', () => {
            env.editor.innerHTML = '<p>cat category cat</p>';
            env.state.findOptions.wholeWord = true;
            find('cat');
            assert.strictEqual(env.state.findMatches.length, 2);
        });

        test('正規表現で検索するオプション', () => {
            env.editor.innerHTML = '<p>foo1 foo2 bar3</p>';
            env.state.findOptions.useRegex = true;
            find('foo\\d');
            assert.strictEqual(env.state.findMatches.length, 2);
        });

        test('無効な正規表現はエラーメッセージを表示して落ちない', () => {
            env.state.findOptions.useRegex = true;
            find('[invalid');
            assert.strictEqual(env.state.findCount.textContent, '無効な正規表現');
            assert.strictEqual(env.state.findMatches.length, 0);
        });

        test('空文字にマッチしうる正規表現でも無限ループしない', () => {
            env.editor.innerHTML = '<p>aaa</p>';
            env.state.findOptions.useRegex = true;
            find('a*');
            assert.ok(env.state.findMatches.length > 0);
        });

        test('マッチをドキュメント順（上から下へ）で格納する', () => {
            env.editor.innerHTML =
                '<p>1つ目のhello</p><p>2つ目の<strong>hello</strong>と3つ目のhello</p>';
            find('hello');

            assert.strictEqual(env.state.findMatches.length, 3);
            // DOM上の出現順とfindMatchesの順序が一致すること
            // （getBoundingClientRectに依存しない順序付け）
            const inDomOrder = Array.from(env.editor.querySelectorAll('.find-highlight'));
            const positions = Array.from(
                env.state.findMatches as Element[],
                (el: Element) => inDomOrder.indexOf(el)
            );
            assert.deepStrictEqual(positions, [0, 1, 2]);
        });

        test('マッチなしの場合は「結果なし」を表示する', () => {
            find('存在しない文字列');
            assert.strictEqual(env.state.findCount.textContent, '結果なし');
        });

        test('検索語が空ならカウント表示をクリアする', () => {
            find('hello');
            find('');
            assert.strictEqual(env.state.findCount.textContent, '');
            assert.strictEqual(env.editor.querySelectorAll('.find-highlight').length, 0);
        });

        test('再検索時は前回のハイライトをクリアする', () => {
            find('hello');
            find('world');
            assert.strictEqual(env.state.findMatches.length, 1);
            assert.strictEqual(env.editor.querySelectorAll('.find-highlight').length, 1);
        });
    });

    suite('findNext / findPrev', () => {
        test('次のマッチへ移動し、末尾では先頭に戻る', () => {
            find('hello');
            assert.strictEqual(env.state.currentMatchIndex, 0);

            env.search.findNext();
            assert.strictEqual(env.state.currentMatchIndex, 1);
            assert.strictEqual(env.state.findCount.textContent, '2/4');

            env.search.findNext();
            env.search.findNext();
            env.search.findNext(); // 4件目の次は先頭へ
            assert.strictEqual(env.state.currentMatchIndex, 0);
        });

        test('前のマッチへ移動し、先頭では末尾に戻る', () => {
            find('hello');
            env.search.findPrev();
            assert.strictEqual(env.state.currentMatchIndex, 3);
            assert.strictEqual(env.state.findCount.textContent, '4/4');
        });

        test('現在のマッチだけにcurrentクラスが付く', () => {
            find('hello');
            env.search.findNext();

            const highlights = env.editor.querySelectorAll('.find-highlight');
            const currents = env.editor.querySelectorAll('.find-highlight.current');
            assert.strictEqual(currents.length, 1);
            // 2件目（ドキュメント順）が現在のマッチになる
            assert.strictEqual(currents[0], highlights[1]);
        });

        test('マッチが無い状態では何もしない', () => {
            env.search.findNext();
            env.search.findPrev();
            assert.strictEqual(env.state.currentMatchIndex, -1);
        });
    });

    suite('open / close', () => {
        test('openでウィジェットを表示して検索を実行する', () => {
            (env.state.findInput as HTMLInputElement).value = 'hello';
            env.search.open();
            assert.strictEqual(env.state.findWidget.style.display, 'flex');
            assert.strictEqual(env.state.findMatches.length, 4);
        });

        test('closeでウィジェットを隠し、ハイライトと状態をクリアする', () => {
            find('hello');
            env.search.close();

            assert.strictEqual(env.state.findWidget.style.display, 'none');
            assert.strictEqual(env.editor.querySelectorAll('.find-highlight').length, 0);
            assert.strictEqual(env.state.findMatches.length, 0);
            assert.strictEqual(env.state.currentMatchIndex, -1);
            assert.strictEqual(env.state.findCount.textContent, '');
        });
    });

    suite('RAWモード検索', () => {
        setup(() => {
            env.state.isRawMode = true;
            (env.state.rawEditor as HTMLTextAreaElement).value = 'foo bar\nfoo baz foo';
        });

        test('テキストエリア内のマッチ位置を収集する', () => {
            find('foo');
            // オブジェクトはjsdom側のrealmで生成されるためプロパティ単位で比較する
            assert.strictEqual(env.state.findMatches.length, 3);
            assert.strictEqual(env.state.findMatches[0].start, 0);
            assert.strictEqual(env.state.findMatches[0].end, 3);
            assert.strictEqual(env.state.findMatches[1].start, 8);
            assert.strictEqual(env.state.findMatches[1].end, 11);
        });

        test('現在のマッチをテキストエリアの選択範囲として表示する', () => {
            find('foo');
            const rawEditor = env.state.rawEditor as HTMLTextAreaElement;
            assert.strictEqual(rawEditor.selectionStart, 0);
            assert.strictEqual(rawEditor.selectionEnd, 3);

            env.search.findNext();
            assert.strictEqual(rawEditor.selectionStart, 8);
            assert.strictEqual(rawEditor.selectionEnd, 11);
        });
    });

    suite('toggleOption', () => {
        test('オプションをトグルしてボタンのactive状態を切り替え、再検索する', () => {
            find('hello');
            env.search.toggleOption('caseSensitive', env.state.findOptionCase);

            assert.strictEqual(env.state.findOptions.caseSensitive, true);
            assert.ok(env.state.findOptionCase.classList.contains('active'));
            // 再検索により大文字小文字区別で2件になる
            assert.strictEqual(env.state.findMatches.length, 2);

            env.search.toggleOption('caseSensitive', env.state.findOptionCase);
            assert.strictEqual(env.state.findOptions.caseSensitive, false);
            assert.ok(!env.state.findOptionCase.classList.contains('active'));
        });
    });
});
