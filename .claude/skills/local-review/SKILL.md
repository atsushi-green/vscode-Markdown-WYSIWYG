---
name: local-review
description: 未コミットのワーキングツリー差分（新規ファイル含む）を第三者視点でレビューし、correctness バグ・回帰・品質問題を severity 付きで報告する。evolve サイクルのコードレビューフェーズで使う
context: fork
agent: Explore
---

## ブランチと直近の履歴（変更の意図の参考）

!`git branch --show-current && git log --oneline -5`

## 変更サマリ

!`git diff HEAD --stat`

## レビュー対象の差分（追跡済みファイル）

!`git diff HEAD`

## 新規ファイル（未追跡）の内容

!`git ls-files --others --exclude-standard | grep -v -e '^node_modules/' -e '^out/' -e '^dist/' | while read f; do echo "=== $f ==="; head -c 20000 "$f"; echo; done`

## 前提: このプロジェクトの規約

* VS Code 拡張機能の Markdown WYSIWYG エディタ。Webview 側ロジックは `media/modules/`、拡張機能側は `src/` に置く
* Markdown⇔HTML の双方向変換に触れる変更は、変換して戻したときに元の Markdown が保たれること（ラウンドトリップ）が必須要件
* `media/modules/` の変更には `src/test/unit/` のユニットテストが対応している必要がある

## タスク

上記の差分と新規ファイルを、実装者とは独立した第三者のコードレビュアーとして点検せよ。

**差分と新規ファイルがどちらも空の場合は「レビュー対象の変更なし」とだけ報告して終了すること。**

指摘は次の3分類で報告する（evolve サイクル側のトリアージに対応）:

### A. 今サイクルで修正すべき問題

correctness バグ（ロジック誤り・エッジケース・null/undefined 処理漏れ）、今回の変更が引き起こす回帰、ラウンドトリップを壊す変更、テストの明確な抜け

### B. スコープ外・既存問題（ROADMAP 送り候補）

今回の変更が原因ではない既存バグ、必須でない simplification / efficiency 改善

### C. 判断が分かれる・確信度の低い指摘

誤検知の可能性があるもの。理由と確信度を添える

各指摘には severity（high / medium / low）、該当ファイルと行（または diff 内の位置）、根拠を付けること。
**コードの修正は行わず、指摘のみ返すこと。** 差分が大きい場合は変更サマリを見て、ロジックを含むファイルを優先的に精査すること。
