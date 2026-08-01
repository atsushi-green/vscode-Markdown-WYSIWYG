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
    function extractPrintBlocks(rawSource: string): string {
        // **波括弧を数える前に**コメントを取り除く。方針を説明するコメントに
        // `@page { margin: 0 }` のような例示コードを書くと、そこに含まれる波括弧で
        // 対応が狂ってブロックが途中で切れる／別ブロックを飲み込む。あわせて、
        // 「使わないと書いた宣言」がコメント中にあっても誤検出しなくなる。
        const source = rawSource.replace(/\/\*[\s\S]*?\*\//g, ' ');
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
     * セレクタとして `sel` が `@media print` 内のどこかに現れるか
     * （直前が識別子文字でないことを確かめ、`.toolbar` が `.mermaid-toolbar` に
     * 含まれて誤合格するのを防ぐ）。**どのルールに入っているかは問わない**ので、
     * 宣言との対応まで見たい場合は `ruleHas` を使う。
     */
    function hasSelector(sel: string): boolean {
        const escaped = sel.replace(/[.#*]/g, '\\$&');
        return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}\\s*[,{\\n]`).test(printBlock);
    }

    /**
     * `@media print` 内の全ルールを `[セレクタ, 宣言]` の組で返す。
     * ネストしていない単純なルール（`セレクタ { 宣言 }`）だけを対象にする。
     */
    function printRules(): Array<[string, string]> {
        const rules: Array<[string, string]> = [];
        for (const m of printBlock.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            rules.push([m[1], m[2]]);
        }
        return rules;
    }

    /**
     * `sel` が `decl` を宣言しているルールに含まれているか。
     *
     * ブロック全体を対象にした素朴な文字列検索では、同じセレクタが別のルールにも
     * 現れる場合（`#editor pre` は折り返し・背景の両方に出る）に「そのルールに
     * 入っている」ことを何も保証できないため、**ルール単位**で突き合わせる。
     */
    function ruleHas(sel: string, decl: string): boolean {
        const escaped = sel.replace(/[.#*]/g, '\\$&');
        const selRe = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}\\s*(,|$)`, 'm');
        const declRe = new RegExp(decl);
        return printRules().some(
            ([selectors, decls]) => selRe.test(selectors.trim()) && declRe.test(decls)
        );
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

    test('ページ境界で分断したくない要素に break-inside: avoid を当てている', () => {
        // 紙ではスクロールできないため、まとまりで読む要素が2ページにまたがると
        // 極端に読みにくくなる。**そのセレクタが break-inside ルールに入っているか**を
        // ルール単位で見る（ブロック全体の検索だと、別ルールに同じセレクタがあるだけで
        // 通ってしまい何も保証できない）
        for (const sel of [
            '#editor pre', '#editor table', '#editor blockquote',
            '#editor img', '#editor .math-block', '.mermaid-container'
        ]) {
            assert.ok(
                ruleHas(sel, 'break-inside:\\s*avoid'),
                `${sel} が break-inside: avoid のルールに入っていない`
            );
        }
        // 古い実装向けの別名も併記しているか（Chromiumは両方を解釈する）
        assert.ok(
            ruleHas('#editor table', 'page-break-inside:\\s*avoid'),
            '旧仕様の page-break-inside を併記していない'
        );
    });

    test('見出しがページ末尾に取り残されないようにしている', () => {
        assert.ok(
            ruleHas('#editor h1', 'break-after:\\s*avoid'),
            '見出しが break-after: avoid のルールに入っていない'
        );
    });

    test('用紙余白（@page）を指定している', () => {
        assert.ok(/@page\s*\{[^}]*margin:/.test(printBlock), '@page の margin 指定が無い');
    });

    test('用紙幅からはみ出す要素を折り返す', () => {
        // 画面では横スクロールで見られるが紙では切れてしまう
        assert.ok(
            ruleHas('#editor pre', 'white-space:\\s*pre-wrap'),
            'コードブロックを折り返していない'
        );
        assert.ok(
            ruleHas('#editor pre', 'overflow:\\s*visible'),
            'コードブロックの横スクロールを解除していない'
        );
        // `anywhere` は `break-word` と違い min-content 幅も縮むため、
        // 長いURL等を含む列が実際に狭くなる
        assert.ok(
            ruleHas('#editor td', 'overflow-wrap:\\s*anywhere'),
            '表セルの折り返し指定が無い'
        );
        // 列幅を均等にしてしまう table-layout: fixed は使わない方針
        assert.ok(
            !/table-layout:\s*fixed/.test(printBlock),
            'table-layout: fixed を使っている（元の列幅の見た目から離れる）'
        );
    });

    test('表のスクロールコンテナと min-width を解除して用紙内に収める', () => {
        // 紙にはスクロールバーが無いため、.table-wrapper(overflow:auto) /
        // .table-container(overflow:hidden) のままだと、はみ出した列が
        // **無音でクリップされて印刷結果から消える**
        assert.ok(
            ruleHas('.table-wrapper', 'overflow:\\s*visible'),
            '.table-wrapper の横スクロールを解除していない'
        );
        assert.ok(
            ruleHas('.table-container', 'overflow:\\s*visible'),
            '.table-container の overflow:hidden を解除していない'
        );
        // セル幅の下限が残っていると列数の多い表は縮まない
        assert.ok(
            ruleHas('#editor td', 'min-width:\\s*0'),
            'セル幅の下限（min-width:100px）を解除していない'
        );
    });

    test('Mermaid図の背景を紙にも残す（ダークテーマ対策）', () => {
        // resolveTheme() がVS Codeのテーマに追随するため、ダークテーマでは
        // 明るい色の線・文字のSVGになる。白背景に出すと「白紙に白い図」になる
        assert.ok(hasSelector('.mermaid-container'), '.mermaid-container が扱われていない');
        const mermaidRule = /\.mermaid-container\s*\{[^}]*\}/g;
        const rules = printBlock.match(mermaidRule) || [];
        assert.ok(
            rules.some(r => /print-color-adjust:\s*exact/.test(r)),
            'Mermaidコンテナの背景を print-color-adjust: exact で残していない'
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

suite('ツールバーの非表示（body.toolbar-hidden）', () => {
    const css = fs.readFileSync(path.join(MEDIA_DIR, 'editor.css'), 'utf8');

    test('body のクラスで .toolbar を隠すルールがある', () => {
        // `.toolbar` へインラインスタイルを書くと、印刷用スタイル（@media print も
        // .toolbar を隠す）とカスケードで competing する。body のクラスで切り替える
        assert.ok(
            /body\.toolbar-hidden\s+\.toolbar\s*\{[^}]*display:\s*none/.test(css),
            'body.toolbar-hidden .toolbar の非表示ルールが無い'
        );
    });

    test('印刷時のツールバー非表示ルールは残っている（回帰確認）', () => {
        // 設定で表示していても印刷には出さない、という既存の挙動を壊さない。
        // `@media print` ブロックの中だけを見る——ファイル末尾まで含めた部分文字列
        // 一致だと、以降に `.toolbar-*` のような別セレクタがあるだけで通ってしまう
        const start = css.indexOf('@media print');
        assert.notStrictEqual(start, -1, '@media print ブロックが無い');
        const open = css.indexOf('{', start);
        let depth = 0;
        let end = -1;
        for (let i = open; i < css.length; i++) {
            if (css[i] === '{') { depth++; }
            if (css[i] === '}') {
                depth--;
                if (depth === 0) { end = i; break; }
            }
        }
        assert.notStrictEqual(end, -1, '@media print ブロックが閉じていない');
        const block = css.slice(open + 1, end);
        assert.ok(
            /(^|[^A-Za-z0-9_-])\.toolbar\s*[,{]/.test(block),
            '@media print からツールバーの非表示が消えている'
        );
    });
});
