/**
 * utils.test.ts - EditorUtils / EditorState のユニットテスト
 */
import * as assert from 'assert';
import { createEditorEnv, EditorEnv } from './helper';

suite('EditorUtils', () => {
    let env: EditorEnv;

    setup(() => {
        env = createEditorEnv();
    });

    suite('normalizeEol', () => {
        test('CRLF/CRをLFに正規化する', () => {
            assert.strictEqual(env.utils.normalizeEol('a\r\nb\rc\nd'), 'a\nb\nc\nd');
        });

        test('LFのみのテキストは変化しない', () => {
            assert.strictEqual(env.utils.normalizeEol('a\nb'), 'a\nb');
        });
    });

    suite('countText', () => {
        test('英文の単語数と文字数を数える（文字数は空白を除く）', () => {
            const c = env.utils.countText('hello world foo');
            assert.strictEqual(c.words, 3);
            assert.strictEqual(c.chars, 13); // 'helloworldfoo'
        });

        test('日本語は空白なしでも文字数を数える（単語数は連続塊で1）', () => {
            const c = env.utils.countText('こんにちは世界');
            assert.strictEqual(c.words, 1);
            assert.strictEqual(c.chars, 7);
        });

        test('改行・タブ・連続スペースは文字数に含めない', () => {
            const c = env.utils.countText('a\n\tb   c\r\nd');
            assert.strictEqual(c.words, 4);
            assert.strictEqual(c.chars, 4); // 'abcd'
        });

        test('空文字・空白のみは0/0', () => {
            for (const input of ['', '   \n\t ']) {
                const c = env.utils.countText(input);
                assert.strictEqual(c.words, 0, JSON.stringify(input));
                assert.strictEqual(c.chars, 0, JSON.stringify(input));
            }
        });

        test('nullやundefinedでも例外にならず0/0を返す', () => {
            for (const input of [undefined, null]) {
                const c = env.utils.countText(input);
                assert.strictEqual(c.words, 0);
                assert.strictEqual(c.chars, 0);
            }
        });

        test('絵文字（サロゲートペア）を1文字として数える', () => {
            const c = env.utils.countText('😀😀');
            assert.strictEqual(c.chars, 2);
        });
    });

    suite('countLines（Raw行番号ガター用）', () => {
        test('空文字・null・undefinedは1行（textareaのカーソル行1に相当）', () => {
            for (const input of ['', null, undefined]) {
                assert.strictEqual(env.utils.countLines(input), 1, JSON.stringify(input));
            }
        });

        test('改行を含まない1行は1行', () => {
            assert.strictEqual(env.utils.countLines('# 見出し'), 1);
        });

        test('N個の改行はN+1行', () => {
            assert.strictEqual(env.utils.countLines('a\nb\nc'), 3);
        });

        test('末尾の改行は次の空行を1行として数える', () => {
            assert.strictEqual(env.utils.countLines('a\n'), 2);
        });

        test('CRLF/CRも1つの改行として数える', () => {
            assert.strictEqual(env.utils.countLines('a\r\nb\rc'), 3);
        });
    });

    suite('buildLineNumberText（Raw行番号ガター用）', () => {
        test('1..count を改行区切りで並べる', () => {
            assert.strictEqual(env.utils.buildLineNumberText(3), '1\n2\n3');
        });

        test('count=1 は "1"', () => {
            assert.strictEqual(env.utils.buildLineNumberText(1), '1');
        });

        test('0以下でも最低1行分（"1"）を返す', () => {
            assert.strictEqual(env.utils.buildLineNumberText(0), '1');
            assert.strictEqual(env.utils.buildLineNumberText(-5), '1');
        });

        test('countLines と組み合わせて本文の行数分の番号になる', () => {
            const text = 'line1\nline2\nline3\nline4';
            const n = env.utils.countLines(text);
            assert.strictEqual(env.utils.buildLineNumberText(n), '1\n2\n3\n4');
        });
    });

    suite('findAncestor', () => {
        test('条件に一致する祖先要素を返す', () => {
            env.editor.innerHTML = '<pre><code>x</code></pre>';
            const textNode = env.editor.querySelector('code')!.firstChild!;
            const pre = env.utils.findAncestor(textNode, (el: Element) => el.nodeName === 'PRE');
            assert.strictEqual(pre, env.editor.querySelector('pre'));
        });

        test('エディタルートまで一致しなければnullを返す', () => {
            env.editor.innerHTML = '<p>x</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;
            const result = env.utils.findAncestor(textNode, (el: Element) => el.nodeName === 'TABLE');
            assert.strictEqual(result, null);
        });
    });

    suite('findBlockAncestor', () => {
        test('P/DIV/LIのいずれかの祖先を返す', () => {
            env.editor.innerHTML = '<ul><li><strong>x</strong></li></ul>';
            const textNode = env.editor.querySelector('strong')!.firstChild!;
            const block = env.utils.findBlockAncestor(textNode);
            assert.strictEqual(block, env.editor.querySelector('li'));
        });
    });

    suite('shouldSkipInline', () => {
        test('コードブロック内のノードはインライン整形をスキップする', () => {
            env.editor.innerHTML = '<pre><code>**not bold**</code></pre><p>text</p>';
            const inCode = env.editor.querySelector('code')!.firstChild!;
            const inParagraph = env.editor.querySelector('p')!.firstChild!;

            assert.strictEqual(env.utils.shouldSkipInline(inCode), true);
            assert.strictEqual(env.utils.shouldSkipInline(inParagraph), false);
        });
    });

    suite('ensureTrailingTextNode', () => {
        test('code要素の直後にテキストノードが無ければゼロ幅文字ノードを挿入する', () => {
            env.editor.innerHTML = '<p><code>x</code></p>';
            const code = env.editor.querySelector('code')!;
            const textNode = env.utils.ensureTrailingTextNode(code);

            assert.ok(textNode);
            assert.strictEqual(textNode.nodeType, 3); // TEXT_NODE
            assert.strictEqual(textNode.textContent, env.state.ZERO_WIDTH);
            assert.strictEqual(code.nextSibling, textNode);
        });

        test('既にテキストノードがあればそれを返す', () => {
            env.editor.innerHTML = '<p><code>x</code>after</p>';
            const code = env.editor.querySelector('code')!;
            const textNode = env.utils.ensureTrailingTextNode(code);
            assert.strictEqual(textNode.textContent, 'after');
        });
    });

    suite('findCodeBeforeCaret', () => {
        test('テキストノード直前のcode要素を返す', () => {
            env.editor.innerHTML = '<p><code>x</code>after</p>';
            const code = env.editor.querySelector('code')!;
            const after = code.nextSibling!;
            assert.strictEqual(env.utils.findCodeBeforeCaret(after, 0), code);
        });

        test('直前がcode要素でなければnullを返す', () => {
            env.editor.innerHTML = '<p><strong>x</strong>after</p>';
            const after = env.editor.querySelector('strong')!.nextSibling!;
            assert.strictEqual(env.utils.findCodeBeforeCaret(after, 0), null);
        });

        test('要素ノード内オフセット位置の直前のcode要素を返す', () => {
            env.editor.innerHTML = '<p><code>x</code><br></p>';
            const p = env.editor.querySelector('p')!;
            const code = env.editor.querySelector('code')!;
            assert.strictEqual(env.utils.findCodeBeforeCaret(p, 1), code);
            assert.strictEqual(env.utils.findCodeBeforeCaret(p, 0), null);
        });
    });

    suite('カーソル位置の保存と復元', () => {
        test('保存した文字オフセット位置に復元できる', () => {
            env.editor.innerHTML = '<p>abcdef</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;

            // オフセット3にキャレットを置く
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 3);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            const saved = env.utils.saveCursorPosition();
            assert.ok(saved);
            assert.strictEqual(saved.offset, 3);

            // DOMを再構築（同じテキスト内容）した後に復元
            env.editor.innerHTML = '<p>abcdef</p>';
            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            assert.strictEqual(restored.anchorOffset, 3);
            assert.strictEqual(
                restored.anchorNode,
                env.editor.querySelector('p')!.firstChild
            );
        });

        test('選択が無い場合はnullを返す', () => {
            env.window.getSelection().removeAllRanges();
            assert.strictEqual(env.utils.saveCursorPosition(), null);
        });

        test('保存結果はノード基準アンカー（node/nodeOffset）も持つ', () => {
            env.editor.innerHTML = '<p>abcdef</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 3);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            const saved = env.utils.saveCursorPosition();
            assert.strictEqual(saved.node, textNode);
            assert.strictEqual(saved.nodeOffset, 3);
            assert.strictEqual(saved.offset, 3);
        });

        test('ノードが生きていれば、前方の文字数が変わっても正確な位置へ復元する', () => {
            // 「編集中にキャレットが別の場所へずれる」根本原因（文字数オフセット方式）への
            // ノード基準アンカーの回帰テスト。埋め込みウィジェット等の再描画で
            // キャレット前の文字数が変わっても、ノードが生きていれば正しい位置に戻る。
            env.editor.innerHTML = '<span class="w">XXXX</span><p>abcdef</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 3);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            const saved = env.utils.saveCursorPosition();
            // キャレットより前のノードのテキスト量を増やす（オフセット方式なら +8 ずれる）
            (env.editor.querySelector('.w')!.firstChild as Text).textContent = 'XXXXXXXXXXXX';

            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            assert.strictEqual(restored.anchorNode, textNode, '同じノードへ戻っていない');
            assert.strictEqual(restored.anchorOffset, 3, 'ノード内オフセットがずれた');
        });

        test('保存ノードが消えている場合はオフセット方式へフォールバックする', () => {
            env.editor.innerHTML = '<p>abcdef</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 3);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            const saved = env.utils.saveCursorPosition();

            // innerHTML 全書き換えで保存ノードは切り離される（別ノードの同内容）
            env.editor.innerHTML = '<p>abcdef</p>';
            assert.ok(!env.editor.contains(saved.node), '前提: 保存ノードは切り離されている');

            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            // 新しいノードのオフセット3へ復元される
            assert.strictEqual(restored.anchorNode, env.editor.querySelector('p')!.firstChild);
            assert.strictEqual(restored.anchorOffset, 3);
        });

        test('ノードは生きているが nodeOffset が範囲外なら長さへクランプする（例外を投げない）', () => {
            env.editor.innerHTML = '<p>abcdef</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 6);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            const saved = env.utils.saveCursorPosition();

            // ノードは同一のまま短くする（nodeOffset 6 は範囲外になる）
            (textNode as Text).textContent = 'ab';

            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            assert.strictEqual(restored.anchorNode, textNode);
            assert.strictEqual(restored.anchorOffset, 2, '長さ(2)へクランプされていない');
        });

        test('復元先オフセットに届かず選択も失われている場合、先頭へ飛ばず最寄り末尾へ復元する', () => {
            // 「編集中に突然キャレットが一番上へ飛ぶ」不具合の回帰テスト。
            // 保存時オフセット(29)より本文が短くなり(5文字)、かつ直前の innerHTML
            // 全書き換えで選択が破棄された状況を再現する。
            env.editor.innerHTML = '<p>0123456789012345678901234567890123</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 29);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            const saved = env.utils.saveCursorPosition();
            assert.strictEqual(saved.offset, 29);

            // 本文が短くなり、選択が破棄される（=ブラウザが先頭へ描画する状況）
            env.editor.innerHTML = '<p>short</p>';
            selection.removeAllRanges();

            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            assert.strictEqual(restored.rangeCount, 1, 'キャレットが設定されていない');
            // エディタ先頭（offset 0 / editor直下）へ飛んでいないこと
            const jumpedToTop = restored.anchorNode === env.editor && restored.anchorOffset === 0;
            assert.ok(!jumpedToTop, 'キャレットが先頭へ飛んでいる');
            // 到達できた最寄り＝残っているテキストの末尾（"short" の 5）
            assert.strictEqual(restored.anchorNode, env.editor.querySelector('p')!.firstChild);
            assert.strictEqual(restored.anchorOffset, 5);
        });

        test('復元先オフセットに届かないが妥当な選択が残っている場合はその位置を維持する', () => {
            // 選択がエディタ内に残っているケースでは従来どおり何も動かさない
            // （不要にキャレットを末尾へ動かす回帰を防ぐ）。
            env.editor.innerHTML = '<p>short</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 2);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            // 届かないオフセットで復元を試みる
            env.utils.restoreCursorPosition({ offset: 999, text: 'x'.repeat(999) });

            const after = env.window.getSelection();
            assert.strictEqual(after.anchorNode, textNode);
            assert.strictEqual(after.anchorOffset, 2, '選択位置が動いてしまった');
        });

        test('innerHTML全書き換え後に選択が(editor,0)へcollapseした場合も先頭に留めず最寄りへ復元する', () => {
            // 実ブラウザでは innerHTML 全書き換え後、選択が rangeCount=0 ではなく
            // 「エディタ直下の先頭 (editor, 0)」へ collapse することがある。これは
            // まさに「先頭へ飛んだ」状態で、放置すると不具合になる。
            env.editor.innerHTML = '<p>0123456789012345678901234567890123</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;
            const selection = env.window.getSelection();
            let range = env.document.createRange();
            range.setStart(textNode, 29);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            const saved = env.utils.saveCursorPosition();

            // 本文が短くなり、選択はエディタ先頭 (editor, 0) へ collapse した状態を再現
            env.editor.innerHTML = '<p>short</p>';
            range = env.document.createRange();
            range.setStart(env.editor, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            assert.strictEqual(restored.rangeCount, 1);
            // (editor, 0) の先頭状態に留まっていないこと
            const stillAtTop = restored.anchorNode === env.editor && restored.anchorOffset === 0;
            assert.ok(!stillAtTop, 'キャレットが先頭 (editor, 0) に留まっている');
            // 最寄り＝残っているテキストの末尾へ復元される
            assert.strictEqual(restored.anchorNode, env.editor.querySelector('p')!.firstChild);
            assert.strictEqual(restored.anchorOffset, 5);
        });

        test('保存結果はブロック基準アンカー（blockIndex/blockOffset）も持つ', () => {
            env.editor.innerHTML = '<p>first</p><p>abcdef</p>';
            const textNode = env.editor.querySelectorAll('p')[1]!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 3);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            const saved = env.utils.saveCursorPosition();
            // キャレットは2番目のトップレベルブロック（index 1）内のオフセット3
            assert.strictEqual(saved.blockIndex, 1);
            assert.strictEqual(saved.blockOffset, 3);
        });

        test('ノードが消えても、前のブロックの文字量が変わればブロック基準で正確に復元する', () => {
            // innerHTML 全書き換え経路（保存ノード破棄）の回帰テスト。
            // キャレットより前のブロック（数式/Mermaid/テーブル相当）が再描画で
            // 文字量を変えても、キャレットのブロックに閉じたローカルオフセットなので
            // グローバルオフセット方式のように別ブロックへドリフトしない。
            env.editor.innerHTML = '<div class="mermaid">short</div><p>abcdef</p>';
            const textNode = env.editor.querySelector('p')!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 3);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            const saved = env.utils.saveCursorPosition();
            assert.strictEqual(saved.blockIndex, 1);
            assert.strictEqual(saved.blockOffset, 3);

            // 全書き換え相当：保存ノードは破棄され、先頭ブロックの文字量が大きく増える
            env.editor.innerHTML =
                '<div class="mermaid">MUCH LONGER RENDERED TEXT</div><p>abcdef</p>';
            assert.ok(!env.editor.contains(saved.node), '前提: 保存ノードは切り離されている');

            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            // グローバルオフセット（5+3=8文字目）だと先頭ブロック内へずれるが、
            // ブロック基準なら p の firstChild オフセット3へ正確に戻る
            assert.strictEqual(
                restored.anchorNode, env.editor.querySelector('p')!.firstChild,
                'キャレットのブロックへ戻っていない'
            );
            assert.strictEqual(restored.anchorOffset, 3, 'ブロック内オフセットがずれた');
        });

        test('ブロックが前に挿入されてindexがずれても、署名が一意一致すれば正しいブロックへ復元する', () => {
            // 全書き換えでキャレットのブロックより前に別ブロックが挿入され、
            // blockIndex が指す位置が別ブロックになっても、内容の署名で辿って正しく戻す。
            env.editor.innerHTML = '<p>alpha</p><p>target</p>';
            const textNode = env.editor.querySelectorAll('p')[1]!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 3);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            const saved = env.utils.saveCursorPosition();
            assert.strictEqual(saved.blockIndex, 1);
            assert.strictEqual(saved.blockSignature, 'target');

            // 全書き換え：先頭に新しいブロックが挿入され、"target" は index 2 へ移動
            env.editor.innerHTML = '<p>alpha</p><p>inserted</p><p>target</p>';
            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            // index 1（"inserted"）ではなく、署名一致の "target"（index 2）へ戻る
            assert.strictEqual(
                restored.anchorNode, env.editor.querySelectorAll('p')[2]!.firstChild,
                '署名一致ブロックへ戻っていない'
            );
            assert.strictEqual(restored.anchorOffset, 3);
        });

        test('キャレットのブロック自体が編集され署名が変わった場合はblockIndexで引く', () => {
            env.editor.innerHTML = '<p>alpha</p><p>target</p>';
            const textNode = env.editor.querySelectorAll('p')[1]!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 3);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            const saved = env.utils.saveCursorPosition();

            // キャレットのブロックが編集されて署名が変化（index は不変）
            env.editor.innerHTML = '<p>alpha</p><p>targetXYZ</p>';
            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            // 署名一致は無い → blockIndex=1 で引き、ブロック内オフセット3へ
            assert.strictEqual(restored.anchorNode, env.editor.querySelectorAll('p')[1]!.firstChild);
            assert.strictEqual(restored.anchorOffset, 3);
        });

        test('blockIndexが範囲外（ブロック構造が変わった）ならグローバルオフセット方式へフォールバックする', () => {
            env.editor.innerHTML = '<p>first</p><p>abcdef</p>';
            const textNode = env.editor.querySelectorAll('p')[1]!.firstChild!;
            const selection = env.window.getSelection();
            const range = env.document.createRange();
            range.setStart(textNode, 3);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            const saved = env.utils.saveCursorPosition();
            assert.strictEqual(saved.blockIndex, 1);

            // ブロックが1つに減る（index 1 は存在しなくなる）＝グローバルオフセットで復元
            env.editor.innerHTML = '<p>firstabcdef</p>';
            env.utils.restoreCursorPosition(saved);

            const restored = env.window.getSelection();
            // saved.offset は "first"(5) + 3 = 8。単一ブロック内の8文字目へ戻る
            assert.strictEqual(restored.anchorNode, env.editor.querySelector('p')!.firstChild);
            assert.strictEqual(restored.anchorOffset, 8);
        });

        test('本文が空でオフセットに届かない場合はエディタ末尾へフォールバックする', () => {
            env.editor.innerHTML = '';
            env.window.getSelection().removeAllRanges();

            env.utils.restoreCursorPosition({ offset: 5, text: 'abcde' });

            const restored = env.window.getSelection();
            assert.strictEqual(restored.rangeCount, 1);
            // 例外を投げず、エディタを基準にキャレットが設定されていること
            assert.ok(env.editor.contains(restored.anchorNode) || restored.anchorNode === env.editor);
        });
    });

    suite('blockSignatureOf（ブロック署名）', () => {
        test('要素の先頭テキストを空白畳み込みして返す', () => {
            env.editor.innerHTML = '<p>  hello   world  </p>';
            const p = env.editor.querySelector('p')!;
            assert.strictEqual(env.utils.blockSignatureOf(p), 'hello world');
        });

        test('64文字を超えるテキストは先頭64文字に丸める', () => {
            const long = 'a'.repeat(100);
            env.editor.innerHTML = `<p>${long}</p>`;
            const p = env.editor.querySelector('p')!;
            assert.strictEqual(env.utils.blockSignatureOf(p).length, 64);
        });

        test('null・空要素は空文字を返す', () => {
            assert.strictEqual(env.utils.blockSignatureOf(null), '');
            env.editor.innerHTML = '<p></p>';
            assert.strictEqual(env.utils.blockSignatureOf(env.editor.querySelector('p')), '');
        });
    });

    suite('shouldIgnoreStaleUpdate（競合する古いエコーの判定）', () => {
        test('エコーの seq が最新の送信 seq より小さければ無視する（陳腐化）', () => {
            // 「AB」(seq2) を送った後「ABC」(seq3) を送ると editSeq=3。
            // 遅れて届いた「AB」のエコー(seq2)は 2 < 3 なので無視する。
            assert.strictEqual(env.utils.shouldIgnoreStaleUpdate(2, 3), true);
        });

        test('エコーの seq が最新と同値なら無視しない（最新エコーは内容一致ガードに委ねる）', () => {
            assert.strictEqual(env.utils.shouldIgnoreStaleUpdate(3, 3), false);
        });

        test('seq が未指定（外部編集・初期ロード）なら常に適用する', () => {
            assert.strictEqual(env.utils.shouldIgnoreStaleUpdate(undefined, 5), false);
            assert.strictEqual(env.utils.shouldIgnoreStaleUpdate(null, 5), false);
        });

        test('editSeq が初期値0（まだ何も送っていない）なら無視しない', () => {
            assert.strictEqual(env.utils.shouldIgnoreStaleUpdate(0, 0), false);
        });
    });

    suite('restoreCaretAfterRender（非同期描画完了後のキャレット復元）', () => {
        test('Promiseが解決してから復元コールバックを呼ぶ（描画完了前には呼ばない）', async () => {
            let calledBeforeResolve = false;
            let called = false;
            let resolveRender: () => void = () => {};
            const renderPromise = new Promise<void>((resolve) => {
                resolveRender = resolve;
            });

            env.utils.restoreCaretAfterRender(renderPromise, () => {
                called = true;
            });

            // まだ描画（Promise）が解決していないので復元は走っていない
            await Promise.resolve();
            calledBeforeResolve = called;

            resolveRender();
            await renderPromise;
            await Promise.resolve();

            assert.strictEqual(calledBeforeResolve, false, '描画完了前に復元してはいけない');
            assert.strictEqual(called, true, '描画完了後に復元する');
        });

        test('Promiseが失敗（reject）しても復元は試みる（DOM構造は確定しているため）', async () => {
            let called = false;
            const renderPromise = Promise.reject(new Error('render failed'));

            env.utils.restoreCaretAfterRender(renderPromise, () => {
                called = true;
            });

            // rejectのハンドリングを待つ
            await renderPromise.catch(() => {});
            await Promise.resolve();

            assert.strictEqual(called, true, '描画失敗時も復元を試みる');
        });

        test('Promiseでない値（同期描画のみ）ならマクロタスクで復元する', (done) => {
            let called = false;

            env.utils.restoreCaretAfterRender(undefined, () => {
                called = true;
            });

            // 同期的には呼ばれない（setTimeout(0)経由）
            assert.strictEqual(called, false, '同期的には復元しない');

            setTimeout(() => {
                assert.strictEqual(called, true, 'マクロタスクで復元する');
                done();
            }, 0);
        });

        test('復元コールバックが関数でなければ何もしない（例外を投げない）', () => {
            assert.doesNotThrow(() => {
                env.utils.restoreCaretAfterRender(Promise.resolve(), undefined as any);
                env.utils.restoreCaretAfterRender(undefined, null as any);
            });
        });
    });
});

