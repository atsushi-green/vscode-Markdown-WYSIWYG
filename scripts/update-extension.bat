@echo off
chcp 65001 >nul
rem =============================================================
rem Markdown WYSIWYG Editor 拡張機能を一発更新するスクリプト (Windows用)
rem
rem 使い方:
rem   scripts\update-extension.bat  (ダブルクリックでも可)
rem
rem やること:
rem   1. 依存関係のインストール
rem   2. ビルド & VSIXパッケージ作成
rem   3. VS Codeへ強制再インストール
rem =============================================================
setlocal
cd /d "%~dp0.."

set "VSIX_NAME=markdown-wysiwyg-editor.vsix"

rem --- code CLI を探す（PATHに無ければ標準インストール先を使う） ---
where code >nul 2>nul
if %errorlevel%==0 (
    set "CODE_CLI=code"
    goto :found_code
)
if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CLI=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
    goto :found_code
)
if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CLI=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
    goto :found_code
)
echo [ERROR] VS Code の code コマンドが見つかりません。
echo         VS Code をインストールするか、PATH に code を追加してください。
pause
exit /b 1

:found_code
echo ==^> (1/3) 依存関係をインストール中...
call npm install
if errorlevel 1 goto :error

echo ==^> (2/3) ビルド ^& パッケージ作成中...
call npx --yes @vscode/vsce package --out "%VSIX_NAME%"
if errorlevel 1 goto :error

echo ==^> (3/3) VS Code へインストール中...
call "%CODE_CLI%" --install-extension "%VSIX_NAME%" --force
if errorlevel 1 goto :error

echo.
echo [OK] 更新完了: %VSIX_NAME% をインストールしました。
echo      VS Code を開いている場合は、コマンドパレットから「Developer: Reload Window」
echo      を実行するか、VS Code を再起動して反映してください。
pause
exit /b 0

:error
echo.
echo [ERROR] 更新に失敗しました。上のログを確認してください。
pause
exit /b 1
