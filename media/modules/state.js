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
        isEditingMermaid: false,
        isEditingTable: false,

        // カーソル・編集状態
        lastCursorPosition: null,
        lastSentMarkdown: '',

        // リンクダイアログ関連
        // ダイアログの入力欄へフォーカスを移すとエディタの選択が失われるため、
        // 開いた時点のRangeと編集対象の要素を保持して適用時に使う
        linkDialogRange: null,
        linkDialogTarget: null,

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

        // フラグのゲッター/セッター
        get isUpdating() { return state.isUpdating; },
        set isUpdating(v) { state.isUpdating = v; },

        get isFormatting() { return state.isFormatting; },
        set isFormatting(v) { state.isFormatting = v; },

        get isCreatingCodeBlock() { return state.isCreatingCodeBlock; },
        set isCreatingCodeBlock(v) { state.isCreatingCodeBlock = v; },

        get isRawMode() { return state.isRawMode; },
        set isRawMode(v) { state.isRawMode = v; },

        get isEditingMermaid() { return state.isEditingMermaid; },
        set isEditingMermaid(v) { state.isEditingMermaid = v; },

        get isEditingTable() { return state.isEditingTable; },
        set isEditingTable(v) { state.isEditingTable = v; },

        get lastCursorPosition() { return state.lastCursorPosition; },
        set lastCursorPosition(v) { state.lastCursorPosition = v; },

        get lastSentMarkdown() { return state.lastSentMarkdown; },
        set lastSentMarkdown(v) { state.lastSentMarkdown = v; },

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
