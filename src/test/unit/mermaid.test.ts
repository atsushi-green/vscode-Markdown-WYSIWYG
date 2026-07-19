/**
 * mermaid.test.ts - MermaidModule の純粋関数のユニットテスト
 *
 * mermaid.js は mermaid.min.js / html2canvas 本体に依存するが、それらは関数内で
 * しか参照しないため、DOMに依存しない純粋関数（背景色の解決）は jsdom 上で検証できる。
 */
import * as assert from 'assert';
import { createEditorEnv, EditorEnv } from './helper';

suite('MermaidModule', () => {
    let env: EditorEnv;

    setup(() => {
        env = createEditorEnv();
    });

    suite('resolveImageBackground（画像化の背景指定の解決）', () => {
        test("'transparent' は alpha 有効・塗りつぶし無し・html2canvas背景 null（透過）", () => {
            const bg = env.mermaid.resolveImageBackground('transparent');
            assert.strictEqual(bg.alpha, true);
            assert.strictEqual(bg.fillColor, null);
            assert.strictEqual(bg.html2canvasBackground, null);
        });

        test("'white' は不透明・白で塗りつぶし", () => {
            const bg = env.mermaid.resolveImageBackground('white');
            assert.strictEqual(bg.alpha, false);
            assert.strictEqual(bg.fillColor, '#ffffff');
            assert.strictEqual(bg.html2canvasBackground, '#ffffff');
        });

        test("'black' は不透明・黒で塗りつぶし", () => {
            const bg = env.mermaid.resolveImageBackground('black');
            assert.strictEqual(bg.alpha, false);
            assert.strictEqual(bg.fillColor, '#000000');
            assert.strictEqual(bg.html2canvasBackground, '#000000');
        });

        test('未指定は白（従来動作）へフォールバックする', () => {
            const bg = env.mermaid.resolveImageBackground(undefined);
            assert.strictEqual(bg.alpha, false);
            assert.strictEqual(bg.fillColor, '#ffffff');
            assert.strictEqual(bg.html2canvasBackground, '#ffffff');
        });

        test('未知の値も白（従来動作）へフォールバックする', () => {
            const bg = env.mermaid.resolveImageBackground('rainbow');
            assert.strictEqual(bg.alpha, false);
            assert.strictEqual(bg.fillColor, '#ffffff');
            assert.strictEqual(bg.html2canvasBackground, '#ffffff');
        });
    });
});
