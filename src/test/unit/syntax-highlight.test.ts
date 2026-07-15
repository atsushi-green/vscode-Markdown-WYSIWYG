/**
 * syntax-highlight.test.ts - バンドルしている highlight.min.js の言語登録を検証
 *
 * Webviewが読み込む media/highlight.min.js（highlight.js の commonビルド）を
 * jsdom上でevalし、コードブロックのハイライト対象となる主要言語が
 * 登録済みであることを保証する回帰テスト。別途 hljs-*.min.js を
 * 追加しなくても JavaScript/TypeScript/JSON/YAML/Go/Rust が使えることを固定する。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';

// out/test/unit/ から見たプロジェクトルート
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const HLJS_PATH = path.join(PROJECT_ROOT, 'media', 'highlight.min.js');

/** Webviewと同じように highlight.min.js を評価して hljs を取り出す */
function loadHljs(): any {
    const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'outside-only' });
    const window = dom.window as any;
    window.eval(fs.readFileSync(HLJS_PATH, 'utf8'));
    return window.hljs;
}

suite('SyntaxHighlight（highlight.min.js の言語登録）', () => {
    let hljs: any;

    setup(() => {
        hljs = loadHljs();
    });

    test('hljsが読み込まれ listLanguages が使える', () => {
        assert.strictEqual(typeof hljs, 'object');
        assert.ok(Array.isArray(hljs.listLanguages()), 'listLanguages配列が取得できる');
    });

    test('主要言語（JS/TS/JSON/YAML/Go/Rust）が登録されている', () => {
        const languages = ['javascript', 'typescript', 'json', 'yaml', 'go', 'rust'];
        for (const lang of languages) {
            assert.ok(hljs.getLanguage(lang), `${lang} が未登録: ${hljs.listLanguages().join(',')}`);
        }
    });

    test('よく使う別名（js/ts/yml/golang/rs）も同じ言語へ解決する', () => {
        const aliases: { [alias: string]: string } = {
            js: 'JavaScript',
            ts: 'TypeScript',
            yml: 'YAML',
            golang: 'Go',
            rs: 'Rust'
        };
        for (const alias of Object.keys(aliases)) {
            const g = hljs.getLanguage(alias);
            assert.ok(g, `${alias} が未解決`);
            assert.strictEqual(g.name, aliases[alias]);
        }
    });

    test('指定言語でハイライトすると hljs-* スパンが生成される', () => {
        const result = hljs.highlight('const x: number = 1;', { language: 'typescript' });
        assert.ok(/class="hljs-/.test(result.value), result.value);
    });
});
