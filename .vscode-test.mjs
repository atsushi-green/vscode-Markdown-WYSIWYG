import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	// out/test/unit/ はjsdomベースのユニットテスト（npm run test:unit で実行）のため、
	// VS Code上で実行する統合テストはトップレベルの *.test.js のみに限定する
	files: 'out/test/*.test.js',
	// テスト対象のVS Codeバージョンを固定する。既定（stable）だと最新版が落ちてくるが、
	// VS Code 1.13x 以降は macOS の実行ファイル名が `Contents/MacOS/Electron` から
	// `Contents/MacOS/Code` へ変わっており、@vscode/test-electron 2.5.2 は前者を
	// 決め打ちで探すため `spawn … Electron ENOENT` で起動に失敗する。
	// 指定するのは package.json の `engines.vscode`（`^1.108.0`）が宣言している
	// **最小サポート版**。これより古いと VS Code 側が要件を満たさないと判断して
	// 拡張機能を activate せず、全コマンドが `not found` になる。
	// 「サポートすると宣言したバージョンで検証する」意味でも妥当。
	// （test-electron を新しい系列へ上げれば固定を外せる。ROADMAPに todo として記録）
	version: '1.108.0',
	mocha: {
		timeout: 20000,
	},
});
