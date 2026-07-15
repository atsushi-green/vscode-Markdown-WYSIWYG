# コマンド・キーバインド一覧

## VS Codeコマンド（`package.json` contributes.commands）

| コマンドID | タイトル | 表示条件 |
|---|---|---|
| `markdown-wysiwyg-editor.openEditor` | Markdown: WYSIWYGエディタで開く | `resourceLangId == markdown`（コマンドパレット・`editor/title`メニュー） |
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
| 検索を閉じる | `Escape` | `Escape` |

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
| `` ``` `` または `` ```lang `` の行でEnter | コードブロックに変換 |
| `---` / `***` / `___` の行でEnter | 水平線に変換（リスト項目内は無効） |
| `# `〜`###### ` の行でEnter | 見出し要素として確定 |
| インラインコード末尾で `→` | コード要素の外へキャレット移動 |

## ツールバーのコマンド（`data-command` 属性経由）

`commands.executeCommand()` が処理するコマンド種別: `bold`, `italic`, `underline`, `strikethrough`, `h1`, `h2`, `h3`, `ul`, `ol`, `link`, `code`, `quote`

上記すべてがエディタ上部の書式ツールバーにボタンとして配置されている
（B / I / U ｜ H1 / H2 / H3 ｜ 箇条書き / 番号付き / 引用 ｜ リンク / コードブロック）。
ボタンは `mousedown` を抑止するため、クリックしてもエディタの選択範囲は失われない。
