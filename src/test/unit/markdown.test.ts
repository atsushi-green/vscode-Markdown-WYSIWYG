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

        suite('タイトル記法 ![alt](url "title") / [text](url "title")', () => {
            suite('parseLinkDestination', () => {
                // 返り値は jsdom 側のレルムで生成されるため deepStrictEqual は
                // プロトタイプ不一致で落ちる。プロパティごとに比較する
                const assertDest = (
                    dest: string, url: string, title: string | null
                ) => {
                    const d = env.markdown.parseLinkDestination(dest);
                    assert.strictEqual(d.url, url, `url of ${JSON.stringify(dest)}`);
                    assert.strictEqual(d.title, title, `title of ${JSON.stringify(dest)}`);
                };

                test('空白＋"…" をタイトルとして分離する', () => {
                    assertDest('u.png "説明"', 'u.png', '説明');
                });

                test("'…' も受け付ける", () => {
                    assertDest("u.png '説明'", 'u.png', '説明');
                });

                test('タイトルが無ければ title は null', () => {
                    assertDest('u.png', 'u.png', null);
                });

                test('空白が無ければURLの一部として扱う（引用符入りのパスを守る）', () => {
                    assertDest('a"b".png', 'a"b".png', null);
                });

                test('閉じ引用符が末尾に無い不正な形はタイトル無しとして扱う', () => {
                    assertDest('u.png "a" b', 'u.png "a" b', null);
                });

                test('空のタイトル・前後の余分な空白を許容する', () => {
                    assertDest('u.png   ""  ', 'u.png', '');
                });
            });

            test('画像・リンクのタイトルを title 属性へ分離する', () => {
                assert.strictEqual(
                    env.markdown.markdownToHtml('![説明](a.png "タイトル")'),
                    '<p><img src="a.png" alt="説明" title="タイトル"></p>'
                );
                assert.ok(
                    env.markdown.markdownToHtml('[text](https://e.com "タイトル")')
                        .includes('<a href="https://e.com" title="タイトル">text</a>'),
                    env.markdown.markdownToHtml('[text](https://e.com "タイトル")')
                );
            });

            test('タイトル中の " は属性値としてエスケープされる', () => {
                const html = env.markdown.markdownToHtml("![a](u.png 'a\"b')");
                assert.ok(html.includes('title="a&quot;b"'), html);
                assert.ok(html.includes('src="u.png"'), html);
            });

            test('タイトル記法は往復で保たれる（画像・リンク）', () => {
                const cases = [
                    '![説明](a.png "タイトル")',
                    '[text](https://e.com "タイトル")',
                    "[text](https://e.com 'タ\"イトル')"
                ];
                for (const md of cases) {
                    env.editor.innerHTML = env.markdown.markdownToHtml(md);
                    const out = env.markdown
                        .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                        .replace(/\s+$/, '');
                    assert.strictEqual(out, md, `roundtrip: ${md}`);
                }
            });

            test('URL・タイトル中の _ / * が強調変換に食われない', () => {
                // 画像と同じくリンクもプレースホルダへ退避してから強調変換を通す
                const html = env.markdown.markdownToHtml('[t](https://e.com/a_b_c "x_y_z")');
                assert.ok(!html.includes('<em>'), html);
                env.editor.innerHTML = html;
                const a = env.editor.querySelector('a');
                assert.ok(a, html);
                assert.strictEqual(a!.getAttribute('href'), 'https://e.com/a_b_c');
                assert.strictEqual(a!.getAttribute('title'), 'x_y_z');
            });

            test('URL中の _ / * を含むリンクが往復する', () => {
                for (const md of [
                    '[t](https://e.com/a_b_c)',
                    '[t](https://e.com/a*b*c)',
                    '[t](https://e.com/x "a_b_c")',
                    // 退避によって同時に守られる他の強調記法も固定しておく
                    '[t](https://e.com/a~~b~~c)',
                    '[t](https://e.com/a++b++c)',
                    '[t](https://e.com/a__b__c)',
                    '[t](https://e.com/x "a***b***c")'
                ]) {
                    env.editor.innerHTML = env.markdown.markdownToHtml(md);
                    const out = env.markdown
                        .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                        .replace(/\s+$/, '');
                    assert.strictEqual(out, md, `roundtrip: ${md}`);
                }
            });

            suite('URL・タイトル・alt 中のコード/数式記法が退避に巻き込まれない', () => {
                test('バッククォートが <code> に展開されない（リンク・画像・タイトル・alt）', () => {
                    const cases: Array<[string, string, string]> = [
                        ['[t](http://e/a`b`c)', 'a', 'href'],
                        ['![alt](http://e/a`b`c)', 'img', 'src'],
                        ['[t](http://e/x "a`b`c")', 'a', 'title'],
                        ['![a`b`c](http://e/x)', 'img', 'alt']
                    ];
                    for (const [md, tag, attr] of cases) {
                        const html = env.markdown.markdownToHtml(md);
                        assert.ok(!html.includes('<code>'), `${md} → ${html}`);
                        env.editor.innerHTML = html;
                        const el = env.editor.querySelector(tag);
                        assert.ok(el, `${md} → ${html}`);
                        assert.ok(
                            el!.getAttribute(attr)!.includes('a`b`c'),
                            `${md} → ${attr}=${el!.getAttribute(attr)}`
                        );
                    }
                });

                test('インライン数式が属性値の中で展開されずタグ構造も壊れない', () => {
                    // 復元される <span class="math-inline" …> の " で属性値が途中終了し、
                    // タグ構造ごと壊れていた（往復結果が ["&gt;t](http://e/<span class=) になる）
                    const html = env.markdown.markdownToHtml('[t](http://e/$a_1$)');
                    assert.ok(!html.includes('math-inline'), html);
                    env.editor.innerHTML = html;
                    const a = env.editor.querySelector('a');
                    assert.ok(a, html);
                    assert.strictEqual(a!.getAttribute('href'), 'http://e/$a_1$');
                    assert.strictEqual(a!.textContent, 't', html);
                });

                test('エスケープされたドル記号（\\$）がURLに混入しない', () => {
                    env.editor.innerHTML = env.markdown.markdownToHtml('[t](http://e/\\$100)');
                    const a = env.editor.querySelector('a');
                    assert.ok(a, env.editor.innerHTML);
                    assert.strictEqual(a!.getAttribute('href'), 'http://e/\\$100');
                });

                test('コード・数式を含むURL/タイトル/altが往復する', () => {
                    for (const md of [
                        '[t](http://e/a`b`c)',
                        '![alt](http://e/a`b`c)',
                        '[t](http://e/x "a`b`c")',
                        '![a`b`c](http://e/x)',
                        '[t](http://e/$a_1$)',
                        '[t](http://e/x "$a_1$")',
                        '[t](http://e/\\$100)'
                    ]) {
                        env.editor.innerHTML = env.markdown.markdownToHtml(md);
                        const out = env.markdown
                            .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                            .replace(/\s+$/, '');
                        assert.strictEqual(out, md, `roundtrip: ${md}`);
                    }
                });

                test('数式の中に入れ子になったコード・\\$ も元テキストへ戻る', () => {
                    // 数式の退避はコード・\$ の**後**に行われるため、控えている元テキスト
                    // には両者のプレースホルダが残っている。戻す順序を
                    // 数式→コード→\$ にしないと入れ子分が誰にも復元されない
                    for (const md of [
                        '[t](http://e/$a`b`c$)',
                        '[t](http://e/$a\\$b$)',
                        '![$a`b`c$](http://e/x)',
                        '[t](http://e/x "$a`b`c$")'
                    ]) {
                        const html = env.markdown.markdownToHtml(md);
                        assert.ok(!html.includes('<code>'), `${md} → ${html}`);
                        env.editor.innerHTML = html;
                        const out = env.markdown
                            .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                            .replace(/\s+$/, '');
                        assert.strictEqual(out, md, `roundtrip: ${md}`);
                    }
                });

                test('入れ子のコード内に " があってもタグ構造が壊れない', () => {
                    // 属性値が <code>" で途中終了し、リンク記法の外まで文字列が漏れて
                    // 往復結果が [b\$">t](http://e/$a<code>) tail になっていた
                    const md = '[t](http://e/$a`"`b$) tail';
                    env.editor.innerHTML = env.markdown.markdownToHtml(md);
                    const a = env.editor.querySelector('a');
                    assert.ok(a, env.editor.innerHTML);
                    assert.strictEqual(a!.textContent, 't', env.editor.innerHTML);
                    const out = env.markdown
                        .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                        .replace(/\s+$/, '');
                    assert.strictEqual(out, md);
                });

                test('リンクテキスト内のコード・数式は従来どおり変換される（回帰確認）', () => {
                    // 退避を戻すのは属性になる部分（URL・タイトル・alt）だけで、
                    // リンクテキストはHTMLの流れに残るため従来どおり変換される
                    const html = env.markdown.markdownToHtml('[`code`と$x$](http://e/u)');
                    assert.ok(html.includes('<code>code</code>'), html);
                    assert.ok(html.includes('math-inline'), html);
                    env.editor.innerHTML = html;
                    const out = env.markdown
                        .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                        .replace(/\s+$/, '');
                    assert.strictEqual(out, '[`code`と$x$](http://e/u)');
                });

                test('コード内に書いたリンク記法は従来どおり変換されない（回帰確認）', () => {
                    // コード退避をリンク/画像より先に行う順序自体は変えていない
                    const html = env.markdown.markdownToHtml('`[t](http://e/u)`');
                    assert.ok(html.includes('<code>'), html);
                    assert.ok(!html.includes('<a '), html);
                });
            });

            test('リンクテキスト内の強調は従来どおり変換される（回帰確認）', () => {
                // 退避するのは開始タグ（属性）だけで、テキストは変換対象のまま
                const html = env.markdown.markdownToHtml('[**太字**と*斜体*](https://e.com)');
                assert.ok(html.includes('<strong>太字</strong>'), html);
                assert.ok(html.includes('<em>斜体</em>'), html);
                env.editor.innerHTML = html;
                const out = env.markdown
                    .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                    .replace(/\s+$/, '');
                assert.strictEqual(out, '[**太字**と*斜体*](https://e.com)');
            });

            test('data URL（内部に空白と \' を含む）＋タイトルでも往復する', () => {
                // sample.md のタイトル付き画像と同型。URL中の `'` を閉じ引用符と
                // 誤認すると URL が途中で切れる（最長のURL＋末尾の引用符対が正しい）
                const md = '![緑の四角](data:image/svg+xml;utf8,' +
                    "<svg xmlns='http://www.w3.org/2000/svg' width='48'>" +
                    "<rect x='8' fill='%234caf50'/></svg> \"タイトル付きの画像です\")";
                env.editor.innerHTML = env.markdown.markdownToHtml(md);
                const img = env.editor.querySelector('img');
                assert.ok(img, env.editor.innerHTML);
                assert.strictEqual(img!.getAttribute('title'), 'タイトル付きの画像です');
                assert.ok(
                    img!.getAttribute('src')!.endsWith('</svg>'),
                    `src: ${img!.getAttribute('src')}`
                );
                const out = env.markdown
                    .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                    .replace(/\s+$/, '');
                assert.strictEqual(out, md);
            });

            test('空タイトル（""）は往復で削除される（既知の正規化）', () => {
                // 空のタイトルは意味を持たないため title 属性が空になり、直列化で
                // 落ちる。保存のたびに `![](a.png)` へ正規化される仕様として受け入れる
                env.editor.innerHTML = env.markdown.markdownToHtml('![](a.png "")');
                const out = env.markdown
                    .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                    .replace(/\s+$/, '');
                assert.strictEqual(out, '![](a.png)');
            });

            test('タイトル記法が無い場合は従来どおり出力する（回帰確認）', () => {
                for (const md of ['![説明](a.png)', '[text](https://e.com)']) {
                    env.editor.innerHTML = env.markdown.markdownToHtml(md);
                    const out = env.markdown
                        .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                        .replace(/\s+$/, '');
                    assert.strictEqual(out, md, `roundtrip: ${md}`);
                }
            });

            suite('serializeTitle', () => {
                const el = (html: string) => {
                    const d = env.document.createElement('div');
                    d.innerHTML = html;
                    return d.firstElementChild;
                };

                test('title 属性を " で囲んで戻す', () => {
                    assert.strictEqual(
                        env.markdown.serializeTitle(el('<a href="u" title="t">x</a>')),
                        ' "t"'
                    );
                });

                test('title が無い・空なら空文字', () => {
                    assert.strictEqual(
                        env.markdown.serializeTitle(el('<a href="u">x</a>')), ''
                    );
                    assert.strictEqual(
                        env.markdown.serializeTitle(el('<a href="u" title="">x</a>')), ''
                    );
                });

                test('" を含むタイトルは \' で囲む', () => {
                    assert.strictEqual(
                        env.markdown.serializeTitle(el('<a href="u" title="a&quot;b">x</a>')),
                        " 'a\"b'"
                    );
                });

                test('改行を含むタイトルは捨てる（文書の破壊を防ぐため）', () => {
                    // リンク記法は1行内で完結する前提。改行をそのまま出すと
                    // 段落が分断され、記法の外まで文字列が漏れる
                    const a = el('<a href="u" title="x">t</a>') as HTMLElement;
                    a.setAttribute('title', 'a\nb');
                    assert.strictEqual(env.markdown.serializeTitle(a), '');
                    a.setAttribute('title', 'a\rb');
                    assert.strictEqual(env.markdown.serializeTitle(a), '');
                });

                test(') を含むタイトルは捨てる（文書の破壊を防ぐため）', () => {
                    // ) は ([^)]+) の外なので出力すると再パース時にURLが途中で切れ、
                    // リンク記法の外まで文字列が漏れて文書が壊れる
                    assert.strictEqual(
                        env.markdown.serializeTitle(el('<a href="u" title="a)b">x</a>')), ''
                    );
                });
            });
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
                    '<li id="fn-1" data-footnote-label="1" data-footnote-sep=" ">脚注の本文。 ' +
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

            test('ラベル中の _ が強調変換に食われない（参照側）', () => {
                // ラベルは [A-Za-z0-9_-] を許すので `_` は正当な文字。
                // 参照の <sup> を実HTMLのまま埋めると属性・href・id が
                // `a<em>b</em>c` に化けて脚注リンクのジャンプが壊れる
                const html = env.markdown.markdownToHtml(
                    '本文[^a_b_c]です。\n\n[^a_b_c]: 脚注の本文。'
                );
                assert.ok(!html.includes('<em>'), html);
                env.editor.innerHTML = html;
                const sup = env.editor.querySelector('sup.footnote-ref');
                assert.ok(sup, html);
                assert.strictEqual(sup!.getAttribute('data-footnote-label'), 'a_b_c');
                const ref = sup!.querySelector('a');
                assert.strictEqual(ref!.getAttribute('href'), '#fn-a_b_c');
                assert.strictEqual(ref!.getAttribute('id'), 'fnref-a_b_c');
                // 参照先の脚注一覧側の id と一致する（ジャンプが成立する）
                const li = env.editor.querySelector('section.footnotes li');
                assert.strictEqual(li!.getAttribute('id'), 'fn-a_b_c', html);
            });

            test('_ を含むラベルの脚注が往復する', () => {
                for (const md of [
                    // 斜体経路（(^|[^_])_([^_]+)_(?!_)）で壊れていたケース
                    '本文[^a_b_c]です。\n\n[^a_b_c]: 脚注の本文。',
                    // 太字経路（__(.+?)__ の非貪欲マッチが <sup> を跨ぐ）。修正前は
                    // `本文[^a<strong>b]です。` となり </strong> すら残らずラベルの
                    // 一部が消える、_ より重い壊れ方をしていた
                    '本文[^a__b]です。\n\n[^a__b]: 脚注の本文。',
                    // 強調が参照を跨ぐケース
                    '*強調[^a_b_c]中*\n\n[^a_b_c]: 脚注。'
                ]) {
                    env.editor.innerHTML = env.markdown.markdownToHtml(md);
                    const out = env.markdown
                        .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                        .replace(/\s+$/, '');
                    assert.strictEqual(out, md, `roundtrip: ${md}`);
                }
            });

            test('同一段落に複数の参照があっても番号採番が混ざらない', () => {
                // 退避のインデックス機構そのものの検証（隣接プレースホルダを含む）
                const html = env.markdown.markdownToHtml(
                    '本文[^a_1][^b_2]と[^a_1]です。\n\n[^a_1]: A\n[^b_2]: B'
                );
                env.editor.innerHTML = html;
                const refs = env.editor.querySelectorAll('sup.footnote-ref');
                assert.strictEqual(refs.length, 3, html);
                assert.strictEqual(refs[0].getAttribute('data-footnote-label'), 'a_1');
                assert.strictEqual(refs[1].getAttribute('data-footnote-label'), 'b_2');
                assert.strictEqual(refs[2].getAttribute('data-footnote-label'), 'a_1');
                assert.ok(!html.includes('<em>'), html);
                assert.ok(!/\u0004/.test(html), 'プレースホルダが残っている');
            });

            test('* はラベル文字ではないので脚注にならない（仕様確認）', () => {
                // ラベルは [A-Za-z0-9_-] に限定される。`[^a*b*c]` は脚注として
                // 成立せず、ただの段落テキストとして斜体変換されるだけ
                const html = env.markdown.markdownToHtml(
                    '本文[^a*b*c]です。\n\n[^a*b*c]: 脚注の本文。'
                );
                assert.ok(!html.includes('footnote-ref'), html);
                assert.ok(html.includes('<em>b</em>'), html);
            });

            test('data-footnote-blanks が無い <li> は従来どおり改行1つで連結する（後方互換）', () => {
                // この対応より前に生成されたHTMLが編集中のDOMに残っていても壊れない
                env.editor.innerHTML =
                    '<p>本文</p><section class="footnotes" data-footnotes="true"><ol>' +
                    '<li id="fn-a" data-footnote-label="a" data-footnote-sep=" ">A</li>' +
                    '<li id="fn-b" data-footnote-label="b" data-footnote-sep=" ">B</li>' +
                    '</ol></section>';
                const out = env.markdown
                    .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                    .replace(/\s+$/, '');
                assert.strictEqual(out, '本文\n\n[^a]: A\n[^b]: B');
            });

            test('data-footnote-blanks の不正値・巨大値でも保存経路が落ちない', () => {
                // 属性は自モジュールしか生成しないが、外部HTMLの貼り付けに備えて
                // クランプしている（巨大値だと String.repeat が RangeError を投げ、
                // 保存経路である htmlToMarkdown ごと落ちる）
                for (const [raw, expected] of [
                    ['abc', '本文\n\n[^a]: A\n[^b]: B'],
                    ['-3', '本文\n\n[^a]: A\n[^b]: B'],
                    ['99999999', '本文\n\n[^a]: A' + '\n'.repeat(21) + '[^b]: B']
                ]) {
                    env.editor.innerHTML =
                        '<p>本文</p><section class="footnotes" data-footnotes="true"><ol>' +
                        '<li id="fn-a" data-footnote-label="a" data-footnote-sep=" ">A</li>' +
                        '<li id="fn-b" data-footnote-label="b" data-footnote-sep=" "' +
                        ' data-footnote-blanks="' + raw + '">B</li>' +
                        '</ol></section>';
                    const out = env.markdown
                        .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                        .replace(/\s+$/, '');
                    assert.strictEqual(out, expected, `raw=${raw}`);
                }
            });

            test('定義同士の間の空行が往復で保たれる', () => {
                // 定義行は本文から取り除かれるが、定義の**間**にあった空行は
                // 本文側に残ってしまい、往復すると最初の定義の前へ集まっていた
                // （`\n\n[^x]: A\n\n[^y]: B` → `\n\n\n[^x]: A\n[^y]: B`）
                for (const md of [
                    '本文[^x]と[^y]です。\n\n[^x]: A\n[^y]: B',
                    '本文[^x]と[^y]です。\n\n[^x]: A\n\n[^y]: B',
                    '本文[^x]と[^y]です。\n\n[^x]: A\n\n\n[^y]: B',
                    '本文[^x]と[^y]と[^z]です。\n\n[^x]: A\n\n[^y]: B\n[^z]: C'
                ]) {
                    env.editor.innerHTML = env.markdown.markdownToHtml(md);
                    const out = env.markdown
                        .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                        .replace(/\s+$/, '');
                    assert.strictEqual(out, md, `roundtrip: ${md}`);
                }
            });

            test('文書の途中に書いた定義は末尾の脚注一覧へ集約される（既存の設計）', () => {
                // 脚注定義は本文から取り除かれ、文書末尾の脚注一覧セクションに
                // まとめられる（一般的なMarkdownの脚注と同じ挙動）。定義の位置は
                // 保たれないという既存仕様を、空行の保持対応で変えていないことの確認
                env.editor.innerHTML = env.markdown.markdownToHtml(
                    '本文[^x]です。\n\n[^x]: A\n\n後書き。'
                );
                const out = env.markdown
                    .htmlToMarkdown(env.markdown.getCleanHtmlFromEditor())
                    .replace(/\s+$/, '');
                assert.strictEqual(out, '本文[^x]です。\n\n\n後書き。\n\n[^x]: A');
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
                assert.ok(html.includes(
                    '<li id="fn-1" data-footnote-label="1" data-footnote-sep=" "><strong>重要</strong>な注釈。'
                ), html);
            });

            test('コードフェンス内の `[^1]: ...` は脚注定義として扱わない', () => {
                const html = env.markdown.markdownToHtml(
                    '```\n[^1]: これはコード例\n```'
                );
                assert.ok(html.includes('[^1]: これはコード例'), html);
                assert.ok(!html.includes('footnotes'), html);
            });

            test('YAML front matter内が`[^label]: ...`形式に一致しても脚注定義として剥がさない（front matterはコードフェンス同様に保護される）', () => {
                const html = env.markdown.markdownToHtml(
                    '---\n[^ref]: front matter内の行\n---\n\n本文[^ref]。\n\n[^ref]: 本物の定義。'
                );
                // front matter内の行は脚注定義として剥がされず、そのままpre内に残る
                assert.ok(
                    html.includes('<pre class="frontmatter-body">\n[^ref]: front matter内の行</pre>'),
                    html
                );
                // 文書末尾の本物の定義だけが脚注として認識される
                assert.ok(html.includes('<li id="fn-ref" data-footnote-label="ref"'), html);
                assert.ok(html.includes('本物の定義。'), html);
            });

            test('文書の1行目が参照済み脚注定義行の場合、除去後に偶然---で始まる行が現れても誤ってfront matterと認識しない（/local-review再指摘対応）', () => {
                // extractFootnoteDefinitionsは元の行配列（1行目は脚注定義行で"---"では
                // ない）に対してfront matter判定するため、除去後の行配列（contentLines）が
                // たまたま"---"で始まっていても、本文パースループはfront matterとして
                // 再判定しない（同じfront matter判定結果を共有する設計のため）。
                const html = env.markdown.markdownToHtml(
                    '[^1]: 参照される脚注\n---\na: 1\n---\n本文[^1]。'
                );
                assert.ok(!html.includes('frontmatter'), html);
                assert.ok(html.includes('<hr>'), html);
                assert.ok(html.includes('<p>a: 1</p>'), html);
            });

            test('同じラベルが複数定義された場合は最初の定義を脚注として使い、二番目は通常の段落として残す（データを失わない）', () => {
                const html = env.markdown.markdownToHtml(
                    '本文[^1]。\n\n[^1]: 最初の定義。\n[^1]: 二番目の定義（無視される）。'
                );
                assert.ok(html.includes(
                    '<li id="fn-1" data-footnote-label="1" data-footnote-sep=" ">最初の定義。'
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
                    { label: '1', sep: ' ', text: '定義1', blanksBefore: 0 },
                    { label: 'note', sep: ' ', text: '定義2', blanksBefore: 0 }
                ]);
                assert.strictEqual(result.labels.has('1'), true);
                assert.strictEqual(result.labels.has('note'), true);
                // 除去した定義行は単純に取り除かれる（リスト・引用・テーブルは各行自身が
                // 記法で自己申告するため、前後が直接隣接しても正しく結合される＝望ましい）。
                assert.deepStrictEqual(
                    Array.from(result.contentLines),
                    ['本文行[^1][^note]', '別の本文行']
                );
                // 除去によって隣接性が失われた位置（本文行の直後）はseamIndicesに記録される。
                // 定義リスト（scanDefListTerms）はこれを見て縫い目をまたいだ誤結合を避ける。
                assert.strictEqual(result.seamIndices.has(1), true);
                assert.strictEqual(result.seamIndices.size, 1);
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
                    { label: '3', sep: ' ', text: '本物の定義', blanksBefore: 0 }
                ]);
                assert.deepStrictEqual(Array.from(result.contentLines), [
                    '参照[^3]', '```', '[^1]: コード内', '```', '$$', '[^2]: 数式内', '$$'
                ]);
                // 末尾の[^3]定義行を除去した後に続く行は無い＝seamIndicesは記録されない
                assert.strictEqual(result.seamIndices.size, 0);
            });

            test('コロン直後の空白の個数をsepとしてそのまま保持する（0個・1個・2個以上）', () => {
                const result = env.markdown.extractFootnoteDefinitions([
                    '参照[^a][^b][^c]',
                    '[^a]:空白無し',
                    '[^b]: 空白1つ',
                    '[^c]:   空白3つ'
                ]);
                assert.deepStrictEqual(Array.from(result.defs, (d: any) => ({ ...d })), [
                    { label: 'a', sep: '', text: '空白無し', blanksBefore: 0 },
                    { label: 'b', sep: ' ', text: '空白1つ', blanksBefore: 0 },
                    { label: 'c', sep: '   ', text: '空白3つ', blanksBefore: 0 }
                ]);
            });

            test('定義同士の間の空行を blanksBefore として定義側へ付け替える', () => {
                const result = env.markdown.extractFootnoteDefinitions([
                    '参照[^a][^b][^c]',
                    '',
                    '[^a]: A',
                    '',
                    '[^b]: B',
                    '',
                    '',
                    '[^c]: C'
                ]);
                assert.deepStrictEqual(Array.from(result.defs, (d: any) => ({ ...d })), [
                    { label: 'a', sep: ' ', text: 'A', blanksBefore: 0 },
                    { label: 'b', sep: ' ', text: 'B', blanksBefore: 1 },
                    { label: 'c', sep: ' ', text: 'C', blanksBefore: 2 }
                ]);
                // 付け替えた空行は本文側に残らない（最初の定義の前の空行だけが残る）
                assert.deepStrictEqual(Array.from(result.contentLines), ['参照[^a][^b][^c]', '']);
            });

            test('定義の後に本文が続く場合、保留した空行は本文行として戻す', () => {
                const result = env.markdown.extractFootnoteDefinitions([
                    '参照[^a]',
                    '[^a]: A',
                    '',
                    '後書き'
                ]);
                assert.deepStrictEqual(Array.from(result.defs, (d: any) => ({ ...d })), [
                    { label: 'a', sep: ' ', text: 'A', blanksBefore: 0 }
                ]);
                assert.deepStrictEqual(Array.from(result.contentLines), ['参照[^a]', '', '後書き']);
            });

            test('文書が「定義＋空行」で終わる場合も空行を失わない', () => {
                const result = env.markdown.extractFootnoteDefinitions([
                    '参照[^a]',
                    '[^a]: A',
                    '',
                    ''
                ]);
                assert.deepStrictEqual(Array.from(result.contentLines), ['参照[^a]', '', '']);
            });

            test('定義間の空行が落ちても seam は次の本文行に立つ', () => {
                // 定義間の空行を contentLines から取り除くことで「本来隣接して
                // いなかった本文行同士が隣接する」ケースが増える。seamIndices が
                // 正しく立たないと scanDefListTerms 等が誤結合する（過去に2度回帰した領域）
                const result = env.markdown.extractFootnoteDefinitions([
                    'Term',
                    '[^a]: A',
                    '',
                    '[^b]: B',
                    ': Definition',
                    '',
                    '参照[^a][^b]'
                ]);
                assert.deepStrictEqual(
                    Array.from(result.contentLines),
                    ['Term', ': Definition', '', '参照[^a][^b]']
                );
                // 'Term' と ': Definition' は元々隣接していない＝index 1 に seam が立つ
                assert.deepStrictEqual(Array.from(result.seamIndices), [1]);
            });

            test('定義間に空行があっても定義リストへ誤結合しない（seam の実効確認）', () => {
                const md = 'Term\n[^a]: A\n\n[^b]: B\n: Definition\n\n参照[^a][^b]';
                const html = env.markdown.markdownToHtml(md);
                assert.ok(!html.includes('<dl>'), html);
            });
        });

        suite('buildFootnotesSectionHtml', () => {
            test('定義が無ければ空文字を返す', () => {
                assert.strictEqual(env.markdown.buildFootnotesSectionHtml([]), '');
            });

            test('data-footnote-blanksは空行がある定義にだけ付く', () => {
                const html = env.markdown.buildFootnotesSectionHtml([
                    { label: 'a', sep: ' ', text: 'A', blanksBefore: 0 },
                    { label: 'b', sep: ' ', text: 'B', blanksBefore: 2 }
                ]);
                assert.ok(!/id="fn-a"[^>]*data-footnote-blanks/.test(html), html);
                assert.ok(html.includes('data-footnote-blanks="2"'), html);
            });

            test('data-footnote-sepへ元の空白をそのまま埋め込む', () => {
                const html = env.markdown.buildFootnotesSectionHtml([
                    { label: '1', sep: '', text: '空白無し' },
                    { label: '2', sep: '   ', text: '空白3つ' }
                ]);
                assert.ok(html.includes('data-footnote-sep=""'), html);
                assert.ok(html.includes('data-footnote-sep="   "'), html);
            });
        });

        suite('定義リスト（Term / : Definition）', () => {
            test('用語行とその直後の定義行を<dl><dt><dd>へ変換する', () => {
                const html = env.markdown.markdownToHtml('用語\n: 定義本文');
                assert.strictEqual(html, '<dl><dt>用語</dt><dd data-def-sep=" ">定義本文</dd></dl>');
            });

            test('1つの用語に複数の定義行が続く場合は<dd>を複数生成する', () => {
                const html = env.markdown.markdownToHtml('用語\n: 定義1\n: 定義2');
                assert.strictEqual(
                    html,
                    '<dl><dt>用語</dt><dd data-def-sep=" ">定義1</dd>' +
                    '<dd data-def-sep=" ">定義2</dd></dl>'
                );
            });

            test('複数の用語行が同じ定義群を共有する場合は<dt>を複数生成する', () => {
                const html = env.markdown.markdownToHtml('用語A\n用語B\n: 共有の定義');
                assert.strictEqual(
                    html,
                    '<dl><dt>用語A</dt><dt>用語B</dt><dd data-def-sep=" ">共有の定義</dd></dl>'
                );
            });

            test('複数の用語・定義グループが連続する場合は1つの<dl>にまとめる', () => {
                const html = env.markdown.markdownToHtml('用語1\n: 定義1\n用語2\n: 定義2');
                assert.strictEqual(
                    html,
                    '<dl><dt>用語1</dt><dd data-def-sep=" ">定義1</dd>' +
                    '<dt>用語2</dt><dd data-def-sep=" ">定義2</dd></dl>'
                );
            });

            test('定義本文にもインライン記法（強調等）を適用する', () => {
                const html = env.markdown.markdownToHtml('用語\n: **重要**な定義');
                assert.strictEqual(
                    html,
                    '<dl><dt>用語</dt><dd data-def-sep=" "><strong>重要</strong>な定義</dd></dl>'
                );
            });

            test('直後に定義行が続かない通常行は定義リストとして扱わない（普通の段落のまま）', () => {
                const html = env.markdown.markdownToHtml('ただの本文\n続きの行');
                assert.ok(!html.includes('<dl>'), html);
                assert.ok(html.includes('<p>ただの本文<br>続きの行</p>'), html);
            });

            test('空行を挟むと別々の<dl>として分離される', () => {
                const html = env.markdown.markdownToHtml('用語A\n: 定義A\n\n用語B\n: 定義B');
                assert.strictEqual(
                    html,
                    '<dl><dt>用語A</dt><dd data-def-sep=" ">定義A</dd></dl>' +
                    '<dl><dt>用語B</dt><dd data-def-sep=" ">定義B</dd></dl>'
                );
            });

            test('空行を挟まず前の行に続けて定義リストが始まると、その行も共有の用語として扱われる（Pandoc等と同じ規則。分離したい場合は空行を挟む）', () => {
                const html = env.markdown.markdownToHtml('前置きの行\n用語\n: 定義');
                assert.strictEqual(
                    html,
                    '<dl><dt>前置きの行</dt><dt>用語</dt><dd data-def-sep=" ">定義</dd></dl>'
                );
            });

            test('コロン直後の空白の個数（0個・1個・3個）をdata-def-sepへそのまま保持する', () => {
                assert.ok(
                    env.markdown.markdownToHtml('用語\n:空白無し').includes('data-def-sep=""'),
                    '空白0個'
                );
                assert.ok(
                    env.markdown.markdownToHtml('用語\n:   空白3つ').includes('data-def-sep="   "'),
                    '空白3個'
                );
            });
        });

        suite('scanDefListTerms', () => {
            test('用語1つ・定義1つを読み取る', () => {
                const result = env.markdown.scanDefListTerms(['用語', ': 定義', '次の行'], 0);
                assert.deepStrictEqual(
                    { terms: Array.from(result.terms), afterTermsIndex: result.afterTermsIndex },
                    { terms: ['用語'], afterTermsIndex: 1 }
                );
            });

            test('直後に定義行が無ければnullを返す', () => {
                const result = env.markdown.scanDefListTerms(['ただの行', '別の行'], 0);
                assert.strictEqual(result, null);
            });

            test('見出し等の他ブロック開始行は用語として取り込まない', () => {
                const result = env.markdown.scanDefListTerms(['## 見出し', ': 定義'], 0);
                assert.strictEqual(result, null);
            });
        });

        suite('YAML front matter（文書先頭の折りたたみ表示）', () => {
            test('文書先頭の---〜---を折りたたみ可能なdivへ変換する', () => {
                const html = env.markdown.markdownToHtml('---\ntitle: サンプル\ndate: 2026-01-01\n---\n\n本文です。');
                assert.ok(html.includes('<div class="frontmatter">'), html);
                assert.ok(html.includes(
                    '<div class="frontmatter-header" contenteditable="false">' +
                    '<span class="frontmatter-toggle-icon">▶</span> Front Matter</div>'
                ), html);
                assert.ok(html.includes(
                    '<pre class="frontmatter-body">\ntitle: サンプル\ndate: 2026-01-01</pre>'
                ), html);
                assert.ok(html.includes('<p>本文です。</p>'), html);
            });

            test('先頭以外に現れる---は水平線として扱う（front matterと誤認しない）', () => {
                const html = env.markdown.markdownToHtml('本文\n\n---\n\n続き');
                assert.ok(!html.includes('frontmatter'), html);
                assert.ok(html.includes('<hr>'), html);
            });

            test('閉じの---が無ければfront matterとして扱わない（水平線として処理される）', () => {
                const html = env.markdown.markdownToHtml('---\ntitle: 閉じ忘れ');
                assert.ok(!html.includes('frontmatter'), html);
                assert.ok(html.includes('<hr>'), html);
            });

            test('中身が空のfront matterにも対応する', () => {
                const html = env.markdown.markdownToHtml('---\n---\n\n本文。');
                assert.ok(html.includes('<pre class="frontmatter-body">\n</pre>'), html);
            });

            test('中身が空行1つだけのfront matterは「本文0行」へ正規化される（既知の仕様。'
                + '.frontmatter-bodyはcontenteditableなためパース時の行数をdata属性で'
                + '保持するとユーザーの編集内容を誤って捨てるデータ消失リスクがあり見送った）', () => {
                const html = env.markdown.markdownToHtml('---\n\n---\n\n本文。');
                assert.ok(html.includes('<pre class="frontmatter-body">\n</pre>'), html);
            });

            test('YAML内の記号はインライン記法へ変換されない（**や_を含んでもそのまま）', () => {
                const html = env.markdown.markdownToHtml('---\ntags: [a_b, **not-bold**]\n---\n\n本文');
                assert.ok(
                    html.includes('<pre class="frontmatter-body">\ntags: [a_b, **not-bold**]</pre>'),
                    html
                );
                assert.ok(!html.includes('<strong>'), html);
                assert.ok(!html.includes('<em>'), html);
            });
        });

        suite('parseFrontMatter', () => {
            test('---で始まり---で閉じる区間を読み取る', () => {
                const result = env.markdown.parseFrontMatter(['---', 'a: 1', 'b: 2', '---', '本文']);
                assert.deepStrictEqual({ ...result }, { raw: 'a: 1\nb: 2', endIndex: 3 });
            });

            test('先頭が---でなければnullを返す', () => {
                assert.strictEqual(env.markdown.parseFrontMatter(['本文', '---']), null);
            });

            test('閉じの---が無ければnullを返す', () => {
                assert.strictEqual(env.markdown.parseFrontMatter(['---', 'a: 1']), null);
            });

            test('空配列でもnullを返す（例外を投げない）', () => {
                assert.strictEqual(env.markdown.parseFrontMatter([]), null);
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

        suite('定義リスト（dl/dt/dd）', () => {
            test('<dt><dd>をTerm / : Definitionへ復元する', () => {
                const md = env.markdown.htmlToMarkdown('<dl><dt>用語</dt><dd>定義本文</dd></dl>');
                assert.strictEqual(md, '用語\n: 定義本文\n');
            });

            test('複数の<dd>は複数の定義行として並べる', () => {
                const md = env.markdown.htmlToMarkdown(
                    '<dl><dt>用語</dt><dd>定義1</dd><dd>定義2</dd></dl>'
                );
                assert.strictEqual(md, '用語\n: 定義1\n: 定義2\n');
            });

            test('複数の<dt>が連続する場合は用語行を複数並べる（定義群の共有）', () => {
                const md = env.markdown.htmlToMarkdown(
                    '<dl><dt>用語A</dt><dt>用語B</dt><dd>共有の定義</dd></dl>'
                );
                assert.strictEqual(md, '用語A\n用語B\n: 共有の定義\n');
            });

            test('複数の用語・定義グループを出現順で並べる', () => {
                const md = env.markdown.htmlToMarkdown(
                    '<dl><dt>用語1</dt><dd>定義1</dd><dt>用語2</dt><dd>定義2</dd></dl>'
                );
                assert.strictEqual(md, '用語1\n: 定義1\n用語2\n: 定義2\n');
            });

            test('子要素が無ければ空文字を返す', () => {
                assert.strictEqual(env.markdown.htmlToMarkdown('<dl></dl>'), '');
            });

            test('data-def-sepが無いdd（この機能追加前のHTML等）は半角スペース1つへフォールバックする', () => {
                const md = env.markdown.htmlToMarkdown('<dl><dt>用語</dt><dd>定義</dd></dl>');
                assert.strictEqual(md, '用語\n: 定義\n');
            });

            test('data-def-sepの空白をそのまま復元する（0個・3個）', () => {
                const noSep = env.markdown.htmlToMarkdown(
                    '<dl><dt>用語</dt><dd data-def-sep="">定義</dd></dl>'
                );
                assert.strictEqual(noSep, '用語\n:定義\n');

                const threeSep = env.markdown.htmlToMarkdown(
                    '<dl><dt>用語</dt><dd data-def-sep="   ">定義</dd></dl>'
                );
                assert.strictEqual(threeSep, '用語\n:   定義\n');
            });
        });

        suite('YAML front matter（div.frontmatter）', () => {
            test('---\\n...\\n---へ復元する', () => {
                const md = env.markdown.htmlToMarkdown(
                    '<div class="frontmatter"><div class="frontmatter-header" contenteditable="false">' +
                    '<span class="frontmatter-toggle-icon">▶</span> Front Matter</div>' +
                    '<pre class="frontmatter-body">title: サンプル\ndate: 2026-01-01</pre></div>'
                );
                assert.strictEqual(md, '---\ntitle: サンプル\ndate: 2026-01-01\n---\n');
            });

            test('中身が空でも---\\n---として復元する', () => {
                const md = env.markdown.htmlToMarkdown(
                    '<div class="frontmatter"><div class="frontmatter-header" contenteditable="false">' +
                    '<span class="frontmatter-toggle-icon">▶</span> Front Matter</div>' +
                    '<pre class="frontmatter-body"></pre></div>'
                );
                assert.strictEqual(md, '---\n---\n');
            });

            test('折りたたみ状態（frontmatter-expandedクラスの有無）は復元結果に影響しない', () => {
                const expanded = env.markdown.htmlToMarkdown(
                    '<div class="frontmatter frontmatter-expanded">' +
                    '<div class="frontmatter-header" contenteditable="false">' +
                    '<span class="frontmatter-toggle-icon">▶</span> Front Matter</div>' +
                    '<pre class="frontmatter-body">a: 1</pre></div>'
                );
                assert.strictEqual(expanded, '---\na: 1\n---\n');
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

        test('脚注定義行のコロン直後の空白数（0個・1個・2個以上）が変換往復で保持される', () => {
            [
                '空白無し[^a]。\n\n[^a]:空白無し。\n',
                '空白1つ[^b]。\n\n[^b]: 空白1つ。\n',
                '空白3つ[^c]。\n\n[^c]:   空白3つ。\n'
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

        test('空行を挟まず段落中に脚注定義行があると、除去後に前後の行が誤って同じ段落へ結合されない（seamIndices対応）', () => {
            const html = env.markdown.markdownToHtml(
                'ref[^1]\n\nPara lineA\n[^1]: footnote text\nPara lineB'
            );
            assert.ok(html.includes('<p>Para lineA</p>'), html);
            assert.ok(html.includes('<p>Para lineB</p>'), html);
            assert.ok(!html.includes('Para lineA<br>Para lineB'), html);
        });

        test('定義リスト（Term / : Definition）が変換往復で保存される', () => {
            [
                '用語\n: 定義本文\n',
                '用語\n: 定義1\n: 定義2\n',
                '用語A\n用語B\n: 共有の定義\n',
                '用語1\n: 定義1\n用語2\n: 定義2\n',
                '定義に**強調**を含む用語\n: **重要**な定義\n'
            ].forEach(original => {
                const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(original));
                assert.strictEqual(rt, original, `roundtrip: ${JSON.stringify(original)}`);
            });
        });

        test('定義リストのコロン直後の空白数（0個・1個・3個）が変換往復で保持される', () => {
            [
                '用語\n:空白無し\n',
                '用語\n: 空白1つ\n',
                '用語\n:   空白3つ\n'
            ].forEach(original => {
                const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(original));
                assert.strictEqual(rt, original, `roundtrip: ${JSON.stringify(original)}`);
            });
        });

        test('YAML front matterが変換往復で保存される', () => {
            [
                '---\ntitle: サンプル\ndate: 2026-01-01\n---\n\n本文です。\n',
                '---\n---\n\n本文のみ。\n',
                '---\ntags: [a_b, **not-bold**]\n---\n\n本文\n'
            ].forEach(original => {
                const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(original));
                assert.strictEqual(rt, original, `roundtrip: ${JSON.stringify(original)}`);
            });
        });

        test('本文が空行1つだけのfront matterは往復で本文0行へ正規化される（既知の仕様。'
            + '.frontmatter-bodyがcontenteditableなため区別する情報をdata属性で保持すると'
            + 'ユーザー編集時にデータ消失リスクがあり、あえて実装していない）', () => {
            const original = '---\n\n---\n\n本文。\n';
            const rt = env.markdown.htmlToMarkdown(env.markdown.markdownToHtml(original));
            assert.strictEqual(rt, '---\n---\n\n本文。\n');
        });

        test('front matter本文の先頭行が空行でも変換往復で保持される（<pre>開始タグ直後のLFがパース時に無視される仕様への対処）', () => {
            const original = '---\n\ntitle: 先頭が空行\n---\n\n本文\n';
            const html = env.markdown.markdownToHtml(original);
            // 実際にHTMLパーサーを通した後の内容で検証する（htmlToMarkdownと同じ経路）。
            const rt = env.markdown.htmlToMarkdown(html);
            assert.strictEqual(rt, original);
        });

        test('用語と定義行の間に脚注定義行が挟まっても、無関係な行同士が定義リストとして誤結合されない（/local-review指摘対応）', () => {
            // 脚注定義行（[^1]: ...）は本文パース前にcontentLinesから除去されるため、
            // 除去後に前後の行が直接隣接し、scanDefListTermsが無関係な「用語」と
            // 「: 定義」を1つの定義リストへ誤って結合してしまう回帰があった。
            // 脚注は末尾へ再配置される既知の仕様上、周辺の改行までの完全往復は
            // 保証されない（上の「脚注定義が文書中程にある場合」テストと同じ理由）ため、
            // ここでは「誤って<dl>へ結合されないこと」と「内容が失われないこと」を検証する。
            const original = '参照[^1]する。\n\nTerm\n[^1]: 脚注の本文。\n: Definition\n';
            const html = env.markdown.markdownToHtml(original);
            assert.ok(!html.includes('<dl>'), html);
            const rt = env.markdown.htmlToMarkdown(html);
            assert.ok(rt.includes('Term'), rt);
            assert.ok(rt.includes(': Definition'), rt);
            assert.ok(rt.trim().endsWith('[^1]: 脚注の本文。'), rt);
        });

        test('リスト項目の間に脚注定義行が挟まっても1つのリストとして結合される（自己申告的な記法を持つブロックは縫い目の影響を受けない）', () => {
            const original = '参照[^1]。\n\n- item1\n[^1]: 脚注の本文。\n- item2\n';
            const html = env.markdown.markdownToHtml(original);
            assert.ok(/<ul[^>]*><li>item1<\/li><li>item2<\/li><\/ul>/.test(html), html);
        });

        test('引用行の間に脚注定義行が挟まっても1つの引用として結合される', () => {
            const original = '参照[^1]。\n\n> line1\n[^1]: 脚注の本文。\n> line2\n';
            const html = env.markdown.markdownToHtml(original);
            assert.ok(/<blockquote>line1<br>line2<\/blockquote>/.test(html), html);
        });

        test('段落継続も縫い目で止まる。脚注定義行を挟んだ直後の複数用語行が誤って前の段落へ吸収されず、正しく定義リストの共有用語として認識される（/local-review再指摘対応）', () => {
            // 段落継続ループがseamIndicesを見ていなかったため、TermAが本来のIntro側の
            // 段落へ誤って<br>結合され、後続のTermBだけが単独<dt>になる回帰があった。
            const html = env.markdown.markdownToHtml(
                'ref[^1]\n\nIntro line\nMoreIntro\n[^1]: footnote text\nTermA\nTermB\n: Def'
            );
            assert.ok(html.includes('<p>Intro line<br>MoreIntro</p>'), html);
            assert.ok(
                html.includes('<dl><dt>TermA</dt><dt>TermB</dt><dd data-def-sep=" ">Def</dd></dl>'),
                html
            );
        });

        test('複数の定義行(: )が続く途中に脚注定義行が挟まっても、縫い目より後ろの定義行は同じ用語へ結合されない（/local-review再指摘対応）', () => {
            const html = env.markdown.markdownToHtml(
                'ref[^1]\n\nTerm\n: Def1\n[^1]: footnote text\n: Def2'
            );
            assert.ok(html.includes('<dl><dt>Term</dt><dd data-def-sep=" ">Def1</dd></dl>'), html);
            assert.ok(html.includes('<p>: Def2</p>'), html);
        });

        test('1つの用語/定義グループの直後（縫い目）に別の用語/定義グループが続いても、同じ<dl>へ結合されず別の<dl>になる（/local-review再指摘対応）', () => {
            const html = env.markdown.markdownToHtml(
                'ref[^1]\n\nTerm1\n: Def1\n[^1]: footnote text\nTerm2\n: Def2'
            );
            assert.ok(html.includes(
                '<dl><dt>Term1</dt><dd data-def-sep=" ">Def1</dd></dl>' +
                '<dl><dt>Term2</dt><dd data-def-sep=" ">Def2</dd></dl>'
            ), html);
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
