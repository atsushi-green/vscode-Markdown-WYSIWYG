# コマンド・キーバインド一覧

## VS Codeコマンド（`package.json` contributes.commands）

| コマンドID | タイトル | 表示条件 |
|---|---|---|
| `markdown-wysiwyg-editor.openEditor` | Markdown: WYSIWYGエディタで開く | `resourceLangId == markdown`（コマンドパレットのみ。タイトルバーのボタンは廃止） |
| `markdown-wysiwyg-editor.openAsText` | Markdown: テキストエディタで開く | `resourceLangId == markdown`（コマンドパレット） |
| `markdown-wysiwyg-editor.toggleEditor` | Markdown: エディタ切り替え (WYSIWYG/テキスト) | `resourceLangId == markdown`（コマンドパレット） |
| `markdown-wysiwyg-editor.newMarkdownFile` | Markdown: 新しいWYSIWYGドキュメントを作成 | 常に表示 |

## VS Code キーバインド（`package.json` contributes.keybindings）

| コマンド | キー (Win/Linux) | キー (Mac) | 条件 |
|---|---|---|---|
| `markdown-wysiwyg-editor.toggleEditor` | `Ctrl+Shift+M` | `Cmd+Shift+M` | `resourceLangId == markdown` |

## Webview内キーボードショートカット

### 書式設定

| 機能 | Windows/Linux | macOS |
|---|---|---|
| 太字 | `Ctrl+B` | `Cmd+B` |
| 斜体 | `Ctrl+I` | `Cmd+I` |
| 下線 | `Ctrl+U` | `Cmd+U` |
| 取り消し線 | `Ctrl+Shift+X` | `Cmd+Shift+X` |
| リンクの挿入・編集 | `Ctrl+K` | `Cmd+K` |
| 目次(TOC)を挿入 | `Ctrl+Shift+O` | `Cmd+Shift+O` |

### 表示切り替え

| 機能 | Windows/Linux | macOS |
|---|---|---|
| Raw/プレビュー切替 | `Ctrl+/` | `Cmd+/` |

### 検索（Find Widget）

| 機能 | Windows/Linux | macOS |
|---|---|---|
| 検索を開く | `Ctrl+F` | `Cmd+F` |
| 次を検索 | `Enter` / `F3` / `Ctrl+G` | `Enter` / `F3` / `Cmd+G` |
| 前を検索 | `Shift+Enter` / `Shift+F3` / `Shift+Ctrl+G` | `Shift+Enter` / `Shift+F3` / `Shift+Cmd+G` |
| 大文字/小文字を区別 | `Alt+C` | `Opt+C` |
| 単語単位で検索 | `Alt+W` | `Opt+W` |
| 正規表現を使用 | `Alt+R` | `Opt+R` |
| 現在のマッチを置換 | 置換欄で `Enter` / 「置換」ボタン | 同左 |
| すべて置換 | 「全置換」ボタン | 同左 |
| 検索を閉じる | `Escape` | `Escape` |

検索ウィジェットには検索欄の下に置換欄がある。置換はリテラル（入力文字列そのまま。正規表現の `$&`/`$1` 等は展開されない）で、WYSIWYG／RAW（生Markdown）両モードで動作する。置換後は自動的に再検索してハイライトを更新する。

### テーブル内ナビゲーション

| キー | 動作 |
|---|---|
| `↑` / `↓` | 同じ列の上/下の行（ヘッダー行含む）へ移動 |
| `←` / `→` | セル端にキャレットがある場合、隣接セルへ移動 |
| `Tab` / `Shift+Tab` | 次/前のセルへ移動 |
| `Enter` | 同じ列の次の行へ移動 |

### エディタ内の自動変換トリガー

| 入力 | 動作 |
|---|---|
| 行頭 `- ` / `* ` + スペース | 箇条書きリストに変換 |
| 行頭 `1. ` + スペース | 番号付きリストに変換 |
| 行頭 `> ` + スペース | 引用ブロックに変換 |
| 引用ブロック内の行頭で `> ` + スペース | 1段深いネスト引用に変換 |
| 引用ブロックの末尾で `Enter` | 引用を抜けて後続の段落へ移動 |
| 引用ブロック内で `Shift+Enter` | 引用内で改行（`<br>`、引用を継続） |
| アラートbox本文の末尾で `Enter` | boxを抜けて後続の段落へ移動 |
| アラートbox本文の途中で `Enter`、または `Shift+Enter` | 本文内で改行（`<br>`、boxを継続） |
| `` ``` `` または `` ```lang `` の行でEnter | コードブロックに変換 |
| `---` / `***` / `___` の行でEnter | 水平線に変換（リスト項目内は無効） |
| `# `〜`###### ` の行でEnter | 見出し要素として確定 |
| インラインコード末尾で `→` | コード要素の外へキャレット移動 |
| リンクの内側へカーソルを移動 | 生Markdown（`[text](url)`）を薄く表示し直接編集可能に（外れると復帰） |
| リンクを通常クリック | キャレットを合わせるだけ（リンク先へ移動しない） |
| リンクを `Ctrl+クリック`（Mac: `Cmd+クリック`） | リンク先へ移動（`#slug` は該当見出しへスクロール、http/https/mailto は外部で開く） |
| `Ctrl+K` / `Cmd+K` | リンクの挿入・編集ダイアログを開く（選択テキストはリンクテキストの初期値、既存リンク内なら編集） |

## ツールバーのコマンド（`data-command` 属性経由）

`commands.executeCommand()` が処理するコマンド種別: `bold`, `italic`, `underline`, `strikethrough`, `h1`, `h2`, `h3`, `ul`, `ol`, `link`, `code`, `quote`, `toc`

すべてのコマンドがエディタ上部の書式ツールバーにボタンとして配置されている
（B / I / U / S ｜ H1 / H2 / H3 ｜ 箇条書き / 番号付き / 引用 ｜ リンク / コードブロック ｜ 目次(TOC)）。
ボタンは `mousedown` を抑止するため、クリックしてもエディタの選択範囲は失われない。
`toc`（目次の生成・挿入）は 📑 ボタン（`data-command="toc"`）とキーボードショートカット `Ctrl+Shift+O` / `Cmd+Shift+O` のどちらからでも実行できる。
