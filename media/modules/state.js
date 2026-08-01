/**
 * state.js - グローバル状態管理モジュール
 * エディタ全体で共有される状態変数を管理
 */
window.EditorState = (function() {
    'use strict';

    // 定数
    const ZERO_WIDTH = '\u200b';

    // 状態オブジェクト
    const state = {
        // VS Code API
        vscode: null,

        // DOM要素参照（初期化時に設定）
        editor: null,
        rawEditor: null,
        toggleBtn: null,
        toggleRawWrapBtn: null,
        mermaidContextMenu: null,
        findWidget: null,
        findInput: null,
        findCount: null,
        findOptionCase: null,
        findOptionWord: null,
        findOptionRegex: null,
        findPrev: null,
        findNext: null,
        findClose: null,
        replaceInput: null,
        replaceBtn: null,
        replaceAllBtn: null,
        linkDialog: null,
        linkDialogTitle: null,
        linkTextInput: null,
        linkUrlInput: null,
        linkDialogOk: null,
        linkDialogCancel: null,
        linkDialogRemove: null,

        // エディタ状態フラグ
        isUpdating: false,
        isFormatting: false,
        isCreatingCodeBlock: false,
        isRawMode: false,
        // Rawモードの行折り返し（既定はOFF＝`white-space: pre`で行番号ガターと1対1）。
        // ONにすると`pre-wrap`で折り返すが、行番号ガターは論理行1つ=固定22px高さの
        // 前提で作られており折り返し時は視覚行とずれるため、ON中はガターを非表示にする。
        isRawWrapEnabled: false,
        // ツールバーを表示するか（VS Codeの設定 markdownWysiwyg.showToolbar と同期）。
        // 既定は true で、拡張機能側から setToolbarVisible メッセージで更新される。
        isToolbarVisible: true,
        isEditingMermaid: false,
        isEditingTable: false,

        // カーソル・編集状態
        lastCursorPosition: null,
        lastSentMarkdown: '',
        // Webviewが送信した編集の単調増加シーケンス番号。競合する古い `update`
        // （＝タイプ中に送った古い編集のエコーが、より新しいローカル編集の後に
        // 遅れて届く）を無視して、キャレットが巻き戻るのを防ぐために使う。
        // 送信ごとに +1 し、拡張機能側がエコーの `update` にこの番号を `seq` として
        // 反映して返す（拡張機能側の配線は別サイクル＝それまでは message.seq は
        // 常に undefined で本ガードは無効・従来動作のまま）。
        editSeq: 0,

        // リンクダイアログ関連
        // ダイアログの入力欄へフォーカスを移すとエディタの選択が失われるため、
        // 開いた時点のRangeと編集対象の要素を保持して適用時に使う
        linkDialogRange: null,
        linkDialogTarget: null,
        // 編集中リンクが持っていた title 属性（Markdownのタイトル記法 `(url "title")`）。
        // ダイアログはテキストとURLしか編集しないため、適用時に引き継いで
        // ユーザーが触っていないタイトルが失われないようにする。
        // （ダイアログの見出しDOM要素 `linkDialogTitle` とは別物）
        linkDialogLinkTitle: null,

        // Mermaid関連
        mermaidIdCounter: 0,
        currentMermaidTarget: null,

        // テーブル関連
        tableIdCounter: 0,
        currentEditingCell: null,

        // 検索関連
        findOptions: {
            caseSensitive: false,
            wholeWord: false,
            useRegex: false
        },
        findMatches: [],
        currentMatchIndex: -1,

        // 定数
        ZERO_WIDTH: ZERO_WIDTH
    };

    /**
     * DOM要素参照を初期化
     */
    function initDOMReferences() {
        state.vscode = acquireVsCodeApi();
        state.editor = document.getElementById('editor');
        state.rawEditor = document.getElementById('rawEditor');
        state.toggleBtn = document.getElementById('toggleView');
        state.toggleRawWrapBtn = document.getElementById('toggleRawWrap');
        state.mermaidContextMenu = document.getElementById('mermaidContextMenu');
        state.findWidget = document.getElementById('findWidget');
        state.findInput = document.getElementById('findInput');
        state.findCount = document.getElementById('findCount');
        state.findOptionCase = document.getElementById('findOptionCase');
        state.findOptionWord = document.getElementById('findOptionWord');
        state.findOptionRegex = document.getElementById('findOptionRegex');
        state.findPrev = document.getElementById('findPrev');
        state.findNext = document.getElementById('findNext');
        state.findClose = document.getElementById('findClose');
        state.replaceInput = document.getElementById('replaceInput');
        state.replaceBtn = document.getElementById('replaceBtn');
        state.replaceAllBtn = document.getElementById('replaceAllBtn');
        state.linkDialog = document.getElementById('linkDialog');
        state.linkDialogTitle = document.getElementById('linkDialogTitle');
        state.linkTextInput = document.getElementById('linkTextInput');
        state.linkUrlInput = document.getElementById('linkUrlInput');
        state.linkDialogOk = document.getElementById('linkDialogOk');
        state.linkDialogCancel = document.getElementById('linkDialogCancel');
        state.linkDialogRemove = document.getElementById('linkDialogRemove');
    }

    /**
     * 状態をリセット
     */
    function reset() {
        state.isUpdating = false;
        state.isFormatting = false;
        state.isCreatingCodeBlock = false;
        state.isEditingMermaid = false;
        state.isEditingTable = false;
        state.lastCursorPosition = null;
        state.currentMermaidTarget = null;
        state.currentEditingCell = null;
        state.findMatches = [];
        state.currentMatchIndex = -1;
    }

    // 公開API
    return {
        // 状態プロパティへのアクセス
        get vscode() { return state.vscode; },
        get editor() { return state.editor; },
        get rawEditor() { return state.rawEditor; },
        get toggleBtn() { return state.toggleBtn; },
        get toggleRawWrapBtn() { return state.toggleRawWrapBtn; },
        get mermaidContextMenu() { return state.mermaidContextMenu; },
        get findWidget() { return state.findWidget; },
        get findInput() { return state.findInput; },
        get findCount() { return state.findCount; },
        get findOptionCase() { return state.findOptionCase; },
        get findOptionWord() { return state.findOptionWord; },
        get findOptionRegex() { return state.findOptionRegex; },
        get findPrev() { return state.findPrev; },
        get findNext() { return state.findNext; },
        get findClose() { return state.findClose; },
        get replaceInput() { return state.replaceInput; },
        get replaceBtn() { return state.replaceBtn; },
        get replaceAllBtn() { return state.replaceAllBtn; },
        get linkDialog() { return state.linkDialog; },
        get linkDialogTitle() { return state.linkDialogTitle; },
        get linkTextInput() { return state.linkTextInput; },
        get linkUrlInput() { return state.linkUrlInput; },
        get linkDialogOk() { return state.linkDialogOk; },
        get linkDialogCancel() { return state.linkDialogCancel; },
        get linkDialogRemove() { return state.linkDialogRemove; },

        // リンクダイアログの選択状態
        get linkDialogRange() { return state.linkDialogRange; },
        set linkDialogRange(v) { state.linkDialogRange = v; },

        get linkDialogTarget() { return state.linkDialogTarget; },
        set linkDialogTarget(v) { state.linkDialogTarget = v; },

        get linkDialogLinkTitle() { return state.linkDialogLinkTitle; },
        set linkDialogLinkTitle(v) { state.linkDialogLinkTitle = v; },

        // フラグのゲッター/セッター
        get isUpdating() { return state.isUpdating; },
        set isUpdating(v) { state.isUpdating = v; },

        get isFormatting() { return state.isFormatting; },
        set isFormatting(v) { state.isFormatting = v; },

        get isCreatingCodeBlock() { return state.isCreatingCodeBlock; },
        set isCreatingCodeBlock(v) { state.isCreatingCodeBlock = v; },

        get isRawMode() { return state.isRawMode; },
        set isRawMode(v) { state.isRawMode = v; },

        get isRawWrapEnabled() { return state.isRawWrapEnabled; },
        set isRawWrapEnabled(v) { state.isRawWrapEnabled = v; },

        get isToolbarVisible() { return state.isToolbarVisible; },
        set isToolbarVisible(v) { state.isToolbarVisible = v; },

        get isEditingMermaid() { return state.isEditingMermaid; },
        set isEditingMermaid(v) { state.isEditingMermaid = v; },

        get isEditingTable() { return state.isEditingTable; },
        set isEditingTable(v) { state.isEditingTable = v; },

        get lastCursorPosition() { return state.lastCursorPosition; },
        set lastCursorPosition(v) { state.lastCursorPosition = v; },

        get lastSentMarkdown() { return state.lastSentMarkdown; },
        set lastSentMarkdown(v) { state.lastSentMarkdown = v; },

        get editSeq() { return state.editSeq; },
        set editSeq(v) { state.editSeq = v; },

        // Mermaid関連
        get mermaidIdCounter() { return state.mermaidIdCounter; },
        set mermaidIdCounter(v) { state.mermaidIdCounter = v; },

        get currentMermaidTarget() { return state.currentMermaidTarget; },
        set currentMermaidTarget(v) { state.currentMermaidTarget = v; },

        // テーブル関連
        get tableIdCounter() { return state.tableIdCounter; },
        set tableIdCounter(v) { state.tableIdCounter = v; },

        get currentEditingCell() { return state.currentEditingCell; },
        set currentEditingCell(v) { state.currentEditingCell = v; },

        // 検索関連
        get findOptions() { return state.findOptions; },
        get findMatches() { return state.findMatches; },
        set findMatches(v) { state.findMatches = v; },

        get currentMatchIndex() { return state.currentMatchIndex; },
        set currentMatchIndex(v) { state.currentMatchIndex = v; },

        // 定数
        ZERO_WIDTH: ZERO_WIDTH,

        // メソッド
        initDOMReferences: initDOMReferences,
        reset: reset
    };
})();
