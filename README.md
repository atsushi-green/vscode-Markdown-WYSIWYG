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
* **シンタックスハイライト**: コードブロック内のコードが自動的に色付け（Python、Bash、PowerShell、C、SQL対応）
* **リアルタイム同期**: WYSIWYGビューとMarkdownソースが常に同期
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

1. Markdownファイル（`.md`）を開く
2. エディタタイトルバーのアイコンをクリック、または
3. ファイルを右クリック →「エディターの再オープン...」→「Markdown WYSIWYG Editor」を選択

### 新しいMarkdownファイルを作成

1. コマンドパレット（Windows: `Ctrl+Shift+P`、macOS: `Cmd+Shift+P`）を開く
2. 「Markdown: 新しいWYSIWYGドキュメントを作成」を実行



## 📋 対応しているMarkdown記法

* 見出し（H1-H6）
* 太字、斜体、太字斜体
* リンク
* 箇条書きリスト・番号付きリスト
* コードブロック・インラインコード（シンタックスハイライト対応）
* 引用
* 段落と改行
* Mermaid図（ダイアグラム）

### 🎨 シンタックスハイライト対応言語

* Python
* Bash / Shell
* PowerShell
* C / C++
* SQL

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

## 🔧 設定

現在、特別な設定は不要です。インストール後すぐに使用できます。

## 🐛 既知の問題

* 複雑なMarkdown構文（テーブル、脚注など）は完全にサポートされていません
* 画像の挿入はまだサポートされていません（今後のアップデートで対応予定）
* シンタックスハイライトは限定された言語のみ対応（Python、Bash、PowerShell、C、SQL）

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

# テスト実行
npm run test

# VSIXパッケージ作成
npx @vscode/vsce package
```

### プロジェクト構造

```
vscode-Markdown-WYSIWYG-/
├── src/
│   ├── extension.ts           # 拡張機能エントリーポイント
│   ├── markdownEditor.ts      # カスタムエディタ実装
│   └── test/                  # テストコード
├── media/
│   ├── editor.js              # Webview JavaScript
│   ├── editor.css             # Webview スタイル
│   ├── mermaid.min.js         # Mermaid ライブラリ
│   ├── html2canvas.min.js     # 画像変換ライブラリ
│   └── *.min.js               # シンタックスハイライトライブラリ
├── dist/                      # ビルド出力
├── package.json               # パッケージ設定
├── tsconfig.json              # TypeScript設定
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
