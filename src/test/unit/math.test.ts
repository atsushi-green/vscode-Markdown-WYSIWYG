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

        test('背景色トグル（透過／白／黒）を持ち既定は白がactive', () => {
            env.math.setupContextMenu(env.editor);
            const menu = env.document.getElementById('mathContextMenu')!;
            const btns = menu.querySelectorAll('.math-bg-btn');
            assert.strictEqual(btns.length, 3, 'should have 3 background buttons');
            const active = menu.querySelector('.math-bg-btn.active');
            assert.ok(active, 'one button should be active by default');
            assert.strictEqual(active!.getAttribute('data-bg'), 'white');
        });

        test('背景ボタンのクリックで active が移り、メニューは閉じない', () => {
            env.math.setupContextMenu(env.editor);
            const menu = env.document.getElementById('mathContextMenu')!;
            menu.style.display = 'block';
            const blackBtn = menu.querySelector('.math-bg-btn[data-bg="black"]') as HTMLElement;
            blackBtn.click();

            assert.ok(blackBtn.classList.contains('active'), 'clicked button becomes active');
            const actives = menu.querySelectorAll('.math-bg-btn.active');
            assert.strictEqual(actives.length, 1, 'only one button stays active');
            assert.strictEqual(menu.style.display, 'block', 'menu stays open after bg toggle');
        });

        test('文字色トグル（自動／黒／白）を持ち既定は自動がactive', () => {
            env.math.setupContextMenu(env.editor);
            const menu = env.document.getElementById('mathContextMenu')!;
            const btns = menu.querySelectorAll('.math-fg-btn');
            assert.strictEqual(btns.length, 3, 'should have 3 text-color buttons');
            const active = menu.querySelector('.math-fg-btn.active');
            assert.ok(active, 'one button should be active by default');
            assert.strictEqual(active!.getAttribute('data-fg'), 'auto');
        });

        test('文字色ボタンのクリックは背景トグルの active に影響しない（行が独立）', () => {
            env.math.setupContextMenu(env.editor);
            const menu = env.document.getElementById('mathContextMenu')!;
            const whiteFg = menu.querySelector('.math-fg-btn[data-fg="white"]') as HTMLElement;
            whiteFg.click();

            // 文字色は white へ移り、背景は既定の white のまま
            assert.ok(whiteFg.classList.contains('active'), 'clicked fg button becomes active');
            assert.strictEqual(menu.querySelectorAll('.math-fg-btn.active').length, 1);
            const bgActive = menu.querySelector('.math-bg-btn.active');
            assert.strictEqual(bgActive!.getAttribute('data-bg'), 'white', 'bg row unaffected');
        });
    });

    suite('resolveMenuBackground', () => {
        function menuWithActive(bg: string | null): HTMLElement {
            const menu = env.document.createElement('div');
            ['transparent', 'white', 'black'].forEach((v) => {
                const btn = env.document.createElement('button');
                btn.className = 'math-bg-btn' + (v === bg ? ' active' : '');
                btn.setAttribute('data-bg', v);
                menu.appendChild(btn);
            });
            return menu;
        }

        test('active な透過／黒はその値を返す', () => {
            assert.strictEqual(env.math.resolveMenuBackground(menuWithActive('transparent')), 'transparent');
            assert.strictEqual(env.math.resolveMenuBackground(menuWithActive('black')), 'black');
        });

        test('active が白・未選択・不正なら白を返す', () => {
            assert.strictEqual(env.math.resolveMenuBackground(menuWithActive('white')), 'white');
            assert.strictEqual(env.math.resolveMenuBackground(menuWithActive(null)), 'white');
        });

        test('menu が null／querySelector を持たなくても白を返す', () => {
            assert.strictEqual(env.math.resolveMenuBackground(null), 'white');
            assert.strictEqual(env.math.resolveMenuBackground({} as unknown as HTMLElement), 'white');
        });
    });

    suite('resolveMenuTextColor', () => {
        function menuWithActive(fg: string | null): HTMLElement {
            const menu = env.document.createElement('div');
            ['auto', 'black', 'white'].forEach((v) => {
                const btn = env.document.createElement('button');
                btn.className = 'math-fg-btn' + (v === fg ? ' active' : '');
                btn.setAttribute('data-fg', v);
                menu.appendChild(btn);
            });
            return menu;
        }

        test('active な黒／白はその値を返す', () => {
            assert.strictEqual(env.math.resolveMenuTextColor(menuWithActive('black')), 'black');
            assert.strictEqual(env.math.resolveMenuTextColor(menuWithActive('white')), 'white');
        });

        test('active が自動・未選択・不正なら auto を返す', () => {
            assert.strictEqual(env.math.resolveMenuTextColor(menuWithActive('auto')), 'auto');
            assert.strictEqual(env.math.resolveMenuTextColor(menuWithActive(null)), 'auto');
        });

        test('menu が null／querySelector を持たなくても auto を返す', () => {
            assert.strictEqual(env.math.resolveMenuTextColor(null), 'auto');
            assert.strictEqual(env.math.resolveMenuTextColor({} as unknown as HTMLElement), 'auto');
        });
    });

    suite('resolveTextColor', () => {
        test("'black'/'white' 指定はその色（16進）で固定する", () => {
            assert.strictEqual(env.math.resolveTextColor('white', 'black'), '#000000');
            assert.strictEqual(env.math.resolveTextColor('transparent', 'white'), '#ffffff');
            assert.strictEqual(env.math.resolveTextColor('black', 'black'), '#000000');
        });

        test("'auto'（既定）は背景追従＝黒背景のみ白・それ以外は黒", () => {
            assert.strictEqual(env.math.resolveTextColor('black', 'auto'), '#ffffff');
            assert.strictEqual(env.math.resolveTextColor('white', 'auto'), '#000000');
            assert.strictEqual(env.math.resolveTextColor('transparent', 'auto'), '#000000');
            // textColor 未指定でも auto と同じ（後方互換）
            assert.strictEqual(env.math.resolveTextColor('black', undefined), '#ffffff');
            assert.strictEqual(env.math.resolveTextColor('transparent', undefined), '#000000');
        });
    });

    suite('copyBlockAsPng', () => {
        test('foreignObject 経路が失敗し html2canvas も無い場合、例外を投げずトーストで失敗を知らせる', async () => {
            // jsdom は SVG 画像を実際に読み込めない（Image が load/error を発火しない）ため、
            // onerror を発火する Image スタブで foreignObject 経路の失敗を再現する。
            // html2canvas も未読込なのでフォールバックも失敗し、copyBlockAsPng が例外を
            // 外へ投げずトーストで知らせることを検証する。
            env.window.Image = class {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                set src(_v: string) {
                    setTimeout(() => { if (this.onerror) { this.onerror(); } }, 0);
                }
            };
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

        // 選んだ背景が PNG 生成（foreignObject SVG）まで伝播することを、Image に渡る
        // data:URL を捕捉して検証する。黒背景では黒地に黒文字で数式が消えないよう
        // 文字色を白へ反転していること（A-1 回帰防止）もここで確認する。
        function captureSvgOnCopy(): { get: () => string } {
            let capturedSrc = '';
            env.window.Image = class {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                set src(v: string) {
                    capturedSrc = v;
                    // 実描画はできないので onerror で後段（フォールバック）へ落とす。
                    // SVG マークアップは src セット時点で既に組み上がっている。
                    setTimeout(() => { if (this.onerror) { this.onerror(); } }, 0);
                }
            };
            return {
                get: () => decodeURIComponent(
                    capturedSrc.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')
                )
            };
        }

        test('黒背景を選ぶと数式の文字色を白へ反転する（黒地に黒文字を防ぐ）', async () => {
            const cap = captureSvgOnCopy();
            env.editor.innerHTML =
                '<div class="math-block" data-math="x^2"><span class="katex">x</span></div>';
            const block = env.editor.querySelector('.math-block')!;

            await env.math.copyBlockAsPng(block, 'black');

            const svg = cap.get();
            assert.ok(svg.includes('fill="black"'), 'black background rect should be drawn');
            assert.ok(
                /rgb\(255,\s*255,\s*255\)|#ffffff|#fff\b/i.test(svg),
                'text color should be white on black background: ' + svg.slice(0, 500)
            );
        });

        test('白背景では文字色は黒のまま（既定動作を維持）', async () => {
            const cap = captureSvgOnCopy();
            env.editor.innerHTML =
                '<div class="math-block" data-math="x^2"><span class="katex">x</span></div>';
            const block = env.editor.querySelector('.math-block')!;

            await env.math.copyBlockAsPng(block, 'white');

            const svg = cap.get();
            assert.ok(svg.includes('fill="white"'), 'white background rect should be drawn');
            assert.ok(
                /rgb\(0,\s*0,\s*0\)|#000000|#000\b/i.test(svg),
                'text color should be black on white background: ' + svg.slice(0, 500)
            );
        });

        test("透過背景でも文字色 'white' を選べば白文字になる（ダーク環境向け）", async () => {
            const cap = captureSvgOnCopy();
            env.editor.innerHTML =
                '<div class="math-block" data-math="x^2"><span class="katex">x</span></div>';
            const block = env.editor.querySelector('.math-block')!;

            await env.math.copyBlockAsPng(block, 'transparent', 'white');

            const svg = cap.get();
            assert.ok(!svg.includes('<rect'), 'transparent background draws no rect');
            assert.ok(
                /rgb\(255,\s*255,\s*255\)|#ffffff|#fff\b/i.test(svg),
                'text color should be white when explicitly selected: ' + svg.slice(0, 500)
            );
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

    suite('serializeNodeToXhtml（foreignObject 用の XHTML 直列化）', () => {
        test('ネストした <svg> に xmlns（SVG名前空間）を付けて直列化する', () => {
            // KaTeX は √ の記号を span 内のインライン <svg> で描く。outerHTML だと
            // xmlns が落ち、XML 解釈される foreignObject 内で √ が消える（回帰ガード）。
            const div = env.window.document.createElement('div');
            div.innerHTML = '<span class="katex"><svg viewBox="0 0 400000 1080"><path d="M95,702"></path></svg></span>';
            const xhtml = env.math.serializeNodeToXhtml(div);
            assert.ok(xhtml.includes('<svg xmlns="http://www.w3.org/2000/svg"'), xhtml);
        });

        test('HTML要素はXHTML名前空間の宣言付きで直列化される', () => {
            const div = env.window.document.createElement('div');
            div.textContent = 'x';
            const xhtml = env.math.serializeNodeToXhtml(div);
            assert.ok(xhtml.includes('xmlns="http://www.w3.org/1999/xhtml"'), xhtml);
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

    suite('resolveKatexFontBaseUrl（フォントディレクトリのベースURL導出）', () => {
        test('katex.min.css の href と同階層の fonts/ を指す', () => {
            assert.strictEqual(
                env.math.resolveKatexFontBaseUrl('https://host/media/katex/katex.min.css'),
                'https://host/media/katex/fonts/'
            );
        });

        test('クエリ無しの webview URI でも末尾ファイル名だけを置換する', () => {
            assert.strictEqual(
                env.math.resolveKatexFontBaseUrl('vscode-webview://x/a/b/katex.min.css'),
                'vscode-webview://x/a/b/fonts/'
            );
        });

        test('スラッシュを含まない入力は fonts/ を返す', () => {
            assert.strictEqual(env.math.resolveKatexFontBaseUrl('katex.min.css'), 'fonts/');
        });

        test('末尾にクエリが付く href でもディレクトリ部分を正しく取り出す', () => {
            // asWebviewUri は通常クエリを付けないが、付いてもファイル名側に載るため
            // 最後の / までを基準にすれば fonts/ ベースは壊れない。
            assert.strictEqual(
                env.math.resolveKatexFontBaseUrl('https://host/media/katex/katex.min.css?v=1'),
                'https://host/media/katex/fonts/'
            );
        });

        test('空・未指定は空文字を返す', () => {
            assert.strictEqual(env.math.resolveKatexFontBaseUrl(''), '');
            assert.strictEqual(env.math.resolveKatexFontBaseUrl(undefined as any), '');
            assert.strictEqual(env.math.resolveKatexFontBaseUrl(null as any), '');
        });
    });

    suite('arrayBufferToBase64（woff2バイナリのbase64符号化）', () => {
        test('バイト列を base64 へ符号化する', () => {
            // "Hi" = [72, 105] → "SGk="
            const buf = new Uint8Array([72, 105]).buffer;
            assert.strictEqual(env.math.arrayBufferToBase64(buf), 'SGk=');
        });

        test('空バッファは空文字を返す', () => {
            assert.strictEqual(env.math.arrayBufferToBase64(new Uint8Array([]).buffer), '');
        });

        test('全バイト値(0–255)を含む大きめのバッファでもスタック超過せず符号化できる', () => {
            const n = 0x8000 * 2 + 5; // チャンク境界をまたぐサイズ
            const bytes = new Uint8Array(n);
            for (let i = 0; i < n; i++) {
                bytes[i] = i % 256;
            }
            const b64 = env.math.arrayBufferToBase64(bytes.buffer);
            // ラウンドトリップで一致すること（Node の Buffer でデコード）
            const decoded = Buffer.from(b64, 'base64');
            assert.strictEqual(decoded.length, n);
            assert.strictEqual(decoded[0], 0);
            assert.strictEqual(decoded[255], 255);
            assert.strictEqual(decoded[n - 1], (n - 1) % 256);
        });
    });

    suite('loadKatexFontFaceCss（フォントを fetch→base64→@font-face 化）', () => {
        // katex.min.css の link と fetch をスタブして、実描画に依存せず
        // フォント取得オーケストレーション（成功組み立て・部分失敗スキップ・キャッシュ）を検証する。
        function addKatexLink() {
            const link = env.document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('href', 'https://host/media/katex/katex.min.css');
            env.document.head.appendChild(link);
        }
        function stubFetch(handler: (url: string) => { ok: boolean; bytes?: number[] }) {
            const calls: string[] = [];
            env.window.fetch = (url: string) => {
                calls.push(url);
                const r = handler(url);
                if (!r.ok) {
                    return Promise.resolve({ ok: false, arrayBuffer: () => Promise.reject(new Error('no body')) });
                }
                return Promise.resolve({
                    ok: true,
                    arrayBuffer: () => Promise.resolve(new Uint8Array(r.bytes || [1, 2, 3]).buffer)
                });
            };
            return calls;
        }

        test('katex link が無ければ空文字を返し fetch しない', async () => {
            const calls = stubFetch(() => ({ ok: true }));
            const css = await env.math.loadKatexFontFaceCss();
            assert.strictEqual(css, '');
            assert.strictEqual(calls.length, 0);
        });

        test('全フォントを fetch→base64 化して @font-face を組み立てる', async () => {
            addKatexLink();
            const calls = stubFetch(() => ({ ok: true, bytes: [72, 105] }));
            const manifest = env.math.KATEX_FONT_MANIFEST as unknown[];
            const css = await env.math.loadKatexFontFaceCss();
            assert.strictEqual((css.match(/@font-face/g) || []).length, manifest.length);
            assert.ok(css.includes('base64,SGk=)'), css); // [72,105] = "Hi" → "SGk="
            assert.strictEqual(calls.length, manifest.length);
            // フォントは fonts/ ベースから取得している
            assert.ok(calls.every((u) => u.startsWith('https://host/media/katex/fonts/')), calls[0]);
        });

        test('全フォント取得成功時は結果をキャッシュし2回目は再 fetch しない', async () => {
            addKatexLink();
            const calls = stubFetch(() => ({ ok: true, bytes: [1] }));
            const manifest = env.math.KATEX_FONT_MANIFEST as unknown[];
            const first = await env.math.loadKatexFontFaceCss();
            const second = await env.math.loadKatexFontFaceCss();
            assert.strictEqual(first, second);
            assert.strictEqual(calls.length, manifest.length, 'キャッシュ後は再 fetch しない');
        });

        test('一部フォントの取得失敗は該当分をスキップし、部分結果はキャッシュせず次回リトライする', async () => {
            addKatexLink();
            const manifest = env.math.KATEX_FONT_MANIFEST as Array<{ file: string }>;
            const failFile = manifest[0].file;
            const calls = stubFetch((url) => ({ ok: !url.endsWith(failFile), bytes: [1] }));
            const css = await env.math.loadKatexFontFaceCss();
            // 失敗した1件を除いた数だけ @font-face が出る
            assert.strictEqual((css.match(/@font-face/g) || []).length, manifest.length - 1);
            // 部分失敗はキャッシュされないため、2回目は再度 fetch される
            await env.math.loadKatexFontFaceCss();
            assert.strictEqual(calls.length, manifest.length * 2);
        });
    });
});
