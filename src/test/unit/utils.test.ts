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
});
