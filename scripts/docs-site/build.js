'use strict';

/**
 * docs/ 以下から「公開用ドキュメント」だけを選び、GitHub Pages向けの静的サイトを生成する。
 *
 * Markdown→HTML変換には、Webview（拡張機能本体）が実際に使っている
 * media/modules/markdown.js の markdownToHtml をそのまま再利用する（render-markdown.js）。
 * 見た目も media/editor.css をそのまま読み込むため、生成されるページは
 * VS Code上のWYSIWYGエディタと同じ規則・同じCSSでレンダリングされる。
 *
 * 公開対象外（docs/ROADMAP.md, docs/roadmap-done.md）は `/evolve` 自動開発ループ用の
 * 内部バックログのため、ユーザー向けドキュメントサイトには含めない。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadMarkdownModule } = require('./render-markdown');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, '_site');
const DEFAULT_REPO_SLUG = 'atsushi-green/vscode-Markdown-WYSIWYG';

// 公開するドキュメント（上から順にサイドバーへ表示）
const PAGES = [
    { src: 'docs/README.md', out: 'index.html', title: 'ドキュメント目次' },
    { src: 'docs/features.md', out: 'features.html', title: '実装済み機能一覧' },
    { src: 'docs/architecture.md', out: 'architecture.html', title: 'アーキテクチャ' },
    { src: 'docs/commands-and-shortcuts.md', out: 'commands-and-shortcuts.html', title: 'コマンド・キーバインド一覧' },
    { src: 'docs/changelog.md', out: 'changelog.html', title: '実装の変遷（changelog）' }
];

function getRepoSlug() {
    try {
        const url = execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: ROOT })
            .toString()
            .trim();
        const m = /github\.com[:/]+([^/]+\/[^/.]+?)(?:\.git)?$/.exec(url);
        if (m) {
            return m[1];
        }
    } catch (e) {
        // gitが無い/リモート未設定でもビルドは継続する
    }
    return DEFAULT_REPO_SLUG;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * docs/*.md 内の相対Markdownリンクを、生成されたサイト内のリンクへ書き換える。
 * - 公開対象ページへのリンク → 対応する .html
 * - それ以外（docs/ROADMAP.md, ../AGENTS.md 等）→ GitHubのblob URL
 */
function rewriteLinks(markdown, currentSrc, repoSlug, publishedBySourcePath) {
    const currentDir = path.posix.dirname(currentSrc);

    return markdown.replace(/\]\(([^)\s]+\.md)(#[^)]*)?\)/g, (full, relPath, anchor) => {
        const normalized = path.posix.normalize(path.posix.join(currentDir, relPath));
        const page = publishedBySourcePath.get(normalized);
        if (page) {
            return `](${page.out}${anchor || ''})`;
        }
        return `](https://github.com/${repoSlug}/blob/main/${normalized}${anchor || ''})`;
    });
}

function renderNav(pages, activeOut) {
    const items = pages
        .map((p) => {
            const cls = p.out === activeOut ? ' class="active"' : '';
            return `<li><a href="${p.out}"${cls}>${escapeHtml(p.title)}</a></li>`;
        })
        .join('');
    return `<nav class="site-nav"><p class="site-nav-heading">ドキュメント</p><ul>${items}</ul></nav>`;
}

function renderPage({ title, bodyHtml, pages, activeOut, repoSlug }) {
    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} | Markdown WYSIWYG Editor</title>
<meta name="description" content="VS Code用 Markdown WYSIWYG Editor 拡張機能のドキュメント。エディタ本体と同じレンダリングエンジンで表示しています。">
<link rel="stylesheet" href="assets/editor.css">
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<header class="site-header">
<a class="site-header-title" href="index.html">📝 Markdown WYSIWYG Editor ドキュメント</a>
<span class="site-header-spacer"></span>
<a class="site-header-link" href="https://github.com/${repoSlug}">GitHub</a>
</header>
<div class="site-body">
${renderNav(pages, activeOut)}
<div id="editor">${bodyHtml}</div>
</div>
<script src="assets/highlight.min.js"></script>
<script src="assets/mermaid.min.js"></script>
<script src="assets/boot.js"></script>
</body>
</html>
`;
}

function build() {
    const markdownModule = loadMarkdownModule();
    const repoSlug = getRepoSlug();

    const publishedBySourcePath = new Map(PAGES.map((p) => [p.src, p]));

    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(path.join(OUT_DIR, 'assets'), { recursive: true });

    // 静的アセット: editor.css / highlight.min.js / mermaid.min.js は無変更でコピー
    // （エディタ本体と見た目・図の描画を完全に一致させるため）
    fs.copyFileSync(path.join(ROOT, 'media', 'editor.css'), path.join(OUT_DIR, 'assets', 'editor.css'));
    fs.copyFileSync(path.join(ROOT, 'media', 'highlight.min.js'), path.join(OUT_DIR, 'assets', 'highlight.min.js'));
    fs.copyFileSync(path.join(ROOT, 'media', 'mermaid.min.js'), path.join(OUT_DIR, 'assets', 'mermaid.min.js'));
    fs.copyFileSync(path.join(__dirname, 'site.css'), path.join(OUT_DIR, 'assets', 'site.css'));
    fs.copyFileSync(path.join(__dirname, 'boot.js'), path.join(OUT_DIR, 'assets', 'boot.js'));

    // GitHub Pages のJekyll処理を無効化（アンダースコア始まりのassetsフォルダ等をそのまま配信するため）
    fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '');

    for (const page of PAGES) {
        const absSrc = path.join(ROOT, page.src);
        const raw = fs.readFileSync(absSrc, 'utf8');
        const rewritten = rewriteLinks(raw, page.src, repoSlug, publishedBySourcePath);
        const bodyHtml = markdownModule.markdownToHtml(rewritten);
        const html = renderPage({
            title: page.title,
            bodyHtml,
            pages: PAGES,
            activeOut: page.out,
            repoSlug
        });
        fs.writeFileSync(path.join(OUT_DIR, page.out), html);
        console.log(`generated ${page.out}`);
    }

    console.log(`\nSite built at ${path.relative(ROOT, OUT_DIR)}/ (repo: ${repoSlug})`);
}

build();
