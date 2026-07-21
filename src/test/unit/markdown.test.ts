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

        test('画像記法 ![alt](url) を <img> に変換する（リンクと区別する）', () => {
            assert.strictEqual(
                env.markdown.markdownToHtml('![](image-1.png)'),
                '<p><img src="image-1.png" alt=""></p>'
            );
            assert.strictEqual(
                env.markdown.markdownToHtml('![説明](path/to/a.png)'),
                '<p><img src="path/to/a.png" alt="説明"></p>'
            );
            // 通常リンクは <a> のまま（! が無い）
            assert.ok(env.markdown.markdownToHtml('[text](url)').includes('<a href="url">text</a>'));
        });

        test('画像の属性の " をエスケープする', () => {
            const html = env.markdown.markdownToHtml('![a"b](u"v)');
            assert.ok(html.includes('src="u&quot;v"'), html);
            assert.ok(html.includes('alt="a&quot;b"'), html);
        });

        test('画像記法は WYSIWYG 往復で保たれる', () => {
            ['![](image-1.png)', '![説明](assets/x.png)', '前 ![](a.png) 後'].forEach(src => {
                const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(src));
                assert.strictEqual(rt.trim(), src, `roundtrip: ${src}`);
            });
        });

        test('パス/altに _ * ~ + を含む画像も往復で壊れない（強調変換から保護）', () => {
            [
                '![](my_project/image_1_2.png)',
                '![](a*b~c+d.png)',
                '![al_t](x_y.png)',
                '前 ![](p_q.png) と ![](r_s.png) 後'
            ].forEach(src => {
                const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(src));
                assert.strictEqual(rt.trim(), src, `roundtrip: ${src}`);
                // 属性内に <em>/<strong> が混入していないこと
                const html = env.markdown.markdownToHtml(src);
                assert.ok(!/src="[^"]*<(em|strong)/.test(html), html);
            });
        });

        test('<img> の data-original-src があればそれを優先して往復する', () => {
            // ローカル画像表示(2/2)で src を webview URI へ差し替えても、元パスで往復する
            const md = env.markdown.htmlToMarkdown(
                '<p><img src="https://file+.vscode-resource/abs/image-1.png" ' +
                'data-original-src="image-1.png" alt=""></p>'
            );
            assert.strictEqual(md.trim(), '![](image-1.png)');
        });

        suite('isResolvableRelativeImageSrc', () => {
            test('相対パスは true', () => {
                ['image.png', 'sub/image.png', '../up.png', './here.png'].forEach(s => {
                    assert.strictEqual(env.markdown.isResolvableRelativeImageSrc(s), true, s);
                });
            });

            test('スキーム付き・プロトコル相対・ルート絶対・空は false', () => {
                [
                    'http://h/x.png', 'https://h/x.png', 'data:image/png;base64,AAAA',
                    'blob:abc', 'vscode-webview://x/y.png', '//host/x.png', '/root.png', ''
                ].forEach(s => {
                    assert.strictEqual(env.markdown.isResolvableRelativeImageSrc(s), false, s);
                });
            });
        });

        suite('resolveImageSrc', () => {
            test('ベースURIと相対パスを / で結合する（先頭 ./ は除去）', () => {
                assert.strictEqual(
                    env.markdown.resolveImageSrc('https://base/dir', 'image.png'),
                    'https://base/dir/image.png'
                );
                assert.strictEqual(
                    env.markdown.resolveImageSrc('https://base/dir/', './image.png'),
                    'https://base/dir/image.png'
                );
                assert.strictEqual(
                    env.markdown.resolveImageSrc('https://base/dir', 'sub/a.png'),
                    'https://base/dir/sub/a.png'
                );
            });

            test('ベースURIが空なら src をそのまま返す', () => {
                assert.strictEqual(env.markdown.resolveImageSrc('', 'image.png'), 'image.png');
            });

            test('# と ? はエンコードする（% は二重エンコードしない）', () => {
                assert.strictEqual(
                    env.markdown.resolveImageSrc('https://base', 'img#1.png'),
                    'https://base/img%231.png'
                );
                assert.strictEqual(
                    env.markdown.resolveImageSrc('https://base', 'a?b.png'),
                    'https://base/a%3Fb.png'
                );
                // 既存の %20 はそのまま（% を再エンコードしない）
                assert.strictEqual(
                    env.markdown.resolveImageSrc('https://base', 'a%20b.png'),
                    'https://base/a%20b.png'
                );
            });
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
                '<ul data-marker="-"><li>項目1<ul data-marker="-"><li>ネスト</li></ul></li><li>項目2</li></ul>'
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
            assert.ok(html.includes('<ul data-marker="-"><li>通常ネスト</li></ul>'), html);
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
            assert.ok(html.startsWith('<table data-sep=" --- , --- "><thead><tr><th>列A</th><th>列B</th></tr></thead>'), html);
            assert.ok(html.includes('<tbody><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></tbody>'), html);
        });

        test('表区切り行の元表記（スペース有無・アライメントコロン）をdata-sepへ保持する', () => {
            const compact = env.markdown.markdownToHtml('| A |B|\n|---|---:|\n| 1 |2|');
            assert.ok(compact.includes('data-sep="---,---:"'), compact);

            const aligned = env.markdown.markdownToHtml('| A | B | C |\n|:---|---:|:---:|\n| 1 | 2 | 3 |');
            assert.ok(aligned.includes('data-sep=":---,---:,:---:"'), aligned);
        });

        test('列数とセパレーター列数が食い違う不正な表はdata-sepを付与しない', () => {
            // isTableStartの正規表現上は区切り行として認識されるが列数がヘッダーと異なるケース
            const html = env.markdown.markdownToHtml('| A | B |\n| --- |\n| 1 | 2 |');
            assert.ok(!html.includes('data-sep'), html);
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

        suite('脚注（[^label] / [^label]: 本文）', () => {
            test('参照を脚注リンク（sup>a）へ変換し、文書末尾に脚注一覧セクションを追加する', () => {
                const html = env.markdown.markdownToHtml('本文[^1]です。\n\n[^1]: 脚注の本文。');
                assert.ok(html.includes(
                    '<sup class="footnote-ref" data-footnote-label="1"><a href="#fn-1" id="fnref-1">1</a></sup>'
                ), html);
                assert.ok(html.includes(
                    '<section class="footnotes" data-footnotes="true"><ol>' +
                    '<li id="fn-1" data-footnote-label="1">脚注の本文。 ' +
                    '<a href="#fnref-1" class="footnote-backref">↩</a></li></ol></section>'
                ), html);
            });

            test('英数字・アンダースコア・ハイフンのラベルを扱える', () => {
                const html = env.markdown.markdownToHtml('参照[^note-1]。\n\n[^note-1]: 本文。');
                assert.ok(html.includes('data-footnote-label="note-1"'), html);
            });

            test('対応する定義が無い参照はリテラルテキストのまま残す（誤変換しない）', () => {
                const html = env.markdown.markdownToHtml('本文[^1]です。');
                assert.ok(html.includes('本文[^1]です。'), html);
                assert.ok(!html.includes('footnote-ref'), html);
            });

            test('脚注定義が無ければ脚注一覧セクションも生成しない', () => {
                const html = env.markdown.markdownToHtml('ただの本文です。');
                assert.ok(!html.includes('footnotes'), html);
            });

            test('参照されていない「定義行らしき」地の文は脚注として剥がさない（誤検知防止・/local-review指摘A対応）', () => {
                // 正規表現の説明文などで `[^0-9]: ...` の形が偶然出てきても、
                // どこにも `[^0-9]`（参照）が無ければ普通の段落として保持する。
                const md = '正規表現の説明です。\n\n[^0-9]: 数字以外にマッチする文字クラスの例です。';
                const html = env.markdown.markdownToHtml(md);
                assert.ok(!html.includes('footnotes'), html);
                assert.ok(html.includes('[^0-9]: 数字以外にマッチする文字クラスの例です。'), html);
                // 参照が無いため、そのまま書き戻しても内容は変わらない
                assert.strictEqual(env.markdown.htmlToMarkdown(html), md + '\n');
            });

            test('脚注本文にもインライン記法（強調等）を適用する', () => {
                const html = env.markdown.markdownToHtml('本文[^1]。\n\n[^1]: **重要**な注釈。');
                assert.ok(html.includes('<li id="fn-1" data-footnote-label="1"><strong>重要</strong>な注釈。'), html);
            });

            test('コードフェンス内の `[^1]: ...` は脚注定義として扱わない', () => {
                const html = env.markdown.markdownToHtml(
                    '```\n[^1]: これはコード例\n```'
                );
                assert.ok(html.includes('[^1]: これはコード例'), html);
                assert.ok(!html.includes('footnotes'), html);
            });

            test('同じラベルが複数定義された場合は最初の定義を脚注として使い、二番目は通常の段落として残す（データを失わない）', () => {
                const html = env.markdown.markdownToHtml(
                    '本文[^1]。\n\n[^1]: 最初の定義。\n[^1]: 二番目の定義（無視される）。'
                );
                assert.ok(html.includes(
                    '<li id="fn-1" data-footnote-label="1">最初の定義。'
                ), html);
                // 二番目は脚注としては無視されるが、内容は通常の段落として保持される
                // （誤って脚注参照へ変換されないことも確認: /local-review 指摘由来）
                assert.ok(html.includes('<p>[^1]: 二番目の定義（無視される）。</p>'), html);
            });
        });

        suite('extractFootnoteDefinitions', () => {
            test('参照（[^label]）が実在する定義行だけを抜き出し、残りの行と定義済みラベルを返す', () => {
                const result = env.markdown.extractFootnoteDefinitions([
                    '本文行[^1][^note]',
                    '[^1]: 定義1',
                    '[^note]: 定義2',
                    '別の本文行'
                ]);
                assert.deepStrictEqual(Array.from(result.defs, (d: any) => ({ ...d })), [
                    { label: '1', text: '定義1' },
                    { label: 'note', text: '定義2' }
                ]);
                assert.strictEqual(result.labels.has('1'), true);
                assert.strictEqual(result.labels.has('note'), true);
                assert.deepStrictEqual(Array.from(result.contentLines), ['本文行[^1][^note]', '別の本文行']);
            });

            test('参照が無い（地の文が偶然この形をしていただけの）定義行らしき行は通常の行として残す（誤検知防止・/local-review指摘A対応）', () => {
                const result = env.markdown.extractFootnoteDefinitions([
                    '正規表現の説明:',
                    '[^0-9]: 数字以外にマッチする文字クラスの例です。',
                    '本文はここまで'
                ]);
                assert.deepStrictEqual(Array.from(result.defs), []);
                assert.strictEqual(result.labels.size, 0);
                assert.deepStrictEqual(Array.from(result.contentLines), [
                    '正規表現の説明:',
                    '[^0-9]: 数字以外にマッチする文字クラスの例です。',
                    '本文はここまで'
                ]);
            });

            test('コードフェンス・ブロック数式の中は定義としても参照としても解釈しない', () => {
                const result = env.markdown.extractFootnoteDefinitions([
                    '参照[^3]',
                    '```',
                    '[^1]: コード内',
                    '```',
                    '$$',
                    '[^2]: 数式内',
                    '$$',
                    '[^3]: 本物の定義'
                ]);
                assert.deepStrictEqual(Array.from(result.defs, (d: any) => ({ ...d })), [
                    { label: '3', text: '本物の定義' }
                ]);
                assert.deepStrictEqual(Array.from(result.contentLines), [
                    '参照[^3]', '```', '[^1]: コード内', '```', '$$', '[^2]: 数式内', '$$'
                ]);
            });
        });

        suite('buildFootnotesSectionHtml', () => {
            test('定義が無ければ空文字を返す', () => {
                assert.strictEqual(env.markdown.buildFootnotesSectionHtml([]), '');
            });
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

        test('data-marker="-" のulは - でシリアライズする（* に書き換えない）', () => {
            const md = env.markdown.htmlToMarkdown('<ul data-marker="-"><li>a</li><li>b</li></ul>');
            assert.strictEqual(md, '- a\n- b\n');
        });

        test('data-marker が無い/不正な ul は従来どおり * （新規入力の既定を維持）', () => {
            assert.strictEqual(
                env.markdown.htmlToMarkdown('<ul><li>a</li></ul>'), '* a\n'
            );
            assert.strictEqual(
                env.markdown.htmlToMarkdown('<ul data-marker="x"><li>a</li></ul>'), '* a\n'
            );
        });

        test('箇条書きマーカーは往復でバイト一致する（触っていない行が書き換わらない）', () => {
            [
                '- 項目1\n- 項目2\n',
                '* 項目1\n* 項目2\n',
                '- 親\n  - 子\n- 親2\n',
                '* 親\n  * 子\n',
                '- [ ] 未\n- [x] 済\n'
            ].forEach(src => {
                const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(src));
                assert.strictEqual(rt, src, `roundtrip: ${JSON.stringify(src)}`);
            });
        });

        test('既知の制約: 空行なしで異なるマーカーが混在すると先頭マーカーへ統一される', () => {
            // `- a` と `* b` は本来別リスト（CommonMark）だが、現状のパーサーは空行が
            // 無いと1つのulに束ね、data-marker は先頭アイテムのマーカーになる。
            // よって `* b` は `- b` に書き換わる（往復非一致）。表区切りと合わせて
            // ROADMAP の残タスク。ここでは現状挙動を固定し、退行に気づけるようにする。
            const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml('- a\n* b\n'));
            assert.strictEqual(rt, '- a\n- b\n');
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

        test('data-sepが無いtableはデフォルトの --- 区切りでシリアライズする（新規生成テーブル向け）', () => {
            const md = env.markdown.htmlToMarkdown(
                '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
                '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
            );
            assert.strictEqual(md, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
        });

        test('data-sepの列数がヘッダー列数と食い違う場合はデフォルト書式にフォールバックする', () => {
            const md = env.markdown.htmlToMarkdown(
                '<table data-sep="---"><thead><tr><th>A</th><th>B</th></tr></thead>' +
                '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
            );
            assert.strictEqual(md, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
        });

        [
            '| A | B |\n|---|---:|\n| 1 | 2 |',
            '| A | B |\n|:---|---:|\n| 1 | 2 |',
            '| A | B |\n| :---: | :---: |\n| 1 | 2 |'
        ].forEach(md => {
            test(`触っていない表の区切り行の書式をバイト単位で保つ（往復）: ${JSON.stringify(md)}`, () => {
                const html = env.markdown.markdownToHtml(md);
                const roundTripped = env.markdown.htmlToMarkdown(html);
                assert.strictEqual(roundTripped.trim(), md.trim());
            });
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

        suite('脚注（sup.footnote-ref / section.footnotes）', () => {
            test('脚注参照（sup）を[^label]へ復元する', () => {
                const md = env.markdown.htmlToMarkdown(
                    '<p>本文' +
                    '<sup class="footnote-ref" data-footnote-label="1"><a href="#fn-1" id="fnref-1">1</a></sup>' +
                    'です。</p>'
                );
                assert.strictEqual(md, '本文[^1]です。\n');
            });

            test('脚注一覧セクションを[^label]: 本文へ復元し、戻りリンクは含めない', () => {
                const md = env.markdown.htmlToMarkdown(
                    '<section class="footnotes"><ol>' +
                    '<li id="fn-1" data-footnote-label="1">脚注本文。 ' +
                    '<a href="#fnref-1" class="footnote-backref">back</a></li>' +
                    '</ol></section>'
                );
                assert.strictEqual(md, '[^1]: 脚注本文。\n');
            });

            test('複数の脚注定義は定義順で並べる', () => {
                const md = env.markdown.htmlToMarkdown(
                    '<section class="footnotes"><ol>' +
                    '<li id="fn-1" data-footnote-label="1">最初。</li>' +
                    '<li id="fn-2" data-footnote-label="2">次。</li>' +
                    '</ol></section>'
                );
                assert.strictEqual(md, '[^1]: 最初。\n[^2]: 次。\n');
            });

            test('footnotesクラスを持たないsectionは通常のブロックコンテナとして再帰する', () => {
                const md = env.markdown.htmlToMarkdown('<section><p>本文</p></section>');
                assert.strictEqual(md, '本文\n');
            });
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
            // エスケープ由来の $ はゼロ幅スペース付き（$ + ZERO_WIDTH）でDOMに保持される
            // （編集時の再変換で $…$ が数式化しないための目印。表示上は $ のみ）
            const ZW = env.state.ZERO_WIDTH;
            assert.ok(html.includes(`価格は $${ZW}100 と $${ZW}200 です`), html);
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

        test('生Markdown表示中のインライン数式span（`$式$`）は $ をエスケープせず直列化する', () => {
            // 生Markdown表示（commands.expandMathToRaw）の展開中に書き戻しても
            // 展開前と同一のMarkdownになること（$ が \$ へ化けない）
            const html = '<p><span class="raw-markdown">$\\alpha^2$</span></p>';
            const back = env.markdown.htmlToMarkdown(html).trim();
            assert.strictEqual(back, '$\\alpha^2$');
        });

        test('生Markdown表示中のブロック数式div（`$$式$$`）は $ をエスケープせず直列化する', () => {
            const html = '<div class="raw-markdown raw-math-block">$$\nx = \\frac{1}{2}\n$$</div>';
            const back = env.markdown.htmlToMarkdown(html).trim();
            assert.strictEqual(back, '$$\nx = \\frac{1}{2}\n$$');
        });

        test('ブロック数式divの改行が<br>で表現されていても直列化で改行に戻る', () => {
            // contenteditableは改行を <br> で表すことがあるため、それも改行として扱う
            const html = '<div class="raw-markdown raw-math-block">$$<br>x^2<br>$$</div>';
            const back = env.markdown.htmlToMarkdown(html).trim();
            assert.strictEqual(back, '$$\nx^2\n$$');
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

        test('脚注（[^label] / [^label]: 本文）が変換往復で保存される（定義が文書末尾にある場合）', () => {
            [
                '本文[^1]です。\n\n[^1]: 脚注の本文。\n',
                '複数[^1]の脚注[^2]。\n\n[^1]: 最初。\n[^2]: 次。\n',
                'ラベルにハイフンを含む[^note-1]。\n\n[^note-1]: 本文。\n',
                '脚注本文に**強調**を含む[^1]。\n\n[^1]: **重要**な注釈。\n'
            ].forEach(original => {
                const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(original));
                assert.strictEqual(rt, original, `roundtrip: ${JSON.stringify(original)}`);
            });
        });

        test('未定義ラベルの参照はリテラルテキストのまま変換往復で保存される', () => {
            const original = '本文[^does-not-exist]です。\n';
            const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(original));
            assert.strictEqual(rt, original);
        });

        test('脚注定義が文書中程にある場合は末尾へ再配置される（既知の仕様・脚注は常に末尾へ集約）', () => {
            const original = '本文[^1]。\n\n[^1]: 脚注の本文。\n\n続きの本文。';
            const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(original));
            assert.ok(rt.trim().endsWith('[^1]: 脚注の本文。'), rt);
            assert.ok(rt.includes('続きの本文。'), rt);
            assert.ok(rt.indexOf('続きの本文。') < rt.indexOf('[^1]: 脚注の本文。'), '本文の後に脚注一覧が来る');
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

    // env.markdown が返す配列はjsdom側レルムのため、deepStrictEqualの
    // プロトタイプ照合に通らない。Node側配列へ移し替えてから比較する。
    const eqArr = (actual: unknown[], expected: unknown[]) =>
        assert.deepStrictEqual(Array.prototype.slice.call(actual), expected);

    suite('coreLinesOf（行番号表示2/3）', () => {
        test('見出し・段落は末尾の空行を落として本文行だけ返す', () => {
            eqArr(env.markdown.coreLinesOf('# 見出し\n\n'), ['# 見出し']);
            eqArr(env.markdown.coreLinesOf('para1\n\n'), ['para1']);
        });

        test('複数行ブロック（コードフェンス）は本文行をすべて返す', () => {
            eqArr(env.markdown.coreLinesOf('```\na\nb\n```\n\n'), ['```', 'a', 'b', '```']);
        });

        test('前後の空行を落とすが本文中の空行は保つ', () => {
            eqArr(env.markdown.coreLinesOf('\nl1\n\nl2\n\n'), ['l1', '', 'l2']);
        });

        test('空だけのブロックは空配列（行を占めない）', () => {
            eqArr(env.markdown.coreLinesOf('\n'), []);
            eqArr(env.markdown.coreLinesOf(''), []);
        });
    });

    suite('computeBlockStartLines（行番号表示2/3）', () => {
        test('段落2つは [1, 3]（間に空行1つ）', () => {
            const final = 'para1\n\npara2\n';
            const blocks = ['para1\n\n', 'para2\n\n'];
            eqArr(env.markdown.computeBlockStartLines(final, blocks), [1, 3]);
        });

        test('見出し＋段落は [1, 3]', () => {
            const final = '# H\n\npara\n';
            const blocks = ['# H\n\n', 'para\n\n'];
            eqArr(env.markdown.computeBlockStartLines(final, blocks), [1, 3]);
        });

        test('複数行のコードブロックの次の段落は空行分ずれる', () => {
            const final = '```\na\nb\nc\n```\n\npara\n';
            const blocks = ['```\na\nb\nc\n```\n\n', 'para\n\n'];
            // コードは1〜5行目、6行目は空行、段落は7行目
            eqArr(env.markdown.computeBlockStartLines(final, blocks), [1, 7]);
        });

        test('本文を持たない空ブロックは null（行を占めない）', () => {
            const final = 'para\n\np2\n';
            const blocks = ['para\n\n', '\n', 'p2\n\n'];
            eqArr(env.markdown.computeBlockStartLines(final, blocks), [1, null, 3]);
        });

        test('同一本文の段落が並んでも順序（cursor前進）で正しく対応づく', () => {
            const final = 'foo\n\nfoo\n';
            const blocks = ['foo\n\n', 'foo\n\n'];
            eqArr(env.markdown.computeBlockStartLines(final, blocks), [1, 3]);
        });

        test('computeEditorLineMap: 見出し＋段落は各ライブ要素に開始行を対応づける', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('# 見出し\n\n段落A\n\n段落B');
            const map = env.markdown.computeEditorLineMap(env.editor);
            assert.strictEqual(map.length, 3, JSON.stringify(map.map((m: any) => m.line)));
            assert.strictEqual(map[0].line, 1);
            assert.strictEqual(map[0].block, env.editor.children[0]); // 実要素への参照
            assert.strictEqual(map[0].block.tagName, 'H1');
            assert.strictEqual(map[1].line, 3);
            assert.strictEqual(map[2].line, 5);
        });

        test('computeEditorLineMap: コードブロックの次の段落は空行分ずれる', () => {
            env.editor.innerHTML = env.markdown.markdownToHtml('段落A\n\n```\nx\ny\n```\n\n段落B');
            const map = env.markdown.computeEditorLineMap(env.editor);
            const lines = map.map((m: any) => m.line);
            assert.deepStrictEqual(Array.prototype.slice.call(lines), [1, 3, 8], JSON.stringify(lines));
            assert.strictEqual(map[1].block.tagName, 'PRE');
        });

        test('computeEditorLineMap: Mermaidは可視コンテナへ対応し隠しpreは対象外', () => {
            env.editor.innerHTML =
                '<p>前</p>' +
                '<pre class="mermaid-source" data-mermaid-id="m1" style="display:none">' +
                '<code>graph TD; A--&gt;B</code></pre>' +
                '<div class="mermaid-container" data-mermaid-id="m1" contenteditable="false">' +
                '<svg></svg></div>' +
                '<p>後</p>';
            const map = env.markdown.computeEditorLineMap(env.editor);
            const blocks = map.map((m: any) => m.block);
            // 隠しソースpreは行番号の対象にしない
            assert.ok(
                !blocks.some((b: Element) => b.classList.contains('mermaid-source')),
                'hidden mermaid-source pre must not be a target'
            );
            // 可視コンテナが対象に含まれる
            const container = env.editor.querySelector('.mermaid-container');
            assert.ok(blocks.indexOf(container) !== -1, 'mermaid-container must be a target');
            // 前・図・後 の3ブロック、行番号は単調増加
            assert.strictEqual(map.length, 3, JSON.stringify(map.map((m: any) => m.line)));
            for (let i = 1; i < map.length; i++) {
                assert.ok(map[i].line > map[i - 1].line, JSON.stringify(map.map((m: any) => m.line)));
            }
        });

        test('computeEditorLineMap: テーブルは .table-container（可視要素）へ対応づける', () => {
            env.editor.innerHTML =
                '<p>前</p>' +
                '<div class="table-container"><table><thead><tr><th>a</th></tr></thead>' +
                '<tbody><tr><td>1</td></tr></tbody></table></div>';
            const map = env.markdown.computeEditorLineMap(env.editor);
            const container = env.editor.querySelector('.table-container');
            const tableEntry = map.find((m: any) => m.block === container);
            assert.ok(tableEntry, 'table-container should be a target: ' + JSON.stringify(map.map((m: any) => m.line)));
            assert.strictEqual(map[0].line, 1);
        });

        test('実DOM経由: markdownToHtml→各ブロック直列化→開始行が本文行と一致する', () => {
            const src = '# 見出し\n\n段落A\n\n```\nx\ny\n```\n\n段落B';
            const html = env.markdown.markdownToHtml(src);
            const editor = env.document.createElement('div');
            editor.innerHTML = html;

            const finalMd = env.markdown.htmlToMarkdown(html);
            // 各トップレベルブロックを個別に直列化（serializeBlockElement相当）
            const blocks = Array.from(editor.children).map(
                (c: Element) => env.markdown.htmlToMarkdown(c.outerHTML)
            );

            const starts = env.markdown.computeBlockStartLines(finalMd, blocks);
            const docLines = finalMd.split('\n');

            assert.strictEqual(starts[0], 1, finalMd);
            // 返った各開始行には、そのブロックの本文先頭行が実際に存在する
            starts.forEach((line: number | null, i: number) => {
                if (line === null) {
                    return;
                }
                const core = env.markdown.coreLinesOf(blocks[i]);
                assert.strictEqual(docLines[line - 1], core[0], `block ${i}: ${finalMd}`);
            });
            // 開始行は単調増加（順序が保たれる）
            const nums = starts.filter((n: number | null) => n !== null) as number[];
            for (let i = 1; i < nums.length; i++) {
                assert.ok(nums[i] > nums[i - 1], `not increasing: ${nums}`);
            }
        });
    });

    suite('往復の完全一致（コピー＝保存内容の忠実性）', () => {
        /** 読込→直列化の1往復 */
        function roundTrip(src: string): string {
            return env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(src));
        }

        test('連続する空行（2行）が往復で保持される', () => {
            const src = '段落1\n\n\n段落2\n';
            assert.strictEqual(roundTrip(src), src);
        });

        test('連続する空行（3行）が往復で保持される', () => {
            const src = '段落1\n\n\n\n段落2\n';
            assert.strictEqual(roundTrip(src), src);
        });

        test('見出し・リスト間の複数空行も保持される', () => {
            // リストマーカーは `* ` へ正規化される仕様のため `* ` で書く
            const src = '# 見出し\n\n\n* 項目\n';
            assert.strictEqual(roundTrip(src), src);
        });

        test('単一の空行区切りは従来どおり（増殖しない）', () => {
            const src = '段落1\n\n段落2\n';
            assert.strictEqual(roundTrip(src), src);
            // 冪等: もう一往復しても変わらない
            assert.strictEqual(roundTrip(roundTrip(src)), src);
        });

        test('sample.md 全体が編集イベントを挟んでも完全往復する', function () {
            // 実ファイルでの完全一致回帰テスト:
            // 全選択コピー→新規ファイル貼り付けで diff ゼロを保証する
            const fs = require('fs');
            const path = require('path');
            const samplePath = path.resolve(__dirname, '..', '..', '..', 'sample.md');
            if (!fs.existsSync(samplePath)) {
                this.skip();
                return;
            }
            const src = String(fs.readFileSync(samplePath, 'utf8')).replace(/\r\n?/g, '\n');

            env.editor.innerHTML = env.markdown.markdownToHtml(src);
            // 読込直後の往復
            const afterLoad = env.markdown.htmlToMarkdown(
                env.markdown.getCleanHtmlFromEditor());
            assert.strictEqual(afterLoad, src, '読込→直列化で差分が出ている');

            // 編集イベント（input パイプラインの再変換）を挟んだ往復
            env.commands.applyInlineFormatting();
            const afterEdit = env.markdown.htmlToMarkdown(
                env.markdown.getCleanHtmlFromEditor());
            assert.strictEqual(afterEdit, src, '編集イベント経由で差分が出ている');
        });
    });
});
