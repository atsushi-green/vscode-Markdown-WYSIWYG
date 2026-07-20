# 自動開発ループ（`/evolve` × `/loop`）の運用

このリポジトリは、Claude Code のスキル [`.claude/skills/evolve/SKILL.md`](../.claude/skills/evolve/SKILL.md) を使って、機能追加・バグ修正を**半自動で少しずつ進める**運用をしています。このページは、その仕組みと運用方法を AI（Claude）と人間の双方に向けて説明します。

## 何が起きるのか

- `/evolve` スキル1回の実行 = **開発サイクル1周**です。1周で次を行います:
  1. `docs/ROADMAP.md`（機能バックログ）から項目を1つ選ぶ
  2. 実装する
  3. テストする（`check-types` / `lint` / `test:unit` / `compile`、必要なら統合テスト）
  4. **`/local-review` でサブエージェントによる客観レビューを行い、正当な指摘を修正する**
  5. ドキュメントを更新する
  6. `evolve/YYYYMMDD` ブランチに commit / push する
  7. バックログ（`ROADMAP.md` / `roadmap-done.md`）を更新する
- **1周＝1コミット**を原則とし、後から個別に `git revert` できるチェックポイントになります。
- **main には直接コミット・プッシュしません。** 作業は必ず `evolve/YYYYMMDD` ブランチで行い、main への取り込みは人間がレビューしてから行います。

## 実行方法

Claude Code の REPL で次のように起動します:

```
/loop 2h /evolve
```

- `/loop 2h /evolve` は「**2時間ごとに `/evolve` を1周実行する**」という指示です。
- `/loop` は **セッションローカル**なループです。Claude Code のセッション（ターミナル）を開いている間だけ動き、セッションを閉じると止まります。ディスクには保存されません。
- 間隔は変更できます（例: `/loop 1h /evolve` で1時間ごと、`/loop 30m /evolve` で30分ごと）。
- 恒久的にクラウドで回したい場合は `/loop` ではなく `/schedule`（cloud schedule）を使う選択肢もありますが、このリポジトリでは実機（VS Code 拡張機能開発ホスト）確認を伴う項目が多いため、基本はローカルの `/loop` 運用を想定しています。

### 1回だけ回したいとき

ループにせず、その場で1周だけ実行したい場合は `/evolve` を直接呼び出します。

## 成果物の確認・取り込み・巻き戻し（人間の作業）

ループがある程度進んだら、`evolve/YYYYMMDD` ブランチに対して次の操作ができます（1サイクル=1コミット）。

- **確認**: `git log --oneline main..HEAD` でサイクル一覧、`git diff main...HEAD` で全差分を見る
- **取り込み**: 内容が良ければ `git switch main && git merge evolve/YYYYMMDD && git push`（または GitHub で PR を作ってマージ）
- **一部だけやり直し**: `git revert <コミットハッシュ>` でそのサイクルだけ取り消す
- **全部やり直し**: main は無傷なので、`evolve/YYYYMMDD` ブランチを削除すれば次のループが新しいブランチで最初からやり直せる

## なぜこの形なのか（設計意図）

- **安全に中断できること**: `/loop` はセッションを閉じると止まるため、1周は必ず commit / push まで完結させ、途中状態を残しません。次の周は「新しいセッション相当」で始まる前提で、状態は SKILL.md とリポジトリのファイル（現在のブランチ・ROADMAP・未コミット変更の有無）だけから復元します。
- **人間のレビューを挟むこと**: すべて main と別ブランチに積むため、自動生成された変更を人間がまとめて確認してから取り込めます。
- **客観レビューを組み込むこと**: 実装したセッション自身の思い込みを避けるため、`/local-review`（検証をサブエージェントに委譲）を挟んでから commit します。`/code-review` は `disable-model-invocation` 指定でユーザーが手動起動する専用コマンドのため自動ループからは起動できず、代わりに同等のワーキングツリー差分レビューをループから起動できる `/local-review` を使っています。

## 関連ファイル

| ファイル | 役割 |
|---|---|
| [`.claude/skills/evolve/SKILL.md`](../.claude/skills/evolve/SKILL.md) | ループ1周の手順そのもの（このスキルが実行される） |
| [`docs/ROADMAP.md`](./ROADMAP.md) | 機能バックログ（ループが上から選ぶ・GitHub Pages 非公開） |
| [`docs/roadmap-done.md`](./roadmap-done.md) | 完了項目のアーカイブ（完了日・コミットハッシュ付き・非公開） |
| [`docs/changelog.md`](./changelog.md) | 実装の変遷（各コミットの要約） |