suite('EditorState', () => {
    let env: EditorEnv;

    setup(() => {
        env = createEditorEnv();
    });

    test('initDOMReferencesで主要DOM要素への参照が設定される', () => {
        assert.ok(env.state.editor);
        assert.ok(env.state.rawEditor);
        assert.ok(env.state.toggleBtn);
        assert.ok(env.state.toggleRawWrapBtn);
        assert.ok(env.state.findWidget);
        assert.ok(env.state.vscode);
    });

    test('resetで編集中フラグと一時状態が初期化される', () => {
        env.state.isUpdating = true;
        env.state.isFormatting = true;
        env.state.isEditingTable = true;
        env.state.findMatches = [1, 2, 3];
        env.state.currentMatchIndex = 2;

        env.state.reset();

        assert.strictEqual(env.state.isUpdating, false);
        assert.strictEqual(env.state.isFormatting, false);
        assert.strictEqual(env.state.isEditingTable, false);
        assert.strictEqual(env.state.findMatches.length, 0);
        assert.strictEqual(env.state.currentMatchIndex, -1);
    });

    test('editSeqは初期値0で、getter/setterで読み書きできる', () => {
        assert.strictEqual(env.state.editSeq, 0);
        env.state.editSeq = env.state.editSeq + 1;
        assert.strictEqual(env.state.editSeq, 1);
    });

    test('isRawWrapEnabledは初期値falseで、getter/setterで読み書きできる', () => {
        assert.strictEqual(env.state.isRawWrapEnabled, false);
        env.state.isRawWrapEnabled = true;
        assert.strictEqual(env.state.isRawWrapEnabled, true);
    });
});

