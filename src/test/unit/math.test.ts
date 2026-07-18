/**
 * math.test.ts - MathModule（ブロック数式の右クリックメニュー・PNGコピー）のユニットテスト
 *
 * KaTeX 本体（描画）と html2canvas（ラスタライズ）はjsdomに無いため、
 * それらに依存しない部分（メニュー生成・表示位置の算出・対象ブロック判定・
 * html2canvas未読込時のフォールバック）を検証する。
 */
import * as assert from 'assert';
import { createEditorEnv, EditorEnv } from './helper';

suite('MathModule', () => {
    let env: EditorEnv;

    setup(() => {
        env = createEditorEnv();
    });

    suite('findMathBlock', () => {
        test('ブロック数式の内側の要素から祖先の .math-block を返す', () => {
            env.editor.innerHTML =
                '<div class="math-block" data-math="x^2"><span class="inner">x</span></div>';
            const inner = env.editor.querySelector('.inner')!;
            const block = env.math.findMathBlock(inner, env.editor);
            assert.ok(block, 'block should be found');
            assert.ok(block.classList.contains('math-block'));
        });

        test('数式ブロック外の要素では null を返す', () => {
            env.editor.innerHTML = '<p>普通の段落</p>';
            const p = env.editor.querySelector('p')!;
            assert.strictEqual(env.math.findMathBlock(p, env.editor), null);
        });

        test('root（エディタ）自身に達したら null を返す', () => {
            env.editor.innerHTML = '<p>text</p>';
            assert.strictEqual(env.math.findMathBlock(env.editor, env.editor), null);
        });
    });

    suite('computeMenuPosition', () => {
        test('ビューポート内に収まるならクリック座標をそのまま使う', () => {
            const pos = env.math.computeMenuPosition(100, 100, 180, 60, 1024, 768);
            // pos は jsdom側レルムのオブジェクトのため deepStrictEqual は使わず個別に比較する
            assert.strictEqual(pos.left, 100);
            assert.strictEqual(pos.top, 100);
        });

        test('右端・下端からはみ出す場合は内側へ寄せる', () => {
            const pos = env.math.computeMenuPosition(1000, 740, 180, 60, 1024, 768);
            assert.strictEqual(pos.left, 1024 - 180 - 10);
            assert.strictEqual(pos.top, 768 - 60 - 10);
        });

        test('メニューがビューポートより大きくても負の座標にはしない', () => {
            const pos = env.math.computeMenuPosition(10, 10, 2000, 2000, 1024, 768);
            assert.strictEqual(pos.left, 0);
            assert.strictEqual(pos.top, 0);
        });
    });

    suite('setupContextMenu と右クリック', () => {
        function dispatchContextMenu(target: Element, clientX = 50, clientY = 50) {
            const ev = new env.window.MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX,
                clientY
            });
            target.dispatchEvent(ev);
            return ev;
        }

        test('メニュー要素（コピー項目付き）を動的生成する', () => {
            env.math.setupContextMenu(env.editor);
            const menu = env.document.getElementById('mathContextMenu');
            assert.ok(menu, 'menu element should be created');
            const item = menu!.querySelector('.math-menu-item[data-action="copyImage"]');
            assert.ok(item, 'copy menu item should exist');
        });

        test('ブロック数式上の右クリックでメニューを表示し既定メニューを抑止する', () => {
            env.math.setupContextMenu(env.editor);
            env.editor.innerHTML = '<div class="math-block" data-math="x^2">x</div>';
            const block = env.editor.querySelector('.math-block')!;

            const ev = dispatchContextMenu(block);
            assert.strictEqual(ev.defaultPrevented, true, 'default menu should be prevented');
            const menu = env.document.getElementById('mathContextMenu')!;
            assert.strictEqual(menu.style.display, 'block');
        });

        test('数式ブロック以外の右クリックではメニューを出さず既定に任せる', () => {
            env.math.setupContextMenu(env.editor);
            env.editor.innerHTML = '<p>普通の段落</p>';
            const p = env.editor.querySelector('p')!;

            const ev = dispatchContextMenu(p);
            assert.strictEqual(ev.defaultPrevented, false, 'default menu should NOT be prevented');
            const menu = env.document.getElementById('mathContextMenu')!;
            assert.strictEqual(menu.style.display, 'none');
        });

        test('メニュー項目クリックでメニューが閉じる', () => {
            env.math.setupContextMenu(env.editor);
            env.editor.innerHTML = '<div class="math-block" data-math="x^2">x</div>';
            const block = env.editor.querySelector('.math-block')!;
            dispatchContextMenu(block);

            const menu = env.document.getElementById('mathContextMenu')!;
            const item = menu.querySelector('.math-menu-item') as HTMLElement;
            item.click();
            assert.strictEqual(menu.style.display, 'none');
        });
    });

    suite('copyBlockAsPng', () => {
        test('html2canvas 未読込でも例外を投げず、トーストで失敗を知らせる', async () => {
            // jsdomには html2canvas が無いため、この経路がフォールバックを通る
            env.editor.innerHTML = '<div class="math-block" data-math="x^2">x</div>';
            const block = env.editor.querySelector('.math-block')!;

            await env.math.copyBlockAsPng(block);

            const toast = env.document.querySelector('.mermaid-toast');
            assert.ok(toast, 'a toast should be shown');
            assert.ok(/コピーに失敗/.test(toast!.textContent || ''), toast!.textContent || '');
        });

        test('block が null でも何もせず例外を投げない', async () => {
            await env.math.copyBlockAsPng(null);
            assert.strictEqual(env.document.querySelector('.mermaid-toast'), null);
        });
    });

    suite('buildMathBlockSvgMarkup（foreignObject SVG マークアップ組み立て）', () => {
        test('SVG/xhtml名前空間・foreignObject・寸法・内容を正しく埋め込む', () => {
            const svg = env.math.buildMathBlockSvgMarkup(
                '<span class="katex">x^2</span>', '.katex{color:#000}', 120, 40, 'transparent'
            );
            assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), svg);
            assert.ok(svg.includes('width="120"'), svg);
            assert.ok(svg.includes('height="40"'), svg);
            assert.ok(svg.includes('viewBox="0 0 120 40"'), svg);
            assert.ok(svg.includes('<foreignObject'), svg);
            assert.ok(svg.includes('<div xmlns="http://www.w3.org/1999/xhtml">'), svg);
            assert.ok(svg.includes('<style>.katex{color:#000}</style>'), svg);
            assert.ok(svg.includes('<span class="katex">x^2</span>'), svg);
            assert.ok(svg.trim().endsWith('</svg>'), svg);
        });

        test('transparent／未指定では背景の rect を描かない（透過）', () => {
            const transparent = env.math.buildMathBlockSvgMarkup('x', '', 10, 10, 'transparent');
            const omitted = env.math.buildMathBlockSvgMarkup('x', '', 10, 10);
            assert.ok(!transparent.includes('<rect'), transparent);
            assert.ok(!omitted.includes('<rect'), omitted);
        });

        test('背景色を指定すると全面塗りの rect を描く', () => {
            const svg = env.math.buildMathBlockSvgMarkup('x', '', 10, 10, '#ffffff');
            assert.ok(svg.includes('<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>'), svg);
        });

        test('背景色の属性値はエスケープされSVGを壊さない', () => {
            const svg = env.math.buildMathBlockSvgMarkup('x', '', 10, 10, '"><script>x</script>');
            assert.ok(!svg.includes('"><script>'), svg);
            assert.ok(svg.includes('&quot;&gt;&lt;script&gt;'), svg);
        });

        test('CSS未指定では style要素を出さない', () => {
            const svg = env.math.buildMathBlockSvgMarkup('x', '', 10, 10);
            assert.ok(!svg.includes('<style>'), svg);
        });

        test('寸法は最低1px・切り上げに正規化される', () => {
            const svg = env.math.buildMathBlockSvgMarkup('x', '', 0, 12.3, 'transparent');
            assert.ok(svg.includes('width="1"'), svg);
            assert.ok(svg.includes('height="13"'), svg);
        });
    });
});
