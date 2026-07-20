/**
 * imagePaste.ts - クリップボード画像の貼り付け（保存）に使う純粋関数群
 *
 * vscode API に依存しない小さなヘルパだけを置き、拡張機能側
 * （`markdownEditor.ts` の `saveClipboardImage`）とユニットテストの双方から使う。
 * ファイル書き込み等の副作用は呼び出し側（拡張機能）が担う。
 */
import * as path from 'path';

// MIMEタイプ → 拡張子の対応表。未知のMIMEは 'png' にフォールバックする。
const MIME_TO_EXT: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'image/tiff': 'tiff'
};

/**
 * 画像のMIMEタイプからファイル拡張子を導く。
 * `image/png` → `png`、`image/jpeg` → `jpg` など。パラメータ付き
 * （`image/png; codecs=...`）や大文字も許容し、未知のMIMEは `png` を返す。
 */
export function mimeToExtension(mime: string): string {
    const key = String(mime || '').toLowerCase().split(';')[0].trim();
    return MIME_TO_EXT[key] || 'png';
}

/**
 * 日時を `YYYYMMDD-HHmmss` 形式の文字列にする（ローカルタイム）。
 * ファイル名の一意性のもとになる。
 */
export function formatTimestamp(date: Date): string {
    const p2 = (n: number) => String(n).padStart(2, '0');
    return (
        String(date.getFullYear()) +
        p2(date.getMonth() + 1) +
        p2(date.getDate()) +
        '-' +
        p2(date.getHours()) +
        p2(date.getMinutes()) +
        p2(date.getSeconds())
    );
}

/**
 * 画像ファイル名を組み立てる（`image-<YYYYMMDD-HHmmss>.<ext>`）。
 */
export function buildImageFilename(date: Date, ext: string): string {
    return `image-${formatTimestamp(date)}.${ext}`;
}

/**
 * 既存ファイル名と衝突する場合、拡張子の手前に `-1`, `-2`, … を付けて
 * 衝突しない名前を返す純粋関数。衝突しなければそのまま返す。
 * 例: `image-….png` が既にあれば `image-…-1.png`。
 */
export function disambiguateFilename(name: string, existing: string[]): string {
    const set = new Set(existing);
    if (!set.has(name)) {
        return name;
    }
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let i = 1;
    let candidate = `${base}-${i}${ext}`;
    while (set.has(candidate)) {
        i++;
        candidate = `${base}-${i}${ext}`;
    }
    return candidate;
}

/**
 * ドキュメントのあるディレクトリから画像ファイルへの相対パスを、
 * Markdownの `![](…)` に埋め込める **POSIX区切り**（`/`）で返す純粋関数。
 * 同じフォルダならファイル名だけになる。Windowsの `\` も `/` に正規化する。
 *
 * @param docDir  ドキュメントのあるディレクトリの絶対パス
 * @param absFilePath 保存した画像ファイルの絶対パス
 */
export function toMarkdownRelativePath(docDir: string, absFilePath: string): string {
    const rel = path.relative(docDir, absFilePath);
    return rel.split(/[\\/]/).join('/');
}
