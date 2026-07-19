/**
 * math.test.ts - MathModule（ブロック数式の右クリックメニュー・PNGコピー）のユニットテスト
 *
 * KaTeX 本体（描画）と html2canvas（ラスタライズ）はjsdomに無いため、
 * それらに依存しない部分（メニュー生成・表示位置の算出・対象ブロック判定・
 * html2canvas未読込時のフォールバック）を検証する。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
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

    suite('buildKatexFontFaceCss（data: URL の @font-face 組み立て）', () => {
        test('family/style/weight と base64 から woff2 の @font-face を組み立てる', () => {
            const css = env.math.buildKatexFontFaceCss([
                { family: 'KaTeX_Main', style: 'normal', weight: 400, base64: 'AAA' }
            ]);
            assert.strictEqual(
                css,
                '@font-face{font-family:"KaTeX_Main";font-style:normal;font-weight:400;' +
                'src:url(data:font/woff2;base64,AAA) format("woff2");}'
            );
        });

        test('複数フォントを連結する', () => {
            const css = env.math.buildKatexFontFaceCss([
                { family: 'KaTeX_Main', style: 'italic', weight: 700, base64: 'AAA' },
                { family: 'KaTeX_Math', style: 'italic', weight: 400, base64: 'BBB' }
            ]);
            assert.strictEqual((css.match(/@font-face/g) || []).length, 2);
            assert.ok(css.includes('font-style:italic;font-weight:700'), css);
            assert.ok(css.includes('base64,BBB'), css);
        });

        test('base64 が空／未指定のエントリはスキップする（壊れた @font-face を出さない）', () => {
            const css = env.math.buildKatexFontFaceCss([
                { family: 'KaTeX_Main', style: 'normal', weight: 400, base64: '' },
                { family: 'KaTeX_Math', style: 'italic', weight: 400 },
                { family: 'KaTeX_AMS', style: 'normal', weight: 400, base64: 'CCC' }
            ]);
            assert.strictEqual((css.match(/@font-face/g) || []).length, 1);
            assert.ok(css.includes('KaTeX_AMS'), css);
        });

        test('style は italic 以外を normal に、weight は非3桁数値を 400 に正規化する', () => {
            const css = env.math.buildKatexFontFaceCss([
                { family: 'KaTeX_Main', style: 'oblique', weight: 'bold', base64: 'AAA' }
            ]);
            assert.ok(css.includes('font-style:normal'), css);
            assert.ok(css.includes('font-weight:400'), css);
        });

        test('family の引用符・バックスラッシュを除去してCSSを壊さない', () => {
            const css = env.math.buildKatexFontFaceCss([
                { family: 'Ka"Te\\X', style: 'normal', weight: 400, base64: 'AAA' }
            ]);
            assert.ok(css.includes('font-family:"KaTeX"'), css);
        });

        test('配列でない入力は空文字を返す', () => {
            assert.strictEqual(env.math.buildKatexFontFaceCss(null), '');
            assert.strictEqual(env.math.buildKatexFontFaceCss(undefined), '');
            assert.strictEqual(env.math.buildKatexFontFaceCss('x' as any), '');
        });

        test('base64 の非base64文字（`)`・空白等）を除去して data: URL を壊さない', () => {
            const css = env.math.buildKatexFontFaceCss([
                { family: 'KaTeX_Main', style: 'normal', weight: 400, base64: 'AA)B C\nD=' }
            ]);
            assert.ok(css.includes('base64,AABCD=)'), css);
            // 括弧の早期クローズが無い（data: URL が1つの url(...) に収まる）
            assert.strictEqual((css.match(/format\("woff2"\)/g) || []).length, 1);
        });

        test('base64 がサニタイズ後に空になるエントリはスキップする', () => {
            const css = env.math.buildKatexFontFaceCss([
                { family: 'KaTeX_Main', style: 'normal', weight: 400, base64: ')))' }
            ]);
            assert.strictEqual(css, '');
        });
    });

    suite('KATEX_FONT_MANIFEST（埋め込み対象フォント一覧の整合）', () => {
        test('各エントリの woff2 ファイルが media/katex/fonts/ に実在する', () => {
            // out/test/unit/ から見たプロジェクトルート
            const projectRoot = path.resolve(__dirname, '..', '..', '..');
            const fontsDir = path.join(projectRoot, 'media', 'katex', 'fonts');
            const manifest = env.math.KATEX_FONT_MANIFEST as Array<{ file: string }>;
            assert.ok(Array.isArray(manifest) && manifest.length > 0, 'manifest is non-empty');
            for (const entry of manifest) {
                const p = path.join(fontsDir, entry.file);
                assert.ok(fs.existsSync(p), `missing font file: ${entry.file}`);
            }
        });

        test('(family, style, weight) の組が重複しない', () => {
            const manifest = env.math.KATEX_FONT_MANIFEST as Array<{ family: string; style: string; weight: number }>;
            const keys = manifest.map((e) => `${e.family}|${e.style}|${e.weight}`);
            assert.strictEqual(new Set(keys).size, keys.length, 'duplicate font descriptor');
        });

        test('katex.min.css の woff2 @font-face 群を過不足なく網羅する', () => {
            // マニフェストが katex.min.css の @font-face（woff2）と一致することを保証し、
            // 将来 CSS 側にフォントが増減してもマニフェストの取りこぼしを検知する。
            const projectRoot = path.resolve(__dirname, '..', '..', '..');
            const css = fs.readFileSync(path.join(projectRoot, 'media', 'katex', 'katex.min.css'), 'utf8');
            const cssKeys = new Set<string>();
            const faceRe = /@font-face\{([^}]*)\}/g;
            let m: RegExpExecArray | null;
            while ((m = faceRe.exec(css)) !== null) {
                const body = m[1];
                if (!/url\([^)]*\.woff2\)/.test(body)) {
                    continue; // woff2 を持たない宣言は埋め込み対象外
                }
                const family = (body.match(/font-family:"?([^";]+)"?/) || [])[1];
                const style = (body.match(/font-style:([a-z]+)/) || [])[1] || 'normal';
                const weight = (body.match(/font-weight:(\d+)/) || [])[1] || '400';
                if (family) {
                    cssKeys.add(`${family}|${style}|${weight}`);
                }
            }
            const manifest = env.math.KATEX_FONT_MANIFEST as Array<{ family: string; style: string; weight: number }>;
            // KATEX_FONT_MANIFEST は jsdom レルムの配列のため、Array.from で Node レルムの
            // 配列に materialize してから比較する（deepStrictEqual はプロトタイプも厳密比較する）。
            const manifestKeys = Array.from(manifest, (e) => `${e.family}|${e.style}|${e.weight}`).sort();
            assert.deepStrictEqual(manifestKeys, [...cssKeys].sort());
        });
    });
});
