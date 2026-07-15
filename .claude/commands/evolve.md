---
description: バックログから機能を1つ選び、実装→テスト→ドキュメント→commit/pushまでを1サイクル実行する
---

Markdown WYSIWYG エディタの自動開発サイクルを **1周だけ** 実行してください。
1周 = 「機能1つを選ぶ → 実装 → テスト → ドキュメント更新 → commit → push → バックログ更新」です。

## 0. 事前チェック（必ず最初に行う）

1. 現在のブランチを確認する。**main の上では絶対に作業しない。** 全ての作業は `evolve/` で始まる作業ブランチで行う:
   - すでに `evolve/*` ブランチにいる場合: そのまま続行する。upstream が設定済みなら `git pull --rebase` する（コンフリクトしたら中断して報告）
   - `main` にいる場合: `git pull --rebase` で最新化した後、`evolve/YYYYMMDD`（今日の日付）ブランチを作成して切り替える。ローカルに同名ブランチが既にあればそれに切り替える
   - それ以外のブランチにいる場合: 何もせず、その旨を報告してこのサイクルを終了する
2. `git status` を確認する。**コミットされていない変更が既にある場合は、新しい作業を始めない。**
   - 前回のループが途中で終わった形跡（実装済みだがテスト未完など）なら、その続き（テスト→ドキュメント→commit）から再開する
   - 自分の作業と無関係な変更（ユーザーの手作業らしきもの）が混ざっている場合は、何もせずその旨を報告してこのサイクルを終了する

## 1. 機能を選ぶ

- `docs/ROADMAP.md` を読み、優先度の高い順に最初の `todo` 項目を1つ選ぶ
- サイズ L の項目は着手せず、S/M の子項目に分割して ROADMAP.md を書き換えるだけで1サイクルとしてよい（その場合も commit/push する）
- todo が尽きていたら、既存機能の使い勝手やコードを見て新しい機能案を3〜5個 ROADMAP.md に追加し、その中から1つ着手する

## 2. 実装

- **1サイクル1機能。スコープを広げない。** 実装中に別の改善点を見つけたら、直さずに ROADMAP.md に todo として追記する
- 既存のコード規約に従う: Webview側のロジックは `media/modules/` に、拡張機能側は `src/` に置く。既存モジュールの書き方（コメント言語・命名）に合わせる
- Markdown⇔HTML の双方向変換に触れる場合は、変換して戻したときに元のMarkdownが保たれること（ラウンドトリップ）を必ず確認する

## 3. テスト（全て通るまで完了としない）

1. `media/modules/` を変更したら `src/test/unit/` にユニットテストを追加・更新する
2. 以下を順に実行し、全て成功させる:
   - `npm run check-types`
   - `npm run lint`
   - `npm run test:unit`
   - `npm run compile`
3. 失敗したら修正して再実行。**2回連続で同じ原因で失敗して解決の目処が立たない場合**は、変更を `git stash` で退避し、ROADMAP.md の該当項目を `blocked` にして理由を書き、そのことだけを commit してサイクルを終える
4. 統合テスト（`npm test`）はVS Code実機起動が必要なため、`src/markdownEditor.ts` や `src/extension.ts` を変更したサイクルでのみ実行する

## 4. ドキュメント更新（コード変更と同じサイクル内で行う）

変更内容に応じて以下を更新する:
- `README.md` — ユーザー向け機能説明
- `AGENTS.md` — 主要機能リスト・技術詳細
- `docs/features.md` / `docs/commands-and-shortcuts.md` — 該当する場合
- `docs/changelog.md` — 必ず1行追加（日付＋変更内容）
- `sample.md` — 新機能を実際に試せる例を追加

## 5. commit & push

1. `docs/ROADMAP.md` の該当項目を `done` に移し、完了日を記入する
2. 関連する変更をまとめて1コミットにする（**1サイクル=1コミット**。これが後から個別に revert できるチェックポイントになる）。コミットメッセージは既存の履歴に合わせて日本語で「〜の追加」「fix: 〜」の形式
3. `git push -u origin HEAD` で **現在の evolve ブランチに** push する。**main へ push しない。`--force` は絶対に使わない**
4. push後、ROADMAP.md の done 行にコミットハッシュを追記して amend せず追加コミットしてよい（または同一コミットに含める）

## 6. サイクル終了時の報告

以下を簡潔に報告する:
- 作業ブランチ名と、main から積み上がったコミット数（`git rev-list --count main..HEAD`）
- 実装した機能と主な変更ファイル
- テスト結果（各コマンドの成否）
- push したコミットのハッシュ
- ROADMAP.md の残り todo 件数と、次のサイクルで着手予定の項目

## 禁止事項

- **main への直接 commit / push / merge**（作業は必ず `evolve/*` ブランチで行い、main への取り込みはユーザーがレビュー後に行う）
- 履歴改変（rebase -i, force push, reset --hard）— evolve ブランチ上でも禁止
- 1サイクルで複数機能の同時実装
- テストが通っていない状態での commit/push
- ROADMAP.md にない大規模なリファクタリング（必要ならまず todo として提案する）

## 付録: レビューと巻き戻し（ユーザー向けメモ — Claude はこの節を実行しない）

ループがある程度進んだら、以下の手順で確認・取り込み・やり直しができる:

- **確認**: `git log --oneline main..HEAD` でサイクル一覧、`git diff main...HEAD` で全差分を見る（1サイクル=1コミット）
- **取り込み**: 内容が良ければ `git switch main && git merge evolve/YYYYMMDD && git push`（または GitHub で PR を作ってマージ）
- **一部だけやり直し**: evolve ブランチ上で `git revert <コミットハッシュ>` すれば、そのサイクルだけ取り消せる
- **全部やり直し**: `git switch main` してブランチを削除（`git branch -D evolve/YYYYMMDD` と `git push origin --delete evolve/YYYYMMDD`）。main は無傷なので、次のループは新しいブランチで最初からやり直せる
- マージ後に再度ループを回すと、新しい日付の `evolve/YYYYMMDD` ブランチが main から作られる
