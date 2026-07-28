/**
 * imagePaste.test.ts - クリップボード画像貼り付けの純粋関数のユニットテスト
 *
 * これらは vscode API に依存しないため jsdom ハーネス不要で直接importして検証できる。
 */
import * as assert from 'assert';
import * as path from 'path';
import {
    mimeToExtension,
    formatTimestamp,
    buildImageFilename,
    disambiguateFilename,
    toMarkdownRelativePath
} from '../../imagePaste';

suite('imagePaste（クリップボード画像保存の純粋関数）', () => {
    suite('mimeToExtension', () => {
        test('主要なMIMEを拡張子へ対応づける', () => {
            assert.strictEqual(mimeToExtension('image/png'), 'png');
            assert.strictEqual(mimeToExtension('image/jpeg'), 'jpg');
            assert.strictEqual(mimeToExtension('image/gif'), 'gif');
            assert.strictEqual(mimeToExtension('image/webp'), 'webp');
            assert.strictEqual(mimeToExtension('image/svg+xml'), 'svg');
        });

        test('パラメータ付き・大文字も許容する', () => {
            assert.strictEqual(mimeToExtension('image/PNG'), 'png');
            assert.strictEqual(mimeToExtension('image/jpeg; codecs=foo'), 'jpg');
        });

        test('未知・空のMIMEは png へフォールバック', () => {
            assert.strictEqual(mimeToExtension('application/octet-stream'), 'png');
            assert.strictEqual(mimeToExtension(''), 'png');
            assert.strictEqual(mimeToExtension(undefined as unknown as string), 'png');
        });
    });

    suite('formatTimestamp / buildImageFilename', () => {
        test('YYYYMMDD-HHmmss へゼロ埋めして整形する', () => {
            const d = new Date(2026, 6, 20, 9, 3, 5); // 2026-07-20 09:03:05 ローカル
            assert.strictEqual(formatTimestamp(d), '20260720-090305');
        });

        test('ファイル名は image-<ts>.<ext> 形式', () => {
            const d = new Date(2026, 11, 1, 23, 59, 9);
            assert.strictEqual(buildImageFilename(d, 'png'), 'image-20261201-235909.png');
        });
    });

    suite('disambiguateFilename', () => {
        test('衝突が無ければそのまま返す', () => {
            assert.strictEqual(
                disambiguateFilename('image-x.png', ['other.png']), 'image-x.png'
            );
        });

        test('衝突する場合は拡張子の手前に -1, -2 … を付ける', () => {
            assert.strictEqual(
                disambiguateFilename('image-x.png', ['image-x.png']), 'image-x-1.png'
            );
            assert.strictEqual(
                disambiguateFilename('image-x.png', ['image-x.png', 'image-x-1.png']),
                'image-x-2.png'
            );
        });

        test('拡張子が無い名前でも衝突回避する', () => {
            assert.strictEqual(disambiguateFilename('image', ['image']), 'image-1');
        });
    });

    // path 実装を明示的に注入し、テストの結果が**実行プラットフォームに依存しない**
    // ようにする（既定引数のままだと macOS/Linux 向けの期待値が Windows 実行で落ちる）。
    suite('toMarkdownRelativePath（POSIX）', () => {
        test('同じフォルダならファイル名だけ', () => {
            assert.strictEqual(
                toMarkdownRelativePath(
                    '/home/user/docs', '/home/user/docs/image-1.png', path.posix
                ),
                'image-1.png'
            );
        });

        test('サブフォルダは POSIX 区切りの相対パス', () => {
            assert.strictEqual(
                toMarkdownRelativePath(
                    '/home/user/docs', '/home/user/docs/assets/image-1.png', path.posix
                ),
                'assets/image-1.png'
            );
        });

        test('上位フォルダへの相対も表現できる', () => {
            assert.strictEqual(
                toMarkdownRelativePath(
                    '/home/user/docs/sub', '/home/user/docs/image-1.png', path.posix
                ),
                '../image-1.png'
            );
        });

        test('`\\` をファイル名の文字として保つ（区切りに化けさせない）', () => {
            // macOS/Linux では `\` はファイル名に使える普通の文字。`\` も区切りとして
            // 分解する旧実装（split(/[\\/]/)）では `a\b.png` が `a/b.png` という
            // 別パスへ化けていた。この2件が本サイクルの回帰テスト
            assert.strictEqual(
                toMarkdownRelativePath(
                    '/home/user/docs', '/home/user/docs/a\\b.png', path.posix
                ),
                'a\\b.png'
            );
            assert.strictEqual(
                toMarkdownRelativePath(
                    '/home/user/docs', '/home/user/docs/assets/a\\b.png', path.posix
                ),
                'assets/a\\b.png'
            );
        });
    });

    suite('toMarkdownRelativePath（Windows）', () => {
        // Windows のファイル名に `\` は使えないため、`\` を区切りとして分解しても
        // ファイル名を壊さない。これらは旧実装でも通る＝回帰テストではなく、
        // POSIX 側の修正で Windows の正規化を壊していないことの裏付け
        test('区切りの `\\` を `/` へ正規化する', () => {
            assert.strictEqual(
                toMarkdownRelativePath(
                    'C:\\docs', 'C:\\docs\\assets\\img.png', path.win32
                ),
                'assets/img.png'
            );
        });

        test('入力に `/` が混ざっていても `\\` 区切りへ正規化されてから変換される', () => {
            // docstring が根拠にしている「path.relative の戻り値は必ず sep 区切り」
            // という前提そのものの裏付け（win32 は入力の `/` を `\` へ正規化する）
            assert.strictEqual(
                toMarkdownRelativePath(
                    'C:\\docs', 'C:\\docs/assets/img.png', path.win32
                ),
                'assets/img.png'
            );
        });

        test('上位フォルダへの相対も POSIX 区切りで返す', () => {
            assert.strictEqual(
                toMarkdownRelativePath(
                    'C:\\docs\\sub', 'C:\\docs\\img.png', path.win32
                ),
                '../img.png'
            );
        });
    });
});
