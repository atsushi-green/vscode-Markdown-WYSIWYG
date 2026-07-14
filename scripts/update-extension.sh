#!/bin/bash
# =============================================================
# Markdown WYSIWYG Editor 拡張機能を一発更新するスクリプト (Mac用)
#
# 使い方:
#   bash scripts/update-extension.sh
#
# やること:
#   1. 依存関係のインストール
#   2. ビルド & VSIXパッケージ作成
#   3. VS Codeへ強制再インストール
# =============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

VSIX_NAME="markdown-wysiwyg-editor.vsix"

# --- code CLI を探す（PATHに無ければアプリ内のバイナリを使う） ---
if command -v code >/dev/null 2>&1; then
    CODE_CLI="code"
elif [ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
    CODE_CLI="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
elif [ -x "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
    CODE_CLI="$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
else
    echo "[ERROR] VS Code の code コマンドが見つかりません。" >&2
    echo "        VS Codeのコマンドパレットで「Shell Command: Install 'code' command in PATH」を実行してください。" >&2
    exit 1
fi

echo "==> (1/3) 依存関係をインストール中..."
npm install

echo "==> (2/3) ビルド & パッケージ作成中..."
npx --yes @vscode/vsce package --out "$VSIX_NAME"

echo "==> (3/3) VS Code へインストール中..."
"$CODE_CLI" --install-extension "$VSIX_NAME" --force

echo ""
echo "✅ 更新完了: $VSIX_NAME をインストールしました。"
echo "   VS Code を開いている場合は、コマンドパレットから「Developer: Reload Window」"
echo "   を実行するか、VS Code を再起動して反映してください。"
