/**
 * print-css.test.ts - 印刷用スタイル（`@media print`）の静的検証
 *
 * 印刷結果は実機（VS Code 拡張機能開発ホスト）でしか目視確認できないため、
 * 自動で確かめられる範囲＝「隠す対象として書いたセレクタが実在するか」を検証する。
 * 存在しないクラス名を書いても CSS はエラーにならず**黙って何も隠さない**ので、
 * 実装時に取りこぼしても実機で印刷するまで気づけない（実際に `.mermaid-view-toggle`
 * という存在しない名前を書いてしまい、この検証で見つかった）。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const MEDIA_DIR = path.join(__dirname, '../../../media');
const SRC_DIR = path.join(__dirname, '../../../src');

/**
 * このリポジトリが**自前で書いた**ソースだけを連結して返す。
 * 同梱ライブラリ（`*.min.js`・`media/katex/`）は含めない。
 */
function readOwnSources(): string {
    const files = [
        path.join(MEDIA_DIR, 'editor.js'),
        ...fs.readdirSync(path.join(MEDIA_DIR, 'modules'))
            .filter(f => f.endsWith('.js'))
            .map(f => path.join(MEDIA_DIR, 'modules', f)),
        ...fs.readdirSync(SRC_DIR)
            .filter(f => f.endsWith('.ts'))
            .map(f => path.join(SRC_DIR, f))
    ];
    return files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
}

suite('印刷用スタイル（@media print）', () => {
    const css = fs.readFileSync(path.join(MEDIA_DIR, 'editor.css'), 'utf8');

    /**
     * `@media print { … }` の中身を**すべて**連結して返す（波括弧の対応を数える）。
     * 用紙幅用に2つ目のブロックを足したときも検証から漏れないよう、最初の1つに
     * 限定しない。
     */
    function extractPrintBlocks(source: string): string {
        let out = '';
        let from = 0;
        for (;;) {
            const start = source.indexOf('@media print', from);
            if (start === -1) { break; }
            const open = source.indexOf('{', start);
            let depth = 0;
            let end = -1;
            for (let i = open; i < source.length; i++) {
                if (source[i] === '{') { depth++; }
                if (source[i] === '}') {
                    depth--;
                    if (depth === 0) { end = i; break; }
                }
            }
            assert.notStrictEqual(end, -1, '@media print ブロックが閉じていない');
            out += source.slice(open + 1, end) + '\n';
            from = end + 1;
        }
        assert.notStrictEqual(out, '', '@media print ブロックが無い');
        return out;
    }

    const printBlock = extractPrintBlocks(css);

    /**
     * セレクタとして `sel` が現れるか（部分文字列判定だと `.toolbar` が
     * `.mermaid-toolbar` に含まれて誤合格しうるため、直前が識別子文字でないことを
     * 確かめる。宣言の書式（`,` 区切り / `{` 直結）にも依存しない）。
     */
    function hasSelector(sel: string): boolean {
        const escaped = sel.replace(/[.#*]/g, '\\$&');
        return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}\\s*[,{\\n]`).test(printBlock);
    }

    test('画面専用UIを隠す指定が入っている', () => {
        // 既定モード（WYSIWYG）で実際に見えているものを漏らさないこと。
        // `.wysiwyg-line-gutter` は既定表示なのに一度書き忘れており、
        // 「Rawモード用の .raw-line-gutter だけ隠す」状態になっていた
        const required = [
            '.toolbar',
            '.heading-breadcrumb-bar',
            '.wysiwyg-line-gutter',
            '.raw-line-gutter',
            '#rawEditor',
            '.word-count-status',
            '.find-widget',
            '.table-toolbar',
            '.table-context-menu',
            '.mermaid-context-menu',
            '.math-context-menu',
            '.slash-command-menu',
            '.link-dialog'
        ];
        for (const sel of required) {
            assert.ok(hasSelector(sel), `${sel} が @media print で扱われていない`);
        }
    });

    test('検索ハイライトを紙に出さない（outline も含めて消す）', () => {
        // .find-widget を隠しても DOM 上のハイライト span は残る。
        // outline は背景色と違い印刷設定で落ちないため明示的に消す必要がある
        assert.ok(hasSelector('.find-highlight'), '.find-highlight が扱われていない');
        assert.ok(/outline:\s*none/.test(printBlock), 'outline を消していない');
    });

    test('隠す対象として書いたクラス・idがコードベースに実在する', () => {
        // CSS内の宣言ブロックを除いたセレクタ部分だけからクラス/idを集める
        const selectorText = printBlock.replace(/\{[^}]*\}/g, ' ');
        const names = new Set<string>();
        for (const m of selectorText.matchAll(/[.#]([A-Za-z][A-Za-z0-9_-]*)/g)) {
            names.add(m[1]);
        }
        assert.ok(names.size > 0, 'セレクタが1つも取れていない（抽出のバグ）');

        // editor.css 自身は除外する（そこに書いただけの名前を「実在」と誤認しないため）。
        // 同梱ライブラリ（mermaid/highlight/html2canvas/katex）のミニファイ済み
        // コードも除外する——数MBの圧縮コードには偶然一致する断片が含まれ、
        // 存在しない名前を「実在する」と誤判定してしまうため。
        const sources = readOwnSources();

        const missing = Array.from(names).filter(name => {
            // クラス名/id が文字列リテラルやHTML属性として現れるか
            const re = new RegExp(`["'\\s.#]${name}["'\\s]`);
            return !re.test(sources);
        });
        assert.deepStrictEqual(
            missing, [],
            `@media print が参照する名前がコードベースに存在しない: ${missing.join(', ')}`
        );
    });

    test('本文の色と背景を固定するが、hljsのトークン色は触らない', () => {
        // ダークテーマのまま印刷すると「白紙に白い文字」になるため固定が要る
        assert.ok(/background-color:\s*#fff/.test(printBlock), '背景を白へ固定していない');
        assert.ok(/color:\s*#000/.test(printBlock), '本文色を黒へ固定していない');
        // 一括で color を当てるとシンタックスハイライトが潰れる
        assert.ok(!printBlock.includes('.hljs'), 'hljs のトークン色を上書きしている');
        assert.ok(
            !/^\s*\*\s*\{/m.test(printBlock),
            '全称セレクタ（*）で一括指定している（ハイライトを潰す）'
        );
    });

    test('コードブロックの背景を紙にも残す', () => {
        // ハイライト（vs2015系）は暗い背景を前提とした明るいトークン色なので、
        // 背景が印刷で落ちると白地に薄いグレーの文字になって読めなくなる
        assert.ok(hasSelector('#editor pre'), '#editor pre が扱われていない');
        assert.ok(
            /print-color-adjust:\s*exact/.test(printBlock),
            'print-color-adjust: exact でコードブロックの背景を残していない'
        );
    });

    test('ラッパーを block へ落として本文を用紙幅いっぱいにする', () => {
        // .wysiwyg-editor-wrap は flex-direction:row のため #editor の flex は
        // 「高さ」ではなく「幅」を決める。flex:none を当てると flex base size が
        // max-content になり、本文が用紙幅を超えて右端で切れる
        assert.ok(hasSelector('.wysiwyg-editor-wrap'), 'ラッパーが扱われていない');
        assert.ok(
            !/#editor\s*\{[^}]*flex:\s*none/.test(printBlock),
            '#editor に flex: none を当てている（用紙幅を超えて切れる）'
        );
    });
});
