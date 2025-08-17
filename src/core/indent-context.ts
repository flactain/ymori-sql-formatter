// インデントコンテキストのタイプ定義
export type IndentContextType = 
    | 'main'           // メインクエリレベル
    | 'select_clause'  // SELECT句内
    | 'where_clause'   // WHERE句内  
    | 'case_when'      // CASE文内
    | 'function_arg'   // 関数引数内
    | 'subquery'       // サブクエリ内
    | 'join_condition'; // JOIN条件内

// フォーマッターオプション
export interface FormatterOptions {
    indentSize?: number;
    keywordCase?: 'upper' | 'lower';
    insertDummyHint?: boolean;
}

// デフォルトオプション
export const DEFAULT_FORMATTER_OPTIONS: Required<FormatterOptions> = {
    indentSize: 2,
    keywordCase: 'upper',
    insertDummyHint: true
};


// インデントコンテキスト管理クラス
export class IndentContext {
    public readonly nestLevel: number;
    public readonly contextType: IndentContextType;
    public readonly baseKeywordLength: number;
    public readonly parent: IndentContext | null;
    public readonly isFirstSelect: boolean;
    
    constructor(
        nestLevel: number = 0,
        contextType: IndentContextType = 'main',
        baseKeywordLength: number = 0,
        parent: IndentContext | null = null,
        isFirstSelect: boolean = false
    ) {
        this.nestLevel = nestLevel;
        this.contextType = contextType;
        this.baseKeywordLength = baseKeywordLength;
        this.parent = parent;
        this.isFirstSelect = isFirstSelect;
    }

    // 子コンテキストを作成
    createChildContext(childType: IndentContextType): IndentContext {
        return new IndentContext(
            this.nestLevel + 1,
            childType,
            this.baseKeywordLength,
            this,
            false // 子コンテキストは最初のSELECTではない
        );
    }

    // 同レベルでコンテキストタイプのみ変更
    createSiblingContext(siblingType: IndentContextType): IndentContext {
        return new IndentContext(
            this.nestLevel,
            siblingType,
            this.baseKeywordLength,
            this.parent,
            false // 兄弟コンテキストは最初のSELECTではない
        );
    }

    // サブクエリ専用コンテキストを作成（適切なネストレベル計算）
    createSubqueryContext(subqueryBaseLength: number): IndentContext {
        // 現在のコンテキストがサブクエリ関連の場合はネストレベルを上げる
        // main(0) → subquery(1), subquery(1) → subquery(2), where_clause(1) → subquery(2) など
        const newNestLevel = this.nestLevel + 1;
        
        return new IndentContext(
            newNestLevel,
            'subquery',
            subqueryBaseLength,
            this,
            false // サブクエリは最初のSELECTではない
        );
    }

    // 基本インデント幅を計算（ネストレベルに応じて段階的に増加）
    getBaseIndent(): number {
        if (this.nestLevel === 0) {
            return this.baseKeywordLength;
        }
        
        // レベル1: 基準 + 2、レベル2: 基準 + 4、レベル3: 基準 + 6...
        return this.baseKeywordLength + (this.nestLevel * 2);
    }

    // コンテキスト固有のインデント調整
    getContextIndent(): number {
        const baseIndent = this.getBaseIndent();
        
        switch (this.contextType) {
            case 'main':
                return baseIndent;
            case 'select_clause':
                // SELECT句内のサブクエリは少し内側にインデント
                return baseIndent + 1;
            case 'where_clause':
                // WHERE句内も少し内側
                return baseIndent + 1;
            case 'case_when':
                // CASEのWHEN/THENは少し内側
                return baseIndent + 3;
            case 'function_arg':
                // 関数引数は控えめにインデント
                return baseIndent + 1;
            case 'subquery':
                // サブクエリ全体は適度なインデント（読みやすい範囲）
                return baseIndent + 1;
            case 'join_condition':
                // JOIN条件は基本インデント
                return baseIndent;
            default:
                return baseIndent;
        }
    }

    // インデント文字列を生成
    getIndentString(): string {
        return ' '.repeat(this.getContextIndent());
    }

    // 閉じかっこの位置を計算（開きかっこと同じレベル）
    getClosingIndent(): number {
        // サブクエリの場合は、適切なインデント位置に調整
        if (this.contextType === 'subquery' && this.parent) {
            // 親のWHERE句のインデント + 適度なオフセット
            return this.parent.getContextIndent() + 1;
        }
        
        // 閉じかっこは通常、開きかっこと同じレベル
        if (this.parent) {
            return this.parent.getContextIndent();
        }
        return this.baseKeywordLength;
    }

    // 閉じかっこのインデント文字列
    getClosingIndentString(): string {
        return ' '.repeat(this.getClosingIndent());
    }
}