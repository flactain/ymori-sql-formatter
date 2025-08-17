/**
 * フォーマッター用ユーティリティ関数群
 */

/**
 * 指定されたmaxKeywordLengthでSELECT文をフォーマット（CTE用・既存版）
 */
export class FormatterUtils {
    
    /**
     * CTE+メインクエリ全体での最大キーワード長を計算
     */
    static calculateGlobalMaxKeywordLength(stmt: any): number {
        const allKeywords: string[] = [];

        // CTEのキーワードを収集
        if (stmt.with && Array.isArray(stmt.with)) {
            allKeywords.push('WITH');
            
            stmt.with.forEach((cte: any) => {
                const cteQuery = cte.stmt?.ast || cte.stmt;
                if (cteQuery) {
                    const cteKeywords = this.collectKeywordsFromStatement(cteQuery);
                    allKeywords.push(...cteKeywords);
                }
            });
        }

        // メインクエリのキーワードを収集
        const mainKeywords = this.collectKeywordsFromStatement(stmt);
        allKeywords.push(...mainKeywords);

        return allKeywords.length > 0 ? Math.max(...allKeywords.map(k => k.length)) : 0;
    }

    /**
     * 文からキーワードを収集
     */
    static collectKeywordsFromStatement(stmt: any): string[] {
        const keywords: string[] = [];
        
        if (stmt.type === 'select') {
            keywords.push('SELECT');
            if (stmt.from) { keywords.push('FROM'); }
            if (stmt.where) { keywords.push('WHERE'); }
            if (stmt.groupby) { keywords.push('GROUP BY'); }
            if (stmt.having) { keywords.push('HAVING'); }
            if (stmt.orderby) { keywords.push('ORDER BY'); }
            if (stmt.limit) {
                keywords.push('LIMIT');
                // OFFSETがある場合はOFFSETキーワードも追加
                if (stmt.limit.seperator === 'offset') {
                    keywords.push('OFFSET');
                }
            }
            
            // JOIN句も考慮（実際のJOINタイプとON条件キーワードを収集）
            if (stmt.from) {
                for (const table of stmt.from) {
                    if (table.join) {
                        keywords.push(table.join);
                        // ON条件があればONキーワードも追加
                        if (table.on) {
                            keywords.push('ON');
                            // AND条件があれば再帰的にカウント
                            const andCount = this.countAndKeywords(table.on);
                            for (let i = 0; i < andCount; i++) {
                                keywords.push('AND');
                            }
                        }
                    }
                }
            }
        } else if (stmt.type === 'update') {
            keywords.push('UPDATE');
            if (stmt.set) { keywords.push('SET'); }
            if (stmt.where) { keywords.push('WHERE'); }
        } else if (stmt.type === 'delete') {
            keywords.push('DELETE FROM');
            if (stmt.where) { keywords.push('WHERE'); }
        } else if (stmt.type === 'insert') {
            keywords.push('INSERT INTO');
            if (stmt.values) { keywords.push('VALUES'); }
        }

        return keywords;
    }

    /**
     * 式の中のANDキーワードの数をカウント
     */
    static countAndKeywords(expr: any): number {
        if (!expr) { return 0; }
        
        let count = 0;
        if (expr.type === 'binary_expr' && expr.operator === 'AND') {
            count = 1;
            // 左右の式も再帰的にチェック
            count += this.countAndKeywords(expr.left);
            count += this.countAndKeywords(expr.right);
        }
        
        return count;
    }

    /**
     * ヒント句を抽出
     */
    static extractHintComment(sql: string): { sql: string; hint: string | null } {
        const hintMatch = sql.match(/^(\s*)(\w+)(\s*)(\/\*.*?\*\/)(.*)$/s);
        if (hintMatch) {
            const [, leading, keyword, space, hint, rest] = hintMatch;
            return {
                sql: leading + keyword + space + rest,
                hint: hint
            };
        }
        return { sql, hint: null };
    }

    /**
     * ヒント句を復元
     */
    static restoreHintComment(sql: string, hint: string): string {
        const firstKeywordMatch = sql.match(/^(\s*)(\w+)(\s+)/);
        if (firstKeywordMatch) {
            const [, leading, keyword, space] = firstKeywordMatch;
            return sql.replace(firstKeywordMatch[0], `${leading}${keyword} ${hint}${space}`);
        }
        return sql;
    }

    /**
     * AND/OR条件を平坦化
     */
    static flattenAndOrConditions(expr: any, operator: string): any[] {
        if (!expr || expr.type !== 'binary_expr') {
            return [expr];
        }
        
        if (expr.operator === operator) {
            return [
                ...this.flattenAndOrConditions(expr.left, operator),
                ...this.flattenAndOrConditions(expr.right, operator)
            ];
        } else {
            return [expr];
        }
    }

    /**
     * 未知の式を処理（拡張可能な設計）
     */
    static handleUnknownExpression(expr: any, _depth: number = 0, _maxKeywordLength?: number): string {
        // デバッグ用にログ出力（本番環境では無効化可能）
        if (process.env.NODE_ENV === 'development') {
            console.warn(`Unsupported expression type: ${expr.type}`, expr);
        }
        
        // フォールバック: 元の値を返すか、プレースホルダーを返す
        if (expr.value !== undefined) {
            return String(expr.value);
        }
        
        return '/* unsupported expression */';
    }
}

/**
 * AST関連のユーティリティ
 */
export class ASTUtils {
    /**
     * 式からサブクエリASTを抽出
     */
    static extractSubqueryAst(expr: any): any {
        if (!expr) {
            return null;
        }
        
        // 直接astプロパティを持つ場合
        if (expr.ast) {
            return expr.ast;
        }
        
        // expr_listの場合（IN句で使用される）
        if (expr.type === 'expr_list' && expr.value) {
            // 値リストの中にサブクエリがあるかチェック
            for (const item of expr.value) {
                if (item.ast) {
                    return item.ast;
                }
            }
        }
        
        // type undefinedでastを持つ場合（一般的なサブクエリパターン）
        if (expr.type === undefined && expr.ast) {
            return expr.ast;
        }
        
        return null;
    }
}

/**
 * 文字列処理ユーティリティ
 */
export class StringUtils {
    /**
     * カラム参照をフォーマット
     */
    static formatColumnRef(expr: any): string {
        let columnName = '';
        
        // カラム名の取得（複雑な構造に対応）
        if (typeof expr.column === 'string') {
            columnName = expr.column;
        } else if (expr.column && expr.column.expr && expr.column.expr.value) {
            columnName = expr.column.expr.value;
        } else if (expr.column && expr.column.value) {
            columnName = expr.column.value;
        } else {
            columnName = 'unknown_column';
        }
        
        if (expr.table) {
            return `${expr.table}.${columnName}`;
        }
        return columnName;
    }
}