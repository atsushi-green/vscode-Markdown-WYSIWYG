# Markdown WYSIWYG Editor

VS Code上でMarkdownファイルをWYSIWYG（What You See Is What You Get）形式で編集できる拡張機能です。

![Version](https://img.shields.io/badge/version-0.0.1-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.108.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 特徴

* **直感的なWYSIWYG編集**: Markdownの構文を意識せずに、見たままの状態で編集可能
* **Mermaid図のサポート**: ダイアグラムのリアルタイムプレビューと編集
  * 分割表示モード（ソースコードとプレビューの同時表示）
  * 高解像度PNG画像としてエクスポート（4x スケール）
  * クリップボードへの画像コピー
* **リッチテキストツールバー**: 太字、斜体、見出し、リスト、リンク、コードブロック、引用などをボタン一つで挿入
* **数式（KaTeX）**: インライン数式（`$E = mc^2$`）とブロック数式（`$$` で囲む）を表示。通常のドル記号を書きたいときは `\$100` のようにエスケープします
* **シンタックスハイライト**: コードブロック内のコードが自動的に色付け（JavaScript/TypeScript/JSON/YAML/Go/Rust など約36言語 + 自動判定）
* **リアルタイム同期**: WYSIWYGビューとMarkdownソースが常に同期
* **リンクの生Markdown表示**: リンクの内側にカーソルを置いている間だけ `[text](url)` の生Markdownを薄く表示し、URLやリンクテキストをその場で修正可能（カーソルを外すとリンク表示へ戻る）
* **リンクのクリック挙動**: 通常クリックはカーソルを合わせるだけで、`Ctrl`（Mac: `Cmd`）+クリックでリンク先を開く（VS Codeエディタ本体と同じ操作感）
* **リンクの挿入・編集**: `Ctrl+K`（Mac: `Cmd+K`）またはツールバーのリンクボタンでダイアログを表示。選択テキストのリンク化、既存リンクのテキスト・URLの編集、リンク解除ができます
* **単語数・文字数表示**: エディタ右下に現在の単語数と文字数（空白を除く）をリアルタイム表示
* **目次(TOC)の自動生成**: 見出しから目次を生成して挿入（ツールバーの 📑 ボタン、または `Ctrl+Shift+O`）。GitHub風のアンカーリンク付きで、リンクを `Ctrl`（Mac: `Cmd`）+クリックすると該当見出しへスクロール
* **キーボードショートカット**: `Ctrl+B`（太字）、`Ctrl+I`（斜体）など、一般的なショートカットをサポート
* **VS Codeテーマに対応**: エディタのカラーテーマに自動的に適応

## 🚀 使い方

### インストール（開発版）

このプロジェクトはまだMarketplaceに公開されていないため、ソースからビルドしてインストールする必要があります。

#### Windows の場合

1. **前提条件のインストール**
   - [Node.js](https://nodejs.org/)（v18以上）をインストール
   - [VS Code](https://code.visualstudio.com/)（v1.108.0以上）をインストール
   - PowerShellまたはコマンドプロンプトを開く

2. **リポジトリのクローンと依存関係のインストール**
   ```powershell
   # リポジトリをクローン
   git clone https://github.com/your-username/markdown-wysiwyg-editor.git
   cd markdown-wysiwyg-editor

   # 依存関係をインストール
   npm install
   ```

3. **拡張機能のビルド**
   ```powershell
   # プロダクションビルド
   npm run package
   ```

4. **VSIXパッケージの作成とインストール**
   ```powershell
   # vsce（VS Code Extension Manager）をインストール
   npm install -g @vscode/vsce

   # VSIXパッケージを作成
   vsce package

   # VS Codeで拡張機能をインストール
   # 方法1: コマンドライン
   code --install-extension markdown-wysiwyg-editor-0.0.1.vsix

   # 方法2: VS Code UI
   # VS Code > 拡張機能（Ctrl+Shift+X） > ･･･メニュー > VSIXからインストール
   ```

#### macOS の場合

1. **前提条件のインストール**
   ```bash
   # Homebrewがインストールされていない場合
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

   # Node.jsをインストール
   brew install node

   # VS Codeをインストール（既にインストール済みの場合はスキップ）
   brew install --cask visual-studio-code
   ```

2. **リポジトリのクローンと依存関係のインストール**
   ```bash
   # リポジトリをクローン
   git clone https://github.com/your-username/markdown-wysiwyg-editor.git
   cd markdown-wysiwyg-editor

   # 依存関係をインストール
   npm install
   ```

3. **拡張機能のビルド**
   ```bash
   # プロダクションビルド
   npm run package
   ```

4. **VSIXパッケージの作成とインストール**
   ```bash
   # vsce（VS Code Extension Manager）をインストール
   npm install -g @vscode/vsce

   # VSIXパッケージを作成
   vsce package

   # VS Codeで拡張機能をインストール
   # 方法1: コマンドライン
   code --install-extension markdown-wysiwyg-editor-0.0.1.vsix

   # 方法2: VS Code UI
   # VS Code > 拡張機能（Cmd+Shift+X） > ･･･メニュー > VSIXからインストール
   ```

#### 開発モードでの実行（Windows/macOS共通）

拡張機能の開発やデバッグを行う場合:

```bash
# プロジェクトディレクトリで VS Code を開く
code .

# VS Code内で F5 キーを押す
# 新しい「拡張機能開発ホスト」ウィンドウが開きます
```

### 既存のMarkdownファイルを開く

1. Markdownファイル（`.md`）を開く（既定でWYSIWYGエディタで開きます）
2. テキストエディタで開いている場合にWYSIWYGへ切り替えるには、`Ctrl+Shift+M`（Mac: `Cmd+Shift+M`）、コマンドパレット（`Ctrl+Shift+P`）から「Markdown: WYSIWYGエディタで開く」、またはファイルを右クリック →「エディターの再オープン...」→「Markdown WYSIWYG Editor」

### 新しいMarkdownファイルを作成

1. コマンドパレット（Windows: `Ctrl+Shift+P`、macOS: `Cmd+Shift+P`）を開く
2. 「Markdown: 新しいWYSIWYGドキュメントを作成」を実行



## 📋 対応しているMarkdown記法

* 見出し（H1-H6）
* 太字、斜体、太字斜体、下線、取り消し線（`~~text~~`）
* リンク
* 箇条書きリスト・番号付きリスト
* タスクリスト（`- [ ]` / `- [x]`、チェックボックスをクリックで切り替え。入力中も `- [ ]` / `- []` / `-[]` を打った時点でチェックボックス化）
* コードブロック・インラインコード（シンタックスハイライト対応）
* 引用（`> >` によるネスト対応）
* GitHubアラート（`> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` をタイプ別に色分け表示。本文末尾で `Enter` を押すとboxを抜けて次の段落へ、本文の途中では改行）
* 水平線（`---`、行末でEnterを押すと自動変換）
* 段落と改行
* Mermaid図（ダイアグラム）

### 🎨 シンタックスハイライト対応言語

highlight.js の commonビルドを同梱しており、約36言語に対応しています。主なもの:

* JavaScript / TypeScript（`js` / `ts`）
* JSON / YAML（`yml`）
* Go（`golang`）/ Rust（`rs`）
* Python / Ruby / Java / C / C++ / C#
* Bash / Shell / PowerShell / SQL

上記以外の言語や、言語指定がない場合も自動判定でハイライトされます。

### 📊 Mermaid図の使い方

Mermaid記法を使用してダイアグラムを作成できます。

1. **Mermaid図の作成**
   ````markdown
   ```mermaid
   graph TD
       A[開始] --> B{条件}
       B -->|Yes| C[処理1]
       B -->|No| D[処理2]
       C --> E[終了]
       D --> E
   ```
   ````

2. **表示モードの切り替え**
   - 👁️ ボタン: プレビューのみ表示
   - ⊞ ボタン: ソースコードとプレビューを分割表示

3. **画像のエクスポート**
   - 図を右クリック →「クリップボードに画像をコピー」または「PNGとして保存」
   - 高解像度（4倍スケール）で保存されます

## ⌨️ キーボードショートカット

### 書式設定

| ショートカット | 機能 | Windows | macOS |
|--------------|------|---------|--------|
| 太字 | テキストを太字に | `Ctrl+B` | `Cmd+B` |
| 斜体 | テキストを斜体に | `Ctrl+I` | `Cmd+I` |
| 下線 | テキストに下線 | `Ctrl+U` | `Cmd+U` |
| 取り消し線 | テキストに取り消し線 | `Ctrl+Shift+X` | `Cmd+Shift+X` |
| 目次を挿入 | 見出しから目次(TOC)を生成して挿入 | `Ctrl+Shift+O` | `Cmd+Shift+O` |

### 表示切り替え

| ショートカット | 機能 | Windows | macOS |
|--------------|------|---------|--------|
| Raw/プレビュー切替 | マークダウンソースとプレビューの切り替え | `Ctrl+/` | `Cmd+/` |

### 検索

| ショートカット | 機能 | Windows | macOS |
|--------------|------|---------|--------|
| 検索を開く | 検索ウィジェットを表示 | `Ctrl+F` | `Cmd+F` |
| 次を検索 | 次の検索結果へ | `F3` または `Ctrl+G` | `F3` または `Cmd+G` |
| 前を検索 | 前の検索結果へ | `Shift+F3` または `Shift+Ctrl+G` | `Shift+F3` または `Shift+Cmd+G` |
| 大文字/小文字 | 大文字小文字を区別 | `Alt+C` | `Opt+C` |
| 単語単位 | 単語単位で検索 | `Alt+W` | `Opt+W` |
| 正規表現 | 正規表現モード | `Alt+R` | `Opt+R` |
| 置換 | 現在のマッチを置換 | 置換欄で `Enter` | 置換欄で `Enter` |
| すべて置換 | 全マッチを一括置換 | 「全置換」ボタン | 「全置換」ボタン |

検索ウィジェットの下段に置換欄があり、WYSIWYG／生Markdown両モードで置換できます（置換文字列はリテラル）。

## 🔧 設定

現在、特別な設定は不要です。インストール後すぐに使用できます。

## 🐛 既知の問題

* 複雑なMarkdown構文（テーブル、脚注など）は完全にサポートされていません
* 画像の挿入はまだサポートされていません（今後のアップデートで対応予定）
* シンタックスハイライトは同梱の highlight.js（commonビルド）が対応する約36言語＋自動判定に限られます

## 🛠️ 開発者向け情報

### ビルドコマンド一覧

```bash
# 依存関係のインストール
npm install

# 型チェック
npm run check-types

# リント
npm run lint

# 開発ビルド（監視モード）
npm run watch

# プロダクションビルド
npm run package

# テスト実行（ユニット + 統合）
npm run test:all

# VSIXパッケージ作成
npx @vscode/vsce package
```

### テスト

テストは2層構成です。

| コマンド | 種類 | 内容 |
|---------|------|------|
| `npm run test:unit` | ユニットテスト | jsdom上でWebviewモジュールを検証（VS Code不要・高速） |
| `npm run test` | 統合テスト | VS Code本体を起動して拡張機能を検証 |
| `npm run test:all` | 両方 | ユニットテスト → 統合テストの順に実行 |

**ユニットテスト**（`src/test/unit/`）は、`media/modules/` 配下のWebviewモジュールを
jsdomで構築したWebview相当のDOM環境に読み込んで検証します。

* `markdown.test.ts`: Markdown⇔HTMLの相互変換（見出し、装飾、リスト、引用、コードブロック、テーブル）、変換の往復で内容が保存されること、HTMLエスケープ
* `table.test.ts`: テーブルの行・列の追加/削除、キーボードによるセル移動、コピー、Markdownへの書き戻し
* `search.test.ts`: 検索、各検索オプション（大文字小文字/単語単位/正規表現）、マッチ間のナビゲーション
* `utils.test.ts`: 改行コード正規化、カーソル位置の保存/復元などの共通処理

**統合テスト**（`src/test/extension.test.ts`）は、`@vscode/test-cli` で実際のVS Codeを
起動し、コマンドの登録、WYSIWYGエディタとテキストエディタの切り替え、ドキュメントへの
書き戻し（変更箇所のみの最小範囲編集・改行コードの保持）を検証します。

テストを追加・変更した場合は、`npm run test:all` がすべてパスすることを確認してください。

### プロジェクト構造

```
vscode-Markdown-WYSIWYG-/
├── src/
│   ├── extension.ts           # 拡張機能エントリーポイント
│   ├── markdownEditor.ts      # カスタムエディタ実装
│   └── test/
│       ├── extension.test.ts  # 統合テスト（VS Code起動）
│       └── unit/              # ユニットテスト（jsdom）
├── media/
│   ├── editor.js              # Webview エントリーポイント
│   ├── modules/               # Webview モジュール群
│   │   ├── state.js           # グローバル状態管理
│   │   ├── utils.js           # 共通ユーティリティ
│   │   ├── markdown.js        # Markdown⇔HTML 変換
│   │   ├── mermaid.js         # Mermaid図の描画・エクスポート
│   │   ├── table.js           # テーブル編集
│   │   ├── search.js          # 検索ウィジェット
│   │   └── commands.js        # 書式コマンド・ライブ変換
│   ├── editor.css             # Webview スタイル
│   ├── mermaid.min.js         # Mermaid ライブラリ
│   ├── html2canvas.min.js     # 画像変換ライブラリ
│   └── *.min.js               # シンタックスハイライトライブラリ
├── dist/                      # ビルド出力
├── package.json               # パッケージ設定
├── tsconfig.json              # TypeScript設定
├── .vscode-test.mjs           # 統合テスト設定
└── esbuild.js                 # ビルド設定
```

### トラブルシューティング

#### ビルドエラーが発生する

```bash
# node_modules を削除して再インストール
rm -rf node_modules package-lock.json  # macOS/Linux
# または
rmdir /s node_modules & del package-lock.json  # Windows

npm install
```

#### 拡張機能が動作しない

1. VS Codeのバージョンを確認（v1.108.0以上が必要）
2. 開発者ツールを開いてエラーを確認
   - Windows: `Ctrl+Shift+I` または `Help > Toggle Developer Tools`
   - macOS: `Cmd+Opt+I` または `Help > Toggle Developer Tools`
3. 拡張機能を再インストール

#### VSIXパッケージ作成時のエラー

`vsce` がインストールされていない場合:

```bash
npm install -g @vscode/vsce
```

#### Mermaid図が表示されない

1. ブラウザのコンソールを確認（開発者ツール）
2. `mermaid.min.js` が正しく読み込まれているか確認
3. Mermaid構文にエラーがないか確認

## 📝 変更履歴

詳細は[CHANGELOG.md](CHANGELOG.md)を参照してください。

## 📮 サポート

問題や質問がある場合は、[GitHubのIssue](https://github.com/your-username/markdown-wysiwyg-editor/issues)で報告してください。
