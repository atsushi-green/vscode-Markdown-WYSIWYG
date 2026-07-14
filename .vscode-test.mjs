import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	// out/test/unit/ はjsdomベースのユニットテスト（npm run test:unit で実行）のため、
	// VS Code上で実行する統合テストはトップレベルの *.test.js のみに限定する
	files: 'out/test/*.test.js',
	mocha: {
		timeout: 20000,
	},
});
