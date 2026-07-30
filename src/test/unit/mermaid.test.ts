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

    suite('resolveExportTheme（画像化に使うMermaidテーマの解決）', () => {
        test("明るい背景（'white'/'transparent'）はライトテーマ 'default' で書き出す", () => {
            assert.strictEqual(env.mermaid.resolveExportTheme('white'), 'default');
            assert.strictEqual(env.mermaid.resolveExportTheme('transparent'), 'default');
        });

        test("'black' はダークテーマ 'dark' で書き出す", () => {
            assert.strictEqual(env.mermaid.resolveExportTheme('black'), 'dark');
        });

        test("未指定・未知の値は 'default'（白背景のフォールバックと整合）", () => {
            assert.strictEqual(env.mermaid.resolveExportTheme(undefined), 'default');
            assert.strictEqual(env.mermaid.resolveExportTheme('rainbow'), 'default');
        });
    });

    suite('resolveMenuBackground（メニューの背景選択の解決）', () => {
        function buildMenu(activeBg?: string): HTMLElement {
            const menu = env.state.mermaidContextMenu as HTMLElement;
            const cls = (bg: string) => 'mermaid-bg-btn' + (activeBg === bg ? ' active' : '');
            menu.innerHTML =
                `<div class="mermaid-menu-bg-row">` +
                `<button class="${cls('transparent')}" data-bg="transparent">透過</button>` +
                `<button class="${cls('white')}" data-bg="white">白</button>` +
                `<button class="${cls('black')}" data-bg="black">黒</button>` +
                `</div>` +
                `<div class="mermaid-menu-item" data-action="copyImage">copy</div>` +
                `<div class="mermaid-menu-item" data-action="savePng">save</div>`;
            return menu;
        }

        test('active な data-bg（transparent/white/black）を返す', () => {
            assert.strictEqual(env.mermaid.resolveMenuBackground(buildMenu('transparent')), 'transparent');
            assert.strictEqual(env.mermaid.resolveMenuBackground(buildMenu('white')), 'white');
            assert.strictEqual(env.mermaid.resolveMenuBackground(buildMenu('black')), 'black');
        });

        test('active が無ければ白（従来動作）へフォールバックする', () => {
            assert.strictEqual(env.mermaid.resolveMenuBackground(buildMenu()), 'white');
        });

        test('不正な data-bg は白へフォールバックする', () => {
            const menu = env.state.mermaidContextMenu as HTMLElement;
            menu.innerHTML = '<button class="mermaid-bg-btn active" data-bg="rainbow">x</button>';
            assert.strictEqual(env.mermaid.resolveMenuBackground(menu), 'white');
        });

        test('null・非要素は白を返す（防御）', () => {
            assert.strictEqual(env.mermaid.resolveMenuBackground(null), 'white');
            assert.strictEqual(env.mermaid.resolveMenuBackground(undefined), 'white');
            assert.strictEqual(env.mermaid.resolveMenuBackground({} as any), 'white');
        });
    });

    suite('setupContextMenuEvents（背景トグルの配線）', () => {
        test('背景ボタンのクリックで active が1つだけ移り、resolveMenuBackground に反映される', () => {
            const menu = env.state.mermaidContextMenu as HTMLElement;
            menu.innerHTML =
                `<div class="mermaid-menu-bg-row">` +
                `<button class="mermaid-bg-btn" data-bg="transparent">透過</button>` +
                `<button class="mermaid-bg-btn active" data-bg="white">白</button>` +
                `<button class="mermaid-bg-btn" data-bg="black">黒</button>` +
                `</div>`;
            env.mermaid.setupContextMenuEvents();

            // 初期は白
            assert.strictEqual(env.mermaid.resolveMenuBackground(menu), 'white');

            const blackBtn = menu.querySelector('[data-bg="black"]') as HTMLElement;
            blackBtn.click();

            assert.strictEqual(menu.querySelectorAll('.mermaid-bg-btn.active').length, 1, 'active は1つだけ');
            assert.ok(blackBtn.classList.contains('active'), '黒が active になる');
            assert.strictEqual(env.mermaid.resolveMenuBackground(menu), 'black');

            const transparentBtn = menu.querySelector('[data-bg="transparent"]') as HTMLElement;
            transparentBtn.click();
            assert.strictEqual(env.mermaid.resolveMenuBackground(menu), 'transparent');
            assert.strictEqual(menu.querySelectorAll('.mermaid-bg-btn.active').length, 1, 'active は依然1つ');
        });
    });
});

suite('render の直列化（印刷前の待ち合わせが効くこと）', () => {
    let env: EditorEnv;

    setup(() => {
        env = createEditorEnv();
    });

    /**
     * Mermaid本体を偽物に差し替える。`render` は手動で解決できる Promise を返し、
     * 「描画中にもう一度 render() が呼ばれる」状況を再現する。
     */
    function stubMermaid() {
        const pending: Array<() => void> = [];
        (env.window as any).mermaid = {
            initialize: () => { /* no-op */ },
            render: () => new Promise(resolve => {
                pending.push(() => resolve({ svg: '<svg></svg>' }));
            })
        };
        return pending;
    }

    test('描画中に呼ばれた render() は、進行中の描画の完了まで解決しない', async () => {
        const pending = stubMermaid();
        env.editor.innerHTML =
            '<pre><code data-lang="mermaid">graph TD; A-->B;</code></pre>';

        /** マイクロタスクを n 回流す（チェーン＋async のホップ分だけ進める） */
        const flush = async (n: number) => {
            for (let i = 0; i < n; i++) { await Promise.resolve(); }
        };

        // 1回目（進行中のまま止まる）
        const first = env.mermaid.render();
        await flush(20);
        assert.strictEqual(pending.length, 1, '1回目の描画が始まっていない');

        // 2回目。`renderPending` 単体だと「コンテナがある」のでスキップして
        // 即解決してしまい、SVGが空のまま印刷される原因になる
        let secondDone = false;
        const second = env.mermaid.render().then(() => { secondDone = true; });
        await flush(30);
        assert.strictEqual(secondDone, false, '進行中の描画を待たずに解決している');

        // 1回目を完了させると両方解決する
        pending[0]();
        await first;
        await second;
        assert.strictEqual(secondDone, true);
    });

    test('描画が失敗しても後続の render() は解決する', async () => {
        (env.window as any).mermaid = {
            initialize: () => { /* no-op */ },
            render: () => Promise.reject(new Error('boom'))
        };
        env.editor.innerHTML =
            '<pre><code data-lang="mermaid">graph TD; A-->B;</code></pre>';
        await env.mermaid.render();
        await env.mermaid.render();
    });
});