suite('waitForRenderComplete（印刷前の描画待ち合わせ）', () => {
    let env: EditorEnv;

    setup(() => {
        env = createEditorEnv();
    });

    /** すぐには解決しない Promise と、その解決関数を返す */
    function deferred(): { promise: Promise<void>; resolve: () => void } {
        let resolve!: () => void;
        const promise = new Promise<void>(r => { resolve = r as () => void; });
        return { promise, resolve };
    }

    test('待ち対象が無ければすぐ解決する', async () => {
        await env.utils.waitForRenderComplete();
        await env.utils.waitForRenderComplete({});
    });

    /** マイクロタスクを十分に流す（Promise.all→race→then のホップ分） */
    async function flush(n = 30): Promise<void> {
        for (let i = 0; i < n; i++) { await Promise.resolve(); }
    }

    test('Mermaid再描画・フォント・画像のどれか1つでも未完了なら解決しない', async () => {
        // 3つのうち2つだけ解決させて「まだ待っている」ことを確認する。
        // 1つ resolve しただけで通るような弱い検証だと、待ち漏れ（例: 進行中の
        // Mermaid描画を待たない）を検出できない
        const cases: Array<'mermaid' | 'fonts' | 'image'> = ['mermaid', 'fonts', 'image'];
        for (const remaining of cases) {
            const mermaid = deferred();
            const fonts = deferred();
            const img = env.document.createElement('img');
            Object.defineProperty(img, 'complete', { value: false });

            let done = false;
            const p = env.utils.waitForRenderComplete({
                renderMermaid: () => mermaid.promise,
                fontsReady: fonts.promise,
                images: [img],
                timeoutMs: 10000
            }).then(() => { done = true; });

            // `remaining` 以外を全部解決させる
            if (remaining !== 'mermaid') { mermaid.resolve(); }
            if (remaining !== 'fonts') { fonts.resolve(); }
            if (remaining !== 'image') { img.dispatchEvent(new env.window.Event('load')); }
            await flush();
            assert.strictEqual(done, false, `${remaining} を待たずに解決している`);

            // 残りも解決させれば完了する
            mermaid.resolve();
            fonts.resolve();
            img.dispatchEvent(new env.window.Event('load'));
            await p;
            assert.strictEqual(done, true, `${remaining} の解決後に完了しない`);
        }
    });

    test('読み込み済みの画像は待たない', async () => {
        const img = env.document.createElement('img');
        Object.defineProperty(img, 'complete', { value: true });
        // load を発火させなくても解決する
        await env.utils.waitForRenderComplete({ images: [img], timeoutMs: 10000 });
    });

    test('画像の読み込みが error でも解決する（1枚の失敗で印刷を止めない）', async () => {
        const img = env.document.createElement('img');
        Object.defineProperty(img, 'complete', { value: false });
        const p = env.utils.waitForRenderComplete({ images: [img], timeoutMs: 10000 });
        img.dispatchEvent(new env.window.Event('error'));
        await p;
    });

    test('待ち対象が reject しても reject せず解決する', async () => {
        await env.utils.waitForRenderComplete({
            renderMermaid: () => Promise.reject(new Error('render failed')),
            fontsReady: Promise.reject(new Error('fonts failed')),
            timeoutMs: 10000
        });
    });

    test('renderMermaid が同期例外を投げても解決する', async () => {
        await env.utils.waitForRenderComplete({
            renderMermaid: () => { throw new Error('boom'); },
            timeoutMs: 10000
        });
    });

    test('timeoutMs が不正（NaN・0以下）なら既定値へ倒す', async () => {
        // setTimeout(fn, NaN) は即時発火＝待ち合わせが丸ごと無効になる
        for (const bad of [NaN, 0, -1, undefined]) {
            let fired: number | null = null;
            await env.utils.waitForRenderComplete({
                fontsReady: new Promise<void>(() => { /* 解決しない */ }),
                timeoutMs: bad,
                setTimeoutFn: (fn: () => void, ms: number) => { fired = ms; fn(); return 0; }
            });
            assert.strictEqual(fired, 5000, `timeoutMs=${String(bad)} で既定値になっていない`);
        }
    });

    test('待ち対象が先に終わったら上限タイマーを解除する', async () => {
        let cleared: unknown = null;
        await env.utils.waitForRenderComplete({
            fontsReady: Promise.resolve(),
            timeoutMs: 10000,
            setTimeoutFn: () => 'timer-id',
            clearTimeoutFn: (id: unknown) => { cleared = id; }
        });
        assert.strictEqual(cleared, 'timer-id', 'タイマーを解除していない');
    });

    test('待ち対象が解決しなくても上限時間で解決する', async () => {
        const never = new Promise<void>(() => { /* 解決しない */ });
        let fired: number | null = null;
        await env.utils.waitForRenderComplete({
            fontsReady: never,
            timeoutMs: 1234,
            // タイマーは注入して即時発火させる（テストを実時間で待たせない）
            setTimeoutFn: (fn: () => void, ms: number) => { fired = ms; fn(); return 0; }
        });
        assert.strictEqual(fired, 1234, '指定した上限時間でタイマーを張っていない');
    });
});

