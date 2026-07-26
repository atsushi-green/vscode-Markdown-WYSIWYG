# ドキュメント目次

Markdown WYSIWYG Editor 拡張機能の実装内容を機能単位・技術単位で整理したドキュメントです。
ソースコード（`src/`, `media/`）を実地に調査した内容をもとに作成しており、現在の実装状態を反映しています。

## 一覧

| ドキュメント | 内容 |
|---|---|
| [features.md](./features.md) | **できること・操作方法**（ユーザー向け。何ができて、どう使うか） |
| [architecture.md](./architecture.md) | **内部の仕組み**（開発者向け。全体構成・処理の流れ・変換の仕組みをmermaid図で解説） |
| [commands-and-shortcuts.md](./commands-and-shortcuts.md) | VS Codeコマンド・キーバインド・キーボードショートカットの一覧 |
| [changelog.md](./changelog.md) | git履歴に基づく実装の変遷 |

## 更新方針

新しい機能を追加した場合は、対応するドキュメントを更新してください（[AGENTS.md](../AGENTS.md) の「機能追加時の注意事項」も参照）。

## 公開サイト

このページと上表の4ファイルは [GitHub Pages](https://atsushi-green.github.io/vscode-Markdown-WYSIWYG/) として公開されます（`scripts/docs-site/build.js` がビルド）。[ROADMAP.md](./ROADMAP.md) と [roadmap-done.md](./roadmap-done.md)、[dev-loop.md](./dev-loop.md) は `/evolve` 自動開発ループ向けの内部ドキュメントのため公開対象外です。

## 自動開発ループ

このリポジトリは Claude Code の `/evolve` スキルを `/loop 6h /evolve` で回し、機能追加・バグ修正を半自動で少しずつ進めています。仕組みと運用方法（実行方法・成果物の取り込み・巻き戻し）は [dev-loop.md](./dev-loop.md) にまとめています。
