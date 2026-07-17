/**
 * markdown.test.ts - MarkdownModule（Markdown⇔HTML変換）のユニットテスト
 */
import * as assert from 'assert';
import { createEditorEnv, EditorEnv } from './helper';

suite('MarkdownModule', () => {
    let env: EditorEnv;

    setup(() => {
        env = createEditorEnv();
    });

    suite('markdownToHtml', () => {
        test('見出し（h1〜h6）をheading-hashスパン付き・idアンカー付きで変換する', () => {
            const html = env.markdown.markdownToHtml('# タイトル');
            assert.strictEqual(
                html,
                '<h1 id="タイトル"><span class="heading-hash"># </span>タイトル</h1>'
            );

            const html3 = env.markdown.markdownToHtml('### 小見出し');
            assert.strictEqual(
                html3,
                '<h3 id="小見出し"><span class="heading-hash">### </span>小見出し</h3>'
            );
        });

        test('インライン記法（太字・斜体・下線・コード・リンク）を変換する', () => {
            const html = env.markdown.markdownToHtml(
                '**太字** *斜体* ++下線++ `code` [リンク](https://example.com)'
            );
            assert.ok(html.includes('<strong>太字</strong>'), `strong: ${html}`);
            assert.ok(html.includes('<em>斜体</em>'), `em: ${html}`);
            assert.ok(html.includes('<u>下線</u>'), `u: ${html}`);
            assert.ok(html.includes('<code>code</code>'), `code: ${html}`);
            assert.ok(html.includes('<a href="https://example.com">リンク</a>'), `a: ${html}`);
        });

        test('インラインコード内の記法は装飾せずそのまま保持する', () => {
            assert.strictEqual(
                env.markdown.markdownToHtml('`**太字**`'),
                '<p><code>**太字**</code></p>'
            );
            assert.strictEqual(
                env.markdown.markdownToHtml('`~~消~~`'),
                '<p><code>~~消~~</code></p>'
            );
            assert.strictEqual(
                env.markdown.markdownToHtml('`[text](url)`'),
                '<p><code>[text](url)</code></p>'
            );
            assert.strictEqual(
                env.markdown.markdownToHtml('`a_b_c`'),
                '<p><code>a_b_c</code></p>'
            );
        });

        test('インラインコードの外側の記法は通常どおり装飾する', () => {
            const html = env.markdown.markdownToHtml('前 `**x**` 後 **太字**');
            assert.strictEqual(
                html,
                '<p>前 <code>**x**</code> 後 <strong>太字</strong></p>'
            );
        });

        test('インラインコード内の記法はWYSIWYG往復で失われない', () => {
            ['`**太字**`', '文中の `[a](b)` と **強調**', '`~~x~~` と `code2`'].forEach(src => {
                const rt = env.markdown.htmlToMarkdown(
                    env.markdown.markdownToHtml(src)
                );
                assert.strictEqual(rt.trim(), src, `roundtrip: ${src}`);
            });
        });

        test('太字斜体（***text***）を変換する', () => {
            const html = env.markdown.markdownToHtml('***強調***');
            assert.ok(html.includes('<strong><em>強調</em></strong>'), html);
        });

        test('取り消し線（~~text~~）をdelに変換する', () => {
            const html = env.markdown.markdownToHtml('前 ~~取り消し~~ 後');
            assert.ok(html.includes('<del>取り消し</del>'), html);
        });

        test('連続行は1つの段落にまとめ、行間は<br>にする', () => {
            const html = env.markdown.markdownToHtml('1行目\n2行目');
            assert.strictEqual(html, '<p>1行目<br>2行目</p>');
        });

        test('空行で段落を分割する', () => {
            const html = env.markdown.markdownToHtml('段落1\n\n段落2');
            assert.strictEqual(html, '<p>段落1</p><p>段落2</p>');
        });

        test('言語指定付きコードフェンスをpre/codeに変換する', () => {
            const html = env.markdown.markdownToHtml('```python\nprint("hello")\n```');
            assert.strictEqual(
                html,
                '<pre><code class="language-python" data-lang="python">print("hello")\n</code></pre>'
            );
        });

        test('コードブロック内のHTML特殊文字をエスケープし、Markdown記法は変換しない', () => {
            const html = env.markdown.markdownToHtml('```\n<div> & **not bold**\n```');
            assert.ok(html.includes('&lt;div&gt; &amp; **not bold**'), html);
            assert.ok(!html.includes('<strong>'), html);
        });

        test('閉じフェンスがなくても終端まで読み込んでクラッシュしない', () => {
            const html = env.markdown.markdownToHtml('```js\nconst a = 1;');
            assert.ok(html.includes('const a = 1;'), html);
            assert.ok(html.startsWith('<pre><code'), html);
        });

        test('箇条書きリスト（ネスト対応）を変換する', () => {
            const html = env.markdown.markdownToHtml('- 項目1\n  - ネスト\n- 項目2');
            assert.strictEqual(
                html,
                '<ul><li>項目1<ul><li>ネスト</li></ul></li><li>項目2</li></ul>'
            );
        });

        test('番号付きリストをolに変換する', () => {
            const html = env.markdown.markdownToHtml('1. 一\n2. 二');
            assert.strictEqual(html, '<ol><li>一</li><li>二</li></ol>');
        });

        test('タスクリスト（- [ ] / - [x]）をチェックボックス付きliに変換する', () => {
            const html = env.markdown.markdownToHtml('- [ ] 未完了\n- [x] 完了');
            assert.ok(html.includes('<li class="task-list-item">'), html);
            assert.ok(
                html.includes('<input type="checkbox" class="task-checkbox" contenteditable="false"> 未完了'),
                html
            );
            assert.ok(
                html.includes('<input type="checkbox" class="task-checkbox" contenteditable="false" checked> 完了'),
                html
            );
        });

        test('大文字X（- [X]）もチェック済みとして扱う', () => {
            const html = env.markdown.markdownToHtml('- [X] 完了');
            assert.ok(html.includes(' checked> 完了'), html);
        });

        test('タスクリストと通常リストの混在・ネストを変換する', () => {
            const html = env.markdown.markdownToHtml('- [ ] 親タスク\n  - 通常ネスト\n- 通常項目');
            assert.ok(html.includes('<li class="task-list-item">'), html);
            assert.ok(html.includes('<ul><li>通常ネスト</li></ul>'), html);
            assert.ok(html.includes('<li>通常項目</li>'), html);
        });

        test('タスク記法でない角括弧（リンク等）はチェックボックスにしない', () => {
            const html = env.markdown.markdownToHtml('- [リンク](https://example.com)');
            assert.ok(!html.includes('checkbox'), html);
            assert.ok(html.includes('<a href="https://example.com">リンク</a>'), html);
        });

        test('引用ブロック（複数行）を変換する', () => {
            const html = env.markdown.markdownToHtml('> 引用1\n> 引用2');
            assert.strictEqual(html, '<blockquote>引用1<br>引用2</blockquote>');
        });

        test('ネストした引用（> >）を入れ子のblockquoteに変換する', () => {
            const html = env.markdown.markdownToHtml('> 引用1\n> > ネスト\n> 引用2');
            assert.strictEqual(
                html,
                '<blockquote>引用1<blockquote>ネスト</blockquote>引用2</blockquote>'
            );
        });

        test('スペースなしのネスト引用（>>）も1階層深い引用として扱う', () => {
            const html = env.markdown.markdownToHtml('> 外側\n>> 内側');
            assert.strictEqual(
                html,
                '<blockquote>外側<blockquote>内側</blockquote></blockquote>'
            );
        });

        test('2階層以上飛んだネスト引用も安全に処理する', () => {
            const html = env.markdown.markdownToHtml('> 外側\n> > > 深い');
            assert.strictEqual(
                html,
                '<blockquote>外側<blockquote><blockquote>深い</blockquote></blockquote></blockquote>'
            );
        });

        test('GitHubアラート（> [!NOTE]）をアラートdivに変換する', () => {
            const html = env.markdown.markdownToHtml('> [!NOTE]\n> 補足です');
            assert.strictEqual(
                html,
                '<div class="markdown-alert markdown-alert-note" data-alert-type="NOTE">' +
                '<p class="markdown-alert-title" contenteditable="false">Note</p>' +
                '<div class="markdown-alert-body">補足です</div></div>'
            );
        });

        test('5種類のアラートタイプすべてを認識する', () => {
            const cases: [string, string, string][] = [
                ['NOTE', 'note', 'Note'],
                ['TIP', 'tip', 'Tip'],
                ['IMPORTANT', 'important', 'Important'],
                ['WARNING', 'warning', 'Warning'],
                ['CAUTION', 'caution', 'Caution']
            ];
            cases.forEach(([type, cls, title]) => {
                const html = env.markdown.markdownToHtml(`> [!${type}]\n> 本文`);
                assert.ok(html.includes(`markdown-alert-${cls}`), html);
                assert.ok(html.includes(`data-alert-type="${type}"`), html);
                assert.ok(html.includes(`>${title}</p>`), html);
            });
        });

        test('複数行の本文は<br>で連結する', () => {
            const html = env.markdown.markdownToHtml('> [!WARNING]\n> 注意1\n> 注意2');
            assert.ok(html.includes('<div class="markdown-alert-body">注意1<br>注意2</div>'), html);
        });

        test('本文なしのアラートも変換できる', () => {
            const html = env.markdown.markdownToHtml('> [!TIP]');
            assert.ok(html.includes('markdown-alert-tip'), html);
            assert.ok(html.includes('<div class="markdown-alert-body"></div>'), html);
        });

        test('小文字マーカーやマーカー以外を含む行は通常の引用にする', () => {
            assert.strictEqual(
                env.markdown.markdownToHtml('> [!note] 小文字'),
                '<blockquote>[!note] 小文字</blockquote>'
            );
            assert.strictEqual(
                env.markdown.markdownToHtml('> [!IMPORTANT] 余分なテキスト'),
                '<blockquote>[!IMPORTANT] 余分なテキスト</blockquote>'
            );
        });

        test('アラート本文のインライン記法（太字・リンク）を変換する', () => {
            const html = env.markdown.markdownToHtml('> [!NOTE]\n> **重要** な [リンク](https://example.com)');
            assert.ok(html.includes('<strong>重要</strong>'), html);
            assert.ok(html.includes('<a href="https://example.com">リンク</a>'), html);
        });

        test('テーブルをthead/tbody付きで変換する', () => {
            const md = '| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |';
            const html = env.markdown.markdownToHtml(md);
            assert.ok(html.startsWith('<table><thead><tr><th>列A</th><th>列B</th></tr></thead>'), html);
            assert.ok(html.includes('<tbody><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></tbody>'), html);
        });

        test('テーブルの空セルを保持する（列ずれ防止）', () => {
            const md = '| A | B | C |\n| --- | --- | --- |\n| 1 |  | 3 |';
            const html = env.markdown.markdownToHtml(md);
            assert.ok(html.includes('<tr><td>1</td><td></td><td>3</td></tr>'), html);
        });

        test('エスケープされたパイプ（\\|）をセル内文字として扱う', () => {
            const md = '| A |\n| --- |\n| a\\|b |';
            const html = env.markdown.markdownToHtml(md);
            assert.ok(html.includes('<td>a|b</td>'), html);
        });

        test('水平線（--- / *** / ___）をhrに変換する', () => {
            assert.strictEqual(env.markdown.markdownToHtml('---'), '<hr>');
            assert.strictEqual(env.markdown.markdownToHtml('***'), '<hr>');
            assert.strictEqual(env.markdown.markdownToHtml('___'), '<hr>');
            assert.strictEqual(env.markdown.markdownToHtml('-----'), '<hr>');
        });

        test('2文字以下の --- もどきは水平線にしない', () => {
            const html = env.markdown.markdownToHtml('--');
            assert.strictEqual(html, '<p>--</p>');
        });

        test('段落の直後の水平線で段落を区切る', () => {
            const html = env.markdown.markdownToHtml('段落\n---\n次の段落');
            assert.strictEqual(html, '<p>段落</p><hr><p>次の段落</p>');
        });

        test('本文のHTML特殊文字をエスケープする（XSS防止）', () => {
            const html = env.markdown.markdownToHtml('<script>alert(1)</script>');
            assert.ok(!html.includes('<script>'), html);
            assert.ok(html.includes('&lt;script&gt;'), html);
        });

        test('CRLF改行を正規化して処理する', () => {
            const html = env.markdown.markdownToHtml('# 見出し\r\n\r\n段落');
            assert.ok(html.includes('</h1><p>段落</p>'), html);
        });

        test('ゼロ幅文字を除去する', () => {
            const html = env.markdown.markdownToHtml(`abc${env.state.ZERO_WIDTH}def`);
            assert.strictEqual(html, '<p>abcdef</p>');
        });
    });

    suite('htmlToMarkdown', () => {
        test('見出しをheading-hashスパンを除いてシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<h2><span class="heading-hash">## </span>見出し</h2>'
            );
            assert.strictEqual(md, '## 見出し\n');
        });

        test('インライン装飾をシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<p><strong>太字</strong> <em>斜体</em> <u>下線</u> <code>c</code> <a href="https://example.com">リンク</a></p>'
            );
            assert.strictEqual(md, '**太字** *斜体* ++下線++ `c` [リンク](https://example.com)\n');
        });

        test('取り消し線（del/s/strike）を~~でシリアライズする', () => {
            assert.strictEqual(env.markdown.htmlToMarkdown('<p><del>a</del></p>'), '~~a~~\n');
            assert.strictEqual(env.markdown.htmlToMarkdown('<p><s>b</s></p>'), '~~b~~\n');
            assert.strictEqual(env.markdown.htmlToMarkdown('<p><strike>c</strike></p>'), '~~c~~\n');
        });

        test('ネストしたリストを2スペースインデントでシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<ul><li>項目1<ul><li>ネスト</li></ul></li><li>項目2</li></ul>'
            );
            assert.strictEqual(md, '* 項目1\n  * ネスト\n* 項目2\n');
        });

        test('番号付きリストを連番でシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown('<ol><li>一</li><li>二</li></ol>');
            assert.strictEqual(md, '1. 一\n2. 二\n');
        });

        test('タスクリストのチェックボックスを[ ]/[x]でシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<ul>' +
                '<li class="task-list-item"><input type="checkbox" class="task-checkbox"> 未完了</li>' +
                '<li class="task-list-item"><input type="checkbox" class="task-checkbox" checked> 完了</li>' +
                '</ul>'
            );
            assert.strictEqual(md, '* [ ] 未完了\n* [x] 完了\n');
        });

        test('チェック状態はchecked属性から判定する（クリック後の状態を反映）', () => {
            // change ハンドラが属性を付与した後のDOMを模擬
            const md = env.markdown.htmlToMarkdown(
                '<ul><li class="task-list-item">' +
                '<input type="checkbox" class="task-checkbox" checked=""> タスク</li></ul>'
            );
            assert.strictEqual(md, '* [x] タスク\n');
        });

        test('コードブロックを言語付きフェンスでシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<pre><code class="language-python" data-lang="python">print(1)\n</code></pre>'
            );
            assert.strictEqual(md, '```python\nprint(1)\n```\n');
        });

        test('highlight.jsの装飾スパンが入ったコードブロックもテキストとして剥がす', () => {
            const md = env.markdown.htmlToMarkdown(
                '<pre><code data-lang="python"><span class="hljs-keyword">def</span> f():\n</code></pre>'
            );
            assert.strictEqual(md, '```python\ndef f():\n```\n');
        });

        test('引用ブロックをシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown('<blockquote>引用1<br>引用2</blockquote>');
            assert.strictEqual(md, '> 引用1\n> 引用2\n');
        });

        test('ネストしたblockquoteを> > 形式でシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<blockquote>引用1<blockquote>ネスト</blockquote>引用2</blockquote>'
            );
            assert.strictEqual(md, '> 引用1\n> > ネスト\n> 引用2\n');
        });

        test('空のblockquoteは出力しない', () => {
            const md = env.markdown.htmlToMarkdown('<blockquote></blockquote>');
            assert.strictEqual(md, '');
        });

        test('アラートdivを > [!TYPE] 形式へシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<div class="markdown-alert markdown-alert-note" data-alert-type="NOTE">' +
                '<p class="markdown-alert-title" contenteditable="false">Note</p>' +
                '<div class="markdown-alert-body">補足1<br>補足2</div></div>'
            );
            assert.strictEqual(md, '> [!NOTE]\n> 補足1\n> 補足2\n');
        });

        test('本文なしのアラートは > [!TYPE] のみへシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<div class="markdown-alert markdown-alert-tip" data-alert-type="TIP">' +
                '<p class="markdown-alert-title" contenteditable="false">Tip</p>' +
                '<div class="markdown-alert-body"></div></div>'
            );
            assert.strictEqual(md, '> [!TIP]\n');
        });

        test('テーブルをセル内装飾を保持してシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<table><thead><tr><th>列A</th><th>列B</th></tr></thead>' +
                '<tbody><tr><td><strong>a1</strong></td><td>b1</td></tr></tbody></table>'
            );
            assert.strictEqual(
                md,
                '| 列A | 列B |\n| --- | --- |\n| **a1** | b1 |\n'
            );
        });

        test('セル内のパイプ文字をエスケープする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<table><thead><tr><th>A</th></tr></thead>' +
                '<tbody><tr><td>a|b</td></tr></tbody></table>'
            );
            assert.ok(md.includes('| a\\|b |'), md);
        });

        test('hr要素を---でシリアライズする', () => {
            const md = env.markdown.htmlToMarkdown('<p>前</p><hr><p>後</p>');
            assert.strictEqual(md, '前\n\n---\n\n後\n');
        });

        test('contenteditableが生成する行単位のdivを1行として扱う', () => {
            const md = env.markdown.htmlToMarkdown('<div>1行目</div><div>2行目</div>');
            assert.strictEqual(md, '1行目\n2行目\n');
        });

        test('空のHTMLは空文字を返す', () => {
            assert.strictEqual(env.markdown.htmlToMarkdown(''), '');
            assert.strictEqual(env.markdown.htmlToMarkdown('<p><br></p>'), '');
        });

        test('ノーブレークスペースを通常スペースに変換する', () => {
            const md = env.markdown.htmlToMarkdown('<p>a b</p>');
            assert.strictEqual(md, 'a b\n');
        });
    });

    suite('数式（インライン $...$ / ブロック $$...$$）', () => {
        /** 数式コンテナの data-math（＝保持している生の式）を返す */
        function mathOf(html: string, selector: string): string | null {
            const div = env.document.createElement('div');
            div.innerHTML = html;
            return div.querySelector(selector)?.getAttribute('data-math') ?? null;
        }

        test('インライン数式が data-math に生の式を保持したspanになる', () => {
            const html = env.markdown.markdownToHtml('文中の $\\alpha + \\beta$ です');
            assert.strictEqual(mathOf(html, '.math-inline'), '\\alpha + \\beta', html);
        });

        test('インライン数式の中身は強調・斜体へ変換されない', () => {
            // 退避しないと `^*` の `*` が <em> に、`a_1` の `_` が強調に化ける
            const html = env.markdown.markdownToHtml('$\\alpha^*$ と $a_1 + b_2$');
            assert.ok(!/<em>|<strong>/.test(html), html);
            assert.strictEqual(mathOf(html, '.math-inline'), '\\alpha^*', html);
        });

        test('ブロック数式（複数行）が data-math を持つdivになる', () => {
            const html = env.markdown.markdownToHtml('$$\nx = \\frac{1}{2}\n$$');
            assert.strictEqual(mathOf(html, '.math-block'), 'x = \\frac{1}{2}', html);
        });

        test('1行で書いたブロック数式（$$ x $$）も対応する', () => {
            const html = env.markdown.markdownToHtml('$$ x^2 $$');
            assert.strictEqual(mathOf(html, '.math-block'), 'x^2', html);
        });

        test('数式コンテナは contenteditable=false（KaTeXの生成DOMを編集で壊さない）', () => {
            const html = env.markdown.markdownToHtml('$x$\n\n$$y$$');
            assert.ok(/<span class="math-inline"[^>]*contenteditable="false"/.test(html), html);
            assert.ok(/<div class="math-block"[^>]*contenteditable="false"/.test(html), html);
        });

        test('インラインコード内の $ は数式にならない', () => {
            const html = env.markdown.markdownToHtml('`$x$` はコード');
            assert.strictEqual(html.includes('math-inline'), false, html);
            assert.ok(html.includes('<code>$x$</code>'), html);
        });

        test('エスケープした \\$ は数式にならずリテラルの $ になる', () => {
            const html = env.markdown.markdownToHtml('価格は \\$100 と \\$200 です');
            assert.strictEqual(html.includes('math-inline'), false, html);
            assert.ok(html.includes('価格は $100 と $200 です'), html);
        });

        test('式に含まれるダブルクォートが属性を壊さない', () => {
            const html = env.markdown.markdownToHtml('$\\text{"x"}$');
            assert.strictEqual(mathOf(html, '.math-inline'), '\\text{"x"}', html);
        });

        test('式に含まれる < や & が生の文字として復元される', () => {
            const html = env.markdown.markdownToHtml('$a < b \\& c$');
            assert.strictEqual(mathOf(html, '.math-inline'), 'a < b \\& c', html);
        });

        test('インライン数式が往復で保存される', () => {
            const md = '文中の $\\alpha^2$ です';
            const back = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(md)).trim();
            assert.strictEqual(back, md);
        });

        test('ブロック数式が往復で保存される', () => {
            const md = '$$\nx = \\frac{1}{2}\n$$';
            const back = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(md)).trim();
            assert.strictEqual(back, md);
        });

        test('エスケープした \\$ が往復で保存される', () => {
            const md = '価格は \\$100 です';
            const back = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(md)).trim();
            assert.strictEqual(back, md);
        });

        test('テキスト中の素の $ は往復で \\$ へエスケープされる（次回読込で数式化しない）', () => {
            // 単独の $ は数式にならない（対になっていない）が、書き戻すときに
            // エスケープしておかないと後続の $ と対になって数式に化けうる
            const html = env.markdown.markdownToHtml('残高 \\$5');
            const back = env.markdown.htmlToMarkdown(html).trim();
            assert.strictEqual(back, '残高 \\$5');
        });

        test('コードブロック内の $ はエスケープされない', () => {
            const md = '```bash\necho $HOME\n```';
            const back = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(md)).trim();
            assert.strictEqual(back, md);
        });

        test('インラインコード内の $ はエスケープされない', () => {
            const md = '`$HOME` を参照';
            const back = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(md)).trim();
            assert.strictEqual(back, md);
        });
    });

    suite('ラウンドトリップ（Markdown → HTML → Markdown）', () => {
        test('各種ブロックを含む文書が変換往復で保存される', () => {
            const original = [
                '# 見出し1',
                '',
                '## 見出し2',
                '',
                '段落テキスト **太字** *斜体* ++下線++ ~~取り消し~~ `コード` [リンク](https://example.com)',
                '',
                '* 項目1',
                '* 項目2',
                '  * ネスト項目',
                '',
                '* [ ] 未完了タスク',
                '* [x] 完了タスク',
                '',
                '1. 番号1',
                '2. 番号2',
                '',
                '> 引用行1',
                '> 引用行2',
                '> > ネスト引用',
                '',
                '---',
                '',
                '```python',
                'print("hello")',
                '```',
                '',
                '| 列A | 列B |',
                '| --- | --- |',
                '| a1 | b1 |',
                ''
            ].join('\n');

            const html = env.markdown.markdownToHtml(original);
            const roundTripped = env.markdown.htmlToMarkdown(html);
            assert.strictEqual(roundTripped, original);
        });

        test('2回目の往復でも内容が変化しない（冪等性）', () => {
            const original = '# タイトル\n\n本文 **太字**\n\n* リスト\n';
            const once = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(original));
            const twice = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(once));
            assert.strictEqual(twice, once);
        });

        test('GitHubアラートが変換往復で保存される', () => {
            [
                '> [!NOTE]\n> 補足です\n',
                '> [!WARNING]\n> 注意1\n> 注意2\n',
                '> [!TIP]\n',
                '> [!IMPORTANT]\n> **太字** と [リンク](https://example.com)\n'
            ].forEach(original => {
                const rt = env.markdown.htmlToMarkdown(
                    env.markdown.markdownToHtml(original)
                );
                assert.strictEqual(rt, original, `roundtrip: ${JSON.stringify(original)}`);
            });
        });
    });

    suite('getCleanHtmlFromEditor', () => {
        test('検索ハイライトのスパンをアンラップする', () => {
            env.editor.innerHTML =
                '<p>前<span class="find-highlight">検索語</span>後</p>';
            const clean = env.markdown.getCleanHtmlFromEditor();
            assert.strictEqual(clean, '<p>前検索語後</p>');
        });

        test('テーブルUI（ツールバー・ボタン・contenteditable）を除去してテーブルを復元する', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml(
                '| A |\n| --- |\n| a1 |'
            );
            env.table.render();
            // レンダリング後はUI付きのコンテナ構造になっている
            assert.ok(env.editor.querySelector('.table-container'));
            assert.ok(env.editor.querySelector('.table-toolbar'));

            const clean = env.markdown.getCleanHtmlFromEditor();
            assert.ok(!clean.includes('table-toolbar'), clean);
            assert.ok(!clean.includes('<button'), clean);
            assert.ok(!clean.includes('contenteditable'), clean);
            assert.ok(!clean.includes('table-container'), clean);
            assert.ok(clean.includes('<table'), clean);
            assert.ok(clean.includes('<td'), clean);
        });

        test('Mermaidの編集中ソースを復元し、プレビューコンテナを除去する', () => {
            env.editor.innerHTML =
                '<pre class="mermaid-source" data-mermaid-id="m1" style="display: none;">' +
                '<code data-lang="mermaid">graph TD;A;</code></pre>' +
                '<div class="mermaid-container" data-mermaid-id="m1">' +
                '<textarea class="mermaid-source-code">graph TD;A--&gt;B;</textarea>' +
                '<svg></svg></div>';

            const clean = env.markdown.getCleanHtmlFromEditor();
            assert.ok(!clean.includes('mermaid-container'), clean);
            assert.ok(!clean.includes('mermaid-source-code'), clean);
            // textareaで編集中の最新ソースがcode要素に反映される
            assert.ok(clean.includes('graph TD;A--&gt;B;'), clean);
            assert.ok(!clean.includes('mermaid-source"'), clean);
        });
    });

    suite('convertTableToMarkdown', () => {
        test('テーブルのinnerHTMLをMarkdownテーブルに変換する', () => {
            const md = env.markdown.convertTableToMarkdown(
                '<thead><tr><th>H1</th><th>H2</th></tr></thead>' +
                '<tbody><tr><td>a</td><td>b</td></tr></tbody>'
            );
            assert.strictEqual(md, '| H1 | H2 |\n| --- | --- |\n| a | b |\n\n');
        });
    });

    suite('slugify', () => {
        test('英字は小文字化し空白をハイフンにする', () => {
            assert.strictEqual(env.markdown.slugify('Hello World'), 'hello-world');
        });

        test('記号を除去する', () => {
            assert.strictEqual(env.markdown.slugify('Foo: Bar! (baz)?'), 'foo-bar-baz');
        });

        test('日本語はそのまま残す', () => {
            assert.strictEqual(env.markdown.slugify('第1章 はじめに'), '第1章-はじめに');
        });

        test('アンダースコアとハイフンは保持する', () => {
            assert.strictEqual(env.markdown.slugify('a_b-c'), 'a_b-c');
        });
    });

    suite('buildTocMarkdown', () => {
        test('見出しレベルに応じてネストした箇条書きを作る', () => {
            const toc = env.markdown.buildTocMarkdown([
                { level: 1, text: 'Title' },
                { level: 2, text: 'Section A' },
                { level: 3, text: 'Detail' },
                { level: 2, text: 'Section B' }
            ]);
            assert.strictEqual(
                toc,
                '* [Title](#title)\n' +
                '  * [Section A](#section-a)\n' +
                '    * [Detail](#detail)\n' +
                '  * [Section B](#section-b)\n'
            );
        });

        test('最も浅い見出しをインデント0段に相対化する', () => {
            const toc = env.markdown.buildTocMarkdown([
                { level: 2, text: 'A' },
                { level: 3, text: 'B' }
            ]);
            assert.strictEqual(toc, '* [A](#a)\n  * [B](#b)\n');
        });

        test('重複する見出しには -1, -2 を付与する', () => {
            const toc = env.markdown.buildTocMarkdown([
                { level: 1, text: 'Intro' },
                { level: 1, text: 'Intro' },
                { level: 1, text: 'Intro' }
            ]);
            assert.strictEqual(
                toc,
                '* [Intro](#intro)\n* [Intro](#intro-1)\n* [Intro](#intro-2)\n'
            );
        });

        test('見出しが空なら空文字を返す', () => {
            assert.strictEqual(env.markdown.buildTocMarkdown([]), '');
        });

        test('生成したTOCは markdownToHtml→htmlToMarkdown で往復しても保たれる', () => {
            const toc = env.markdown.buildTocMarkdown([
                { level: 1, text: 'Title' },
                { level: 2, text: 'Section A' },
                { level: 2, text: 'Section B' }
            ]);
            const html = env.markdown.markdownToHtml(toc);
            const md = env.markdown.htmlToMarkdown(html);
            assert.strictEqual(md.trim(), toc.trim());
        });
    });

    suite('見出しidアンカー（TOC遷移）', () => {
        test('見出しにslugifyと同じidを付与する', () => {
            const html = env.markdown.markdownToHtml('## Section A');
            assert.ok(html.includes('<h2 id="section-a">'), html);
        });

        test('日本語見出しにもidを付与する', () => {
            const html = env.markdown.markdownToHtml('# 第1章 はじめに');
            assert.ok(html.includes('<h1 id="第1章-はじめに">'), html);
        });

        test('重複見出しには -1, -2 を付与する（TOCと同じ規則）', () => {
            const html = env.markdown.markdownToHtml('# Intro\n\n# Intro\n\n# Intro');
            assert.ok(html.includes('<h1 id="intro">'), html);
            assert.ok(html.includes('<h1 id="intro-1">'), html);
            assert.ok(html.includes('<h1 id="intro-2">'), html);
        });

        test('インライン記法を含む見出しでも可視テキストからidを作る', () => {
            const html = env.markdown.markdownToHtml('## **Bold** Heading');
            // 装飾記号(**)を除いた可視テキスト "Bold Heading" のスラッグと一致する
            assert.ok(html.includes('id="bold-heading"'), html);
        });

        test('TOCのアンカー(#slug)と見出しidが一致し遷移先が存在する', () => {
            const md = '# Title\n\n## Section A\n\n## Section A';
            const toc = env.markdown.buildTocMarkdown([
                { level: 1, text: 'Title' },
                { level: 2, text: 'Section A' },
                { level: 2, text: 'Section A' }
            ]);
            const html = env.markdown.markdownToHtml(md);
            // TOCが指す各アンカー(#slug)に対応するid属性が本文側に存在すること
            const anchors: string[] = (toc.match(/\(#([^)]+)\)/g) || [])
                .map((a: string) => a.slice(2, -1));
            anchors.forEach((slug: string) => {
                assert.ok(html.includes(`id="${slug}"`), `missing id=${slug}: ${html}`);
            });
        });

        test('id付き見出しを htmlToMarkdown で往復してもidは残らず内容が保たれる', () => {
            const original = '# タイトル\n\n## Section A\n';
            const roundTripped = env.markdown.htmlToMarkdown(
                env.markdown.markdownToHtml(original)
            );
            assert.strictEqual(roundTripped.trim(), original.trim());
        });
    });
});