suite('debounce（入力のたびに走る重い処理をまとめる）', () => {
    let env: EditorEnv;

    setup(() => {
        env = createEditorEnv();
    });

    /** 手動で進められる偽タイマー。指定された待ち時間も記録する */
    function fakeTimers() {
        let nextId = 1;
        const scheduled = new Map<number, () => void>();
        const delays: number[] = [];
        return {
            delays,
            setTimeoutFn: (fn: () => void, ms: number) => {
                const id = nextId++;
                scheduled.set(id, fn);
                delays.push(ms);
                return id;
            },
            clearTimeoutFn: (id: number) => { scheduled.delete(id); },
            /** 保留中のものを全て実行する */
            run: () => {
                const fns = Array.from(scheduled.values());
                scheduled.clear();
                fns.forEach(fn => fn());
            },
            get pending() { return scheduled.size; }
        };
    }

    test('連続して呼んでも最後の1回だけ実行される', () => {
        const timers = fakeTimers();
        let calls = 0;
        const debounced = env.utils.debounce(() => { calls++; }, 150, timers);

        debounced();
        debounced();
        debounced();
        assert.strictEqual(calls, 0, '待ち時間の前に実行されている');
        assert.strictEqual(timers.pending, 1, 'タイマーが積み上がっている');

        timers.run();
        assert.strictEqual(calls, 1);
    });

    test('指定した待ち時間でタイマーを張る', () => {
        // 待ち時間が渡っていない／別の値に化けてもデバウンスの体裁は保たれるため、
        // 実際に何ミリ秒でスケジュールしたかを確認する
        const timers = fakeTimers();
        const debounced = env.utils.debounce(() => { /* no-op */ }, 150, timers);
        debounced();
        assert.deepStrictEqual(timers.delays, [150]);
    });

    test('waitMs が不正（NaN）でも 0 へ倒して動く', () => {
        // setTimeout(fn, NaN) は即時発火してデバウンスが効かなくなる。
        // 0 は「次のタスクへ回す」という正当な指定なので弾かない
        const timers = fakeTimers();
        const debounced = env.utils.debounce(() => { /* no-op */ }, NaN, timers);
        debounced();
        assert.deepStrictEqual(timers.delays, [0]);

        const zero = fakeTimers();
        env.utils.debounce(() => { /* no-op */ }, 0, zero)();
        assert.deepStrictEqual(zero.delays, [0]);
    });

    test('cancel() の後でも再びスケジュールできる', () => {
        // cancel が timerId を戻し忘れると、以降 clear されず
        // デバウンスが効かなくなる／cancel が二度と効かなくなる
        const timers = fakeTimers();
        let calls = 0;
        const debounced = env.utils.debounce(() => { calls++; }, 150, timers);

        debounced();
        debounced.cancel();
        debounced();
        debounced();
        assert.strictEqual(timers.pending, 1, 'cancel後にタイマーが積み上がっている');
        timers.run();
        assert.strictEqual(calls, 1);

        // 2度目の cancel も効く
        debounced();
        debounced.cancel();
        timers.run();
        assert.strictEqual(calls, 1, 'cancel後に実行されている');
    });

    test('最後の呼び出しの引数で実行される', () => {
        const timers = fakeTimers();
        const received: unknown[] = [];
        const debounced = env.utils.debounce((...args: unknown[]) => {
            received.push(...args);
        }, 150, timers);

        debounced('a');
        debounced('b', 2);
        timers.run();
        assert.deepStrictEqual(received, ['b', 2]);
    });

    test('待ち時間が経過するたびに実行される（1回きりではない）', () => {
        const timers = fakeTimers();
        let calls = 0;
        const debounced = env.utils.debounce(() => { calls++; }, 150, timers);

        debounced();
        timers.run();
        assert.strictEqual(calls, 1);

        debounced();
        timers.run();
        assert.strictEqual(calls, 2);
    });

    test('cancel() で保留中の実行を取り消せる', () => {
        const timers = fakeTimers();
        let calls = 0;
        const debounced = env.utils.debounce(() => { calls++; }, 150, timers);

        debounced();
        assert.strictEqual(timers.pending, 1);
        debounced.cancel();
        assert.strictEqual(timers.pending, 0, 'タイマーが残っている');

        timers.run();
        assert.strictEqual(calls, 0, 'cancel 後に実行されている');
    });

    test('cancel() は保留が無くても安全に呼べる', () => {
        const timers = fakeTimers();
        const debounced = env.utils.debounce(() => { /* no-op */ }, 150, timers);
        debounced.cancel();
        debounced.cancel();
    });
});
