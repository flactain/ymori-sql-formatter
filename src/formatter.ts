import { Parser } from 'node-sql-parser';

// フォーマッターオプション
export interface FormatterOptions {
    indentSize?: number;
    keywordCase?: 'upper' | 'lower';
}

// デフォルトオプション
export const DEFAULT_FORMATTER_OPTIONS: Required<FormatterOptions> = {
    indentSize: 2,
    keywordCase: 'upper'
};

/**
 * SQLフォーマッターのメインクラス
 * 右揃えキーワードシステムと左揃えカラム配置を実装
 */
export class SqlFormatter {
    private parser: Parser;
    private options: Required<FormatterOptions>;

    constructor(options: FormatterOptions = {}) {
        this.parser = new Parser();
        this.options = { ...DEFAULT_FORMATTER_OPTIONS, ...options };
    }

    /**
     * SQLをフォーマットする
     */
    formatSql(sql: string): string {
        try {
            // ヒント句を抽出・保存
            const { sql: cleanSql, hint } = this.extractHintComment(sql);
            
            // PostgreSQL用でパース
            const ast = this.parser.astify(cleanSql, { database: 'Postgresql' });
            
            // ASTが配列でない場合（UNION文など）は配列に変換
            const statements = Array.isArray(ast) ? ast : [ast];
            
            if (statements.length === 0) {
                throw new Error('No valid SQL statements found');
            }

            // 各文をフォーマット
            const formattedStatements = statements.map(stmt => this.formatStatement(stmt));
            let result = formattedStatements.join('\n\n');

            // ヒント句を復元
            if (hint) {
                result = this.restoreHintComment(result, hint);
            }

            // セミコロンを追加
            if (!result.endsWith(';')) {
                result += ';';
            }

            return result;

        } catch (error) {
            console.error('SQL formatting failed:', error);
            // エラー時は元のSQLを返す
            return sql;
        }
    }

    /**
     * ヒント句を抽出
     */
    private extractHintComment(sql: string): { sql: string; hint: string | null } {
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
    private restoreHintComment(sql: string, hint: string): string {
        const firstKeywordMatch = sql.match(/^(\s*)(\w+)(\s+)/);
        if (firstKeywordMatch) {
            const [, leading, keyword, space] = firstKeywordMatch;
            return sql.replace(firstKeywordMatch[0], `${leading}${keyword} ${hint}${space}`);
        }
        return sql;
    }

    /**
     * 文をフォーマット
     */
    private formatStatement(stmt: any): string {
        switch (stmt.type) {
            case 'select':
                return this.formatSelectStatement(stmt);
            case 'insert':
                return this.formatInsertStatement(stmt);
            case 'replace':
                return this.formatReplaceStatement(stmt);
            case 'update':
                return this.formatUpdateStatement(stmt);
            case 'delete':
                return this.formatDeleteStatement(stmt);
            case 'create':
                return this.formatCreateStatement(stmt);
            case 'drop':
                return this.formatDropStatement(stmt);
            case 'alter':
                return this.formatAlterStatement(stmt);
            case 'truncate':
                return this.formatTruncateStatement(stmt);
            case 'show':
                return this.formatShowStatement(stmt);
            default:
                throw new Error(`Unsupported statement type: ${stmt.type}`);
        }
    }

    /**
     * SELECT文をフォーマット
     */
    private formatSelectStatement(stmt: any): string {
        // 最大キーワード長を計算（CTE+メインクエリ全体）
        const maxKeywordLength = this.calculateGlobalMaxKeywordLength(stmt);
        return this.formatSelectStatementWithKeywordLength(stmt, maxKeywordLength);
    }

    /**
     * 指定されたmaxKeywordLengthでSELECT文をフォーマット（CTE用）
     */
    private formatSelectStatementWithKeywordLength(stmt: any, maxKeywordLength: number): string {
        const parts: string[] = [];

        // WITH句の処理（ネストしたCTEの場合）
        if (stmt.with) {
            parts.push(this.formatWithClause(stmt.with, maxKeywordLength));
        }

        // SELECT句
        parts.push(this.formatSelectClause(stmt, maxKeywordLength));

        // FROM句
        if (stmt.from) {
            parts.push(this.formatFromClause(stmt.from, maxKeywordLength));
        }

        // WHERE句
        if (stmt.where) {
            parts.push(this.formatWhereClause(stmt.where, maxKeywordLength));
        }

        // GROUP BY句
        if (stmt.groupby) {
            parts.push(this.formatGroupByClause(stmt.groupby, maxKeywordLength));
        }

        // HAVING句
        if (stmt.having) {
            parts.push(this.formatHavingClause(stmt.having, maxKeywordLength));
        }

        // ORDER BY句
        if (stmt.orderby) {
            parts.push(this.formatOrderByClause(stmt.orderby, maxKeywordLength));
        }

        // LIMIT句（値がある場合のみ）
        if (stmt.limit && stmt.limit.value && stmt.limit.value.length > 0) {
            parts.push(this.formatLimitClause(stmt.limit, maxKeywordLength));
        }

        // UNION/INTERSECT/EXCEPT句の処理
        if (stmt._next && stmt.set_op) {
            const setOpKeyword = this.formatKeyword(stmt.set_op.toUpperCase()).padStart(maxKeywordLength, ' ');
            parts.push(setOpKeyword);
            parts.push(this.formatSelectStatementWithKeywordLength(stmt._next, maxKeywordLength));
        }

        return parts.join('\n');
    }


    /**
     * CTE+メインクエリ全体での最大キーワード長を計算
     */
    private calculateGlobalMaxKeywordLength(stmt: any): number {
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
    private collectKeywordsFromStatement(stmt: any): string[] {
        const keywords: string[] = [];
        
        if (stmt.type === 'select') {
            keywords.push('SELECT');
            if (stmt.from) keywords.push('FROM');
            if (stmt.where) keywords.push('WHERE');
            if (stmt.groupby) keywords.push('GROUP BY');
            if (stmt.having) keywords.push('HAVING');
            if (stmt.orderby) keywords.push('ORDER BY');
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
            if (stmt.set) keywords.push('SET');
            if (stmt.where) keywords.push('WHERE');
        } else if (stmt.type === 'delete') {
            keywords.push('DELETE FROM');
            if (stmt.where) keywords.push('WHERE');
        } else if (stmt.type === 'insert') {
            keywords.push('INSERT INTO');
            if (stmt.values) keywords.push('VALUES');
        }

        return keywords;
    }

    /**
     * 式の中のANDキーワードの数をカウント
     */
    private countAndKeywords(expr: any): number {
        if (!expr) return 0;
        
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
     * SELECT句をフォーマット（左揃えカラム配置）
     */
    private formatSelectClause(stmt: any, maxKeywordLength: number): string {
        const keyword = this.formatKeyword('SELECT');
        
        if (!stmt.columns || stmt.columns.length === 0) {
            return keyword;
        }

        // カラムをフォーマット
        const formattedColumns = stmt.columns.map((col: any) => this.formatColumn(col, maxKeywordLength));

        // 単一カラムの場合
        if (formattedColumns.length === 1) {
            return `${keyword} ${formattedColumns[0]}`;
        }

        // 複数カラムの場合は左揃え形式
        // SELECTキーワードも右揃えする
        const selectKeyword = keyword.padStart(maxKeywordLength, ' ');
        const lines = [selectKeyword];
        
        // カラムの開始位置を動的に計算（maxKeywordLength + 1スペース）
        const columnIndent = ' '.repeat(maxKeywordLength + 1);
        
        // 最初のカラム
        lines.push(`${columnIndent}${formattedColumns[0]}`);
        
        // 残りのカラム（カンマ前置き）
        // カンマの位置は最大キーワード長から2文字引いた位置
        const commaIndent = ' '.repeat(Math.max(0, maxKeywordLength - 1));
        for (let i = 1; i < formattedColumns.length; i++) {
            lines.push(`${commaIndent}, ${formattedColumns[i]}`);
        }

        return lines.join('\n');
    }

    /**
     * カラムをフォーマット
     */
    private formatColumn(col: any, maxKeywordLength: number = 0): string {
        let result = '';

        // カラムの型に応じて処理
        if (col.type === 'expr' && col.expr) {
            result = this.formatExpression(col.expr, 0, maxKeywordLength, undefined, 'select');
        } else if (col.expr) {
            result = this.formatExpression(col.expr, 0, maxKeywordLength, undefined, 'select');
        } else {
            result = this.formatExpression(col, 0, maxKeywordLength, undefined, 'select');
        }

        // AS句を処理
        if (col.as) {
            result += ` AS ${col.as}`;
        }

        return result;
    }

    /**
     * 式をフォーマット
     */
    private formatExpression(expr: any, depth: number = 0, maxKeywordLength?: number, contextPosition?: number, contextType?: 'select' | 'where'): string {
        if (!expr) return '';

        switch (expr.type) {
            case 'column_ref':
                return this.formatColumnRef(expr);
            case 'case':
                return this.formatCaseExpression(expr, depth, maxKeywordLength, contextPosition);
            case 'binary_expr':
                return this.formatBinaryExpression(expr, depth, maxKeywordLength, contextType);
            case 'function':
                return this.formatFunction(expr, depth, maxKeywordLength);
            case 'aggr_func':
                return this.formatAggregateFunction(expr, depth, maxKeywordLength);
            case 'window_func':
                return this.formatWindowFunction(expr, depth, maxKeywordLength);
            case 'cast':
                return this.formatCastExpression(expr, depth, maxKeywordLength);
            case 'unary_expr':
                return this.formatUnaryExpression(expr, depth, maxKeywordLength);
            case 'array':
                return this.formatArrayExpression(expr, depth, maxKeywordLength);
            case 'param':
                return this.formatParameterExpression(expr);
            case 'backticks_quote_string':
                return `\`${expr.value}\``;
            case 'double_quote_string':
                return `"${expr.value}"`;
            case 'single_quote_string':
                return `'${expr.value}'`;
            case 'string':
                return `'${expr.value}'`; // 汎用文字列
            case 'regex_string':
                return `~'${expr.value}'`; // PostgreSQL正規表現
            case 'hex_string':
                return `X'${expr.value}'`;
            case 'bit_string':
                return `B'${expr.value}'`;
            case 'number':
                return expr.value.toString();
            case 'bool':
            case 'boolean':
                return expr.value.toString().toUpperCase();
            case 'null':
                return 'NULL';
            case 'date':
                return `DATE '${expr.value}'`;
            case 'time':
                return `TIME '${expr.value}'`;
            case 'timestamp':
                return `TIMESTAMP '${expr.value}'`;
            case 'datetime':
                return `DATETIME '${expr.value}'`;
            case 'star':
                return '*';
            case 'origin':
            case 'default':
                return expr.value;
            case 'expr_list':
                if (expr.value && Array.isArray(expr.value)) {
                    const values = expr.value.map((v: any) => {
                        // サブクエリ（astプロパティを持つ）の場合は特別処理
                        if (v.ast) {
                            return this.formatSubquery(v.ast, maxKeywordLength, true);
                        }
                        return this.formatExpression(v, depth + 1, maxKeywordLength);
                    }).join(', ');
                    
                    // サブクエリを含む場合は閉じかっこの位置を調整
                    const hasSubquery = expr.value.some((v: any) => v.ast);
                    if (hasSubquery && maxKeywordLength) {
                        const closingParenIndent = ' '.repeat(maxKeywordLength+1);
                        return `(${values}${closingParenIndent})`;
                    }
                    return `(${values})`;
                }
                return '()';
            case 'interval':
                const intervalValue = this.formatExpression(expr.expr, depth + 1, maxKeywordLength);
                return `INTERVAL ${intervalValue}`;
            case 'extract':
                const extractField = expr.field || 'UNKNOWN';
                const extractSource = this.formatExpression(expr.source, depth + 1, maxKeywordLength);
                return `EXTRACT(${extractField} FROM ${extractSource})`;
            case undefined:
                // サブクエリの検出 (type: undefined with ast property)
                if (expr.ast) {
                    // WHERE句内のサブクエリ（parentheses: true）の場合は特別処理
                    if (contextType === 'where' && expr.parentheses === true) {
                        return this.formatSubquery(expr.ast, maxKeywordLength, false, true);
                    }
                    return this.formatSubquery(expr.ast, maxKeywordLength);
                }
                // カラムリストの検出 (type: undefined with columns property)
                if (expr.columns && Array.isArray(expr.columns)) {
                    return this.formatColumnList(expr.columns, depth, maxKeywordLength);
                }
                // その他のundefinedタイプはフォールバックへ
                return this.handleUnknownExpression(expr, depth, maxKeywordLength);
            default:
                return this.handleUnknownExpression(expr, depth, maxKeywordLength);
        }
    }

    /**
     * サブクエリをフォーマット
     */
    private formatSubquery(ast: any, maxKeywordLength?: number, skipParentheses: boolean = false, isWhereContext: boolean = false): string {
        // maxKeywordLengthが渡されている場合はそれを使用、なければ再計算
        const subqueryResult = maxKeywordLength 
            ? this.formatSelectStatementWithKeywordLength(ast, maxKeywordLength)
            : this.formatSelectStatement(ast);
        // maxKeywordLength分のオフセットを追加したインデント
        let subqueryIndent: string;
        if (isWhereContext) {
            // WHERE句内のサブクエリはよりコンパクトなインデント
            subqueryIndent = maxKeywordLength ? ' '.repeat(maxKeywordLength) : '  ';
        } else {
            // SELECT句内のサブクエリは従来のインデント
            subqueryIndent = maxKeywordLength ? ' '.repeat(maxKeywordLength + 2) : '  ';
        }
        const indentedSubquery = subqueryResult.split('\n').map(line => 
            line.trim() ? `${subqueryIndent}${line}` : line
        ).join('\n');
        
        // skipParenthesesがtrueの場合はカッコを付けない（expr_listで既にカッコが付くため）
        if (skipParentheses) {
            return `\n${indentedSubquery}\n`;
        }
        
        // WHERE句内サブクエリの場合はコンパクト形式
        if (isWhereContext && maxKeywordLength) {
            const closingParenIndent = ' '.repeat(maxKeywordLength+1);
            // 改行を調整してコンパクトに
            return `(${indentedSubquery.trim()}\n${closingParenIndent})`;
        }
        
        // SELECT句内サブクエリなど：閉じかっこの位置をmaxKeywordLengthに合わせて調整
        if (maxKeywordLength) {
            const closingParenIndent = ' '.repeat(maxKeywordLength+1);
            return `(\n${indentedSubquery}\n${closingParenIndent})`;
        }
        return `(\n${indentedSubquery}\n)`;
    }

    /**
     * カラムリストをフォーマット
     */
    private formatColumnList(columns: any[], depth: number, maxKeywordLength?: number): string {
        return columns.map((col: any) => this.formatExpression(col, depth + 1, maxKeywordLength)).join(', ');
    }

    /**
     * 未知の式を処理（拡張可能な設計）
     */
    private handleUnknownExpression(expr: any, _depth: number = 0, _maxKeywordLength?: number): string {
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

    /**
     * カラム参照をフォーマット
     */
    private formatColumnRef(expr: any): string {
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

    /**
     * CASE式をフォーマット（期待値の形式に合わせる）
     */
    private formatCaseExpression(expr: any, _depth: number = 0, maxKeywordLength?: number, contextPosition?: number): string {
        const lines = [this.formatKeyword('CASE')];

        // WHEN/ELSE句のインデントを動的に計算
        let whenIndent: string;
        let endIndent: string;
        
        if (contextPosition !== undefined) {
            // WHERE句などでの位置基準インデント（演算子の後の位置基準）
            whenIndent = ' '.repeat(contextPosition + 3);
            endIndent = ' '.repeat(contextPosition +1);
        } else {
            // SELECT句などでの従来のインデント（CASEキーワードに合わせて8文字分インデント）
            whenIndent = maxKeywordLength ? ' '.repeat(maxKeywordLength + 3) : '  ';
            endIndent = maxKeywordLength ? ' '.repeat(maxKeywordLength + 1) : '  ';
        }

        // args配列からWHEN/ELSE句を処理
        if (expr.args) {
            for (const arg of expr.args) {
                if (arg.type === 'when') {
                    const condition = this.formatExpression(arg.cond, 0, maxKeywordLength);
                    const result = this.formatExpression(arg.result, 0, maxKeywordLength);
                    lines.push(`${whenIndent}${this.formatKeyword('WHEN')} ${condition} ${this.formatKeyword('THEN')} ${result}`);
                } else if (arg.type === 'else') {
                    const elseResult = this.formatExpression(arg.result, 0, maxKeywordLength);
                    lines.push(`${whenIndent}${this.formatKeyword('ELSE')} ${elseResult}`);
                }
            }
        }

        // ENDインデント
        lines.push(`${endIndent}${this.formatKeyword('END')}`);

        return lines.join('\n');
    }

    /**
     * 二項演算式をフォーマット
     */
    private formatBinaryExpression(expr: any, depth: number = 0, maxKeywordLength?: number, contextType?: 'select' | 'where'): string {
        const left = this.formatExpression(expr.left, depth + 1, maxKeywordLength, undefined, contextType);
        
        // CASE文を含む=演算子の特別処理
        if (expr.operator === '=' && expr.right.type === 'case') {
            const mexLength = maxKeywordLength ? maxKeywordLength : 2;
            const operatorPosition = mexLength + left.length + 3; // " = " の長さを考慮
            const right = this.formatExpression(expr.right, depth + 1, maxKeywordLength, operatorPosition, contextType);
            return `${left} ${expr.operator} ${right}`;
        }
        
        const right = this.formatExpression(expr.right, depth + 1, maxKeywordLength, undefined, contextType);
        
        // AND/OR条件の改行処理
        if ((expr.operator === 'AND' || expr.operator === 'OR') && depth === 0 && maxKeywordLength) {
            const conditions = this.flattenAndOrConditions(expr, expr.operator);
            const formattedConditions = conditions.map((condition, index) => {
                const conditionStr = this.formatExpression(condition, 1, maxKeywordLength, undefined, contextType);
                if (index === 0) {
                    return conditionStr;
                } else {
                    const keywordPadding = maxKeywordLength - expr.operator.length;
                    const paddedKeyword = ' '.repeat(keywordPadding) + expr.operator;
                    return `${paddedKeyword} ${conditionStr}`;
                }
            });
            return formattedConditions.join('\n');
        }
        
        return `${left} ${expr.operator} ${right}`;
    }

    /**
     * AND/OR条件を平坦化
     */
    private flattenAndOrConditions(expr: any, operator: string): any[] {
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
     * 集約関数をフォーマット
     */
    private formatAggregateFunction(expr: any, depth: number = 0, maxKeywordLength?: number): string {
        const funcName = expr.name;
        
        // 引数の処理
        if (expr.args && expr.args.expr) {
            let argStr = '';
            
            // DISTINCT句の処理
            if (expr.args.distinct) {
                argStr += `${expr.args.distinct} `;
            }
            
            if (expr.args.expr.type === 'star') {
                argStr += '*';
            } else {
                argStr += this.formatExpression(expr.args.expr, depth + 1, maxKeywordLength);
            }
            
            return `${funcName}(${argStr})`;
        }
        
        return `${funcName}()`;
    }

    /**
     * ウィンドウ関数をフォーマット
     */
    private formatWindowFunction(expr: any, depth: number = 0, maxKeywordLength?: number): string {
        const funcName = expr.name;
        
        // OVER句の処理
        let result = `${funcName}()`;
        
        if (expr.over && expr.over.as_window_specification && expr.over.as_window_specification.window_specification) {
            const windowSpec = expr.over.as_window_specification.window_specification;
            const parts: string[] = [];
            
            // PARTITION BY句
            if (windowSpec.partitionby && Array.isArray(windowSpec.partitionby)) {
                const partitionColumns = windowSpec.partitionby.map((col: any) => {
                    if (col.expr) {
                        return this.formatExpression(col.expr, depth + 1, maxKeywordLength);
                    }
                    return this.formatExpression(col, depth + 1, maxKeywordLength);
                }).join(', ');
                parts.push(`PARTITION BY ${partitionColumns}`);
            }
            
            // ORDER BY句
            if (windowSpec.orderby && Array.isArray(windowSpec.orderby)) {
                const orderColumns = windowSpec.orderby.map((col: any) => {
                    let result = this.formatExpression(col.expr || col, depth + 1, maxKeywordLength);
                    if (col.type && (col.type === 'ASC' || col.type === 'DESC')) {
                        result += ` ${col.type}`;
                    }
                    return result;
                }).join(', ');
                parts.push(`ORDER BY ${orderColumns}`);
            }
            
            if (parts.length > 0) {
                result = `${funcName}() OVER (${parts.join(' ')})`;
            } else {
                result = `${funcName}() OVER ()`;
            }
        }
        
        return result;
    }

    /**
     * CAST式をフォーマット
     */
    private formatCastExpression(expr: any, depth: number = 0, maxKeywordLength?: number): string {
        const sourceExpr = this.formatExpression(expr.expr, depth + 1, maxKeywordLength);
        
        // データ型の処理
        let dataType = 'UNKNOWN';
        if (expr.target && Array.isArray(expr.target) && expr.target.length > 0) {
            dataType = expr.target[0].dataType;
        }
        
        // CAST構文 vs :: 構文の判定
        if (expr.symbol === '::') {
            return `${sourceExpr}::${dataType}`;
        } else {
            return `CAST(${sourceExpr} AS ${dataType})`;
        }
    }

    /**
     * 単項式をフォーマット (NOT, -, +等)
     */
    private formatUnaryExpression(expr: any, depth: number = 0, maxKeywordLength?: number): string {
        const operand = this.formatExpression(expr.expr, depth + 1, maxKeywordLength);
        const operator = expr.operator;
        
        // 演算子によって前置か後置かを判定
        if (operator === 'NOT' || operator === '-' || operator === '+') {
            return `${operator} ${operand}`;
        } else {
            return `${operand} ${operator}`;
        }
    }

    /**
     * 配列式をフォーマット
     */
    private formatArrayExpression(expr: any, depth: number = 0, maxKeywordLength?: number): string {
        if (expr.value && Array.isArray(expr.value)) {
            const elements = expr.value.map((element: any) => this.formatExpression(element, depth + 1, maxKeywordLength)).join(', ');
            return `ARRAY[${elements}]`;
        }
        return 'ARRAY[]';
    }

    /**
     * パラメータ式をフォーマット (プリペアドステートメント用)
     */
    private formatParameterExpression(expr: any): string {
        // PostgreSQLの場合は$1, $2, $3... 形式
        // MySQLの場合は? 形式
        // 実装では元の値をそのまま返す
        return expr.value;
    }

    /**
     * 関数をフォーマット
     */
    private formatFunction(expr: any, depth: number = 0, maxKeywordLength?: number): string {
        // 関数名の取得
        let funcName = '';
        if (typeof expr.name === 'string') {
            funcName = expr.name;
        } else if (expr.name && expr.name.name && Array.isArray(expr.name.name)) {
            funcName = expr.name.name.map((n: any) => n.value || n).join('.');
        } else if (expr.name && expr.name.value) {
            funcName = expr.name.value;
        } else {
            funcName = 'unknown_function';
        }

        // 引数の処理
        if (expr.args && expr.args.value && expr.args.value.length > 0) {
            const args = expr.args.value.map((arg: any) => this.formatExpression(arg, depth + 1, maxKeywordLength)).join(', ');
            return `${funcName}(${args})`;
        } else if (expr.args && Array.isArray(expr.args)) {
            const args = expr.args.map((arg: any) => this.formatExpression(arg, depth + 1, maxKeywordLength)).join(', ');
            return `${funcName}(${args})`;
        }
        
        return `${funcName}()`;
    }

    /**
     * FROM句をフォーマット
     */
    private formatFromClause(fromClause: any[], maxKeywordLength: number): string {
        const keyword = this.formatKeyword('FROM').padStart(maxKeywordLength, ' ');
        
        // JOINが含まれているかチェック
        const hasJoin = fromClause.some((table, index) => index > 0 && table.join);
        
        if (fromClause.length === 1 && !hasJoin) {
            // 単純なテーブル
            const table = this.formatTable(fromClause[0]);
            return `${keyword} ${table}`;
        }

        // 複雑なFROM句（JOIN含む）の処理
        return `${keyword} ${this.formatComplexFrom(fromClause, maxKeywordLength)}`;
    }

    /**
     * テーブルをフォーマット
     */
    private formatTable(table: any): string {
        let result = table.table;
        if (table.as) {
            result += ` AS ${table.as}`;
        }
        return result;
    }

    /**
     * 複雑なFROM句をフォーマット
     */
    private formatComplexFrom(fromClause: any[], maxKeywordLength: number): string {
        const lines: string[] = [];
        
        for (let i = 0; i < fromClause.length; i++) {
            const table = fromClause[i];
            
            if (i === 0) {
                // 最初のテーブル
                lines.push(this.formatTable(table));
            } else if (table.join) {
                // JOIN処理：実際のJOINタイプを使用し、右揃えを適用
                const joinKeyword = this.formatKeyword(table.join).padStart(maxKeywordLength, ' ');
                const tableName = this.formatTable(table);
                const joinLine = `${joinKeyword} ${tableName}`;
                
                if (table.on) {
                    // JOIN行を追加
                    lines.push(joinLine);
                    // ON条件を別行で右揃え
                    const onLines = this.formatJoinCondition(table.on, maxKeywordLength);
                    lines.push(...onLines);
                } else {
                    lines.push(joinLine);
                }
            } else {
                // 通常のテーブル（カンマ区切り）
                lines.push(this.formatTable(table));
            }
        }
        
        // 各行は既に適切にパディングされているため、単純に改行で結合
        return lines.join('\n');
    }

    /**
     * JOIN条件（ON句）をフォーマット
     */
    private formatJoinCondition(condition: any, maxKeywordLength: number): string[] {
        return this.formatJoinConditionRecursive(condition, maxKeywordLength, true);
    }

    /**
     * JOIN条件を再帰的にフォーマット
     */
    private formatJoinConditionRecursive(condition: any, maxKeywordLength: number, isFirst: boolean): string[] {
        const lines: string[] = [];
        
        if (condition.type === 'binary_expr' && condition.operator === 'AND') {
            // AND条件の場合、左側を先に処理
            const leftLines = this.formatJoinConditionRecursive(condition.left, maxKeywordLength, isFirst);
            lines.push(...leftLines);
            
            // 右側をANDキーワードで開始
            const rightLines = this.formatJoinConditionRecursive(condition.right, maxKeywordLength, false);
            if (rightLines.length > 0) {
                // 最初の行にANDキーワードを追加
                const andKeyword = this.formatKeyword('AND').padStart(maxKeywordLength, ' ');
                rightLines[0] = `${andKeyword} ${rightLines[0]}`;
                lines.push(...rightLines);
            }
        } else {
            // 単純な条件の場合
            const conditionText = this.formatExpression(condition, 0, maxKeywordLength);
            if (isFirst) {
                // 最初の条件はONキーワードで開始
                const onKeyword = this.formatKeyword('ON').padStart(maxKeywordLength, ' ');
                lines.push(`${onKeyword} ${conditionText}`);
            } else {
                // 後続の条件はそのまま（ANDキーワードは呼び出し元で追加される）
                lines.push(conditionText);
            }
        }
        
        return lines;
    }

    /**
     * WHERE句をフォーマット
     */
    private formatWhereClause(whereClause: any, maxKeywordLength: number): string {
        const keyword = this.formatKeyword('WHERE').padStart(maxKeywordLength, ' ');
        const condition = this.formatExpression(whereClause, 0, maxKeywordLength, undefined, 'where');
        return `${keyword} ${condition}`;
    }

    /**
     * GROUP BY句をフォーマット
     */
    private formatGroupByClause(groupByClause: any, maxKeywordLength: number): string {
        const keyword = this.formatKeyword('GROUP BY').padStart(maxKeywordLength, ' ');
        
        // GROUP BY句が配列でない場合の対応
        if (!Array.isArray(groupByClause)) {
            groupByClause = [groupByClause];
        }
        
        const columns = groupByClause.map((col: any) => this.formatExpression(col, 0, maxKeywordLength)).join(', ');
        return `${keyword} ${columns}`;
    }

    /**
     * HAVING句をフォーマット
     */
    private formatHavingClause(havingClause: any, maxKeywordLength: number): string {
        const keyword = this.formatKeyword('HAVING').padStart(maxKeywordLength, ' ');
        const condition = this.formatExpression(havingClause, 0, maxKeywordLength);
        return `${keyword} ${condition}`;
    }

    /**
     * ORDER BY句をフォーマット
     */
    private formatOrderByClause(orderByClause: any[], maxKeywordLength: number): string {
        const keyword = this.formatKeyword('ORDER BY').padStart(maxKeywordLength, ' ');
        const columns = orderByClause.map((col: any) => {
            let result = this.formatExpression(col.expr || col, 0, maxKeywordLength);
            if (col.type && (col.type === 'ASC' || col.type === 'DESC')) {
                result += ` ${col.type}`;
            }
            return result;
        }).join(', ');
        return `${keyword} ${columns}`;
    }

    /**
     * LIMIT句をフォーマット
     */
    private formatLimitClause(limitClause: any, maxKeywordLength: number): string {
        const keyword = this.formatKeyword('LIMIT').padStart(maxKeywordLength, ' ');
        
        if (limitClause.value && Array.isArray(limitClause.value)) {
            // LIMIT値を抽出
            const limitValue = this.formatExpression(limitClause.value[0], 0, maxKeywordLength);
            
            // OFFSETがある場合
            if (limitClause.seperator === 'offset' && limitClause.value.length > 1) {
                const offsetValue = this.formatExpression(limitClause.value[1], 0, maxKeywordLength);
                return `${keyword} ${limitValue} OFFSET ${offsetValue}`;
            } else {
                return `${keyword} ${limitValue}`;
            }
        } else {
            // フォールバック
            return `${keyword} ${limitClause}`;
        }
    }

    /**
     * WITH句をフォーマット
     */
    private formatWithClause(withClause: any, maxKeywordLength: number): string {
        if (!withClause || !Array.isArray(withClause)) {
            return this.formatKeyword('WITH') + ' /* invalid CTE */';
        }

        const parts: string[] = [];
        
        withClause.forEach((cte: any, index: number) => {
            const cteName = cte.name?.value || cte.name || 'unnamed_cte';
            const cteQuery = cte.stmt?.ast || cte.stmt;
            
            if (index === 0) {
                // WITHキーワードはレベル0（左端）
                parts.push(`${this.formatKeyword('WITH')} ${cteName} AS (`);
            } else {
                parts.push(`, ${cteName} AS (`);
            }
            
            if (cteQuery) {
                // CTE内クエリに統一された maxKeywordLength を渡す
                const formattedQuery = this.formatSelectStatementWithKeywordLength(cteQuery, maxKeywordLength);
                // 固定インデントを削除：既に統一されたキーワード長で右揃えされているため
                parts.push(formattedQuery);
            }
            
            parts.push(')');
        });

        return parts.join('\n');
    }

    /**
     * INSERT文をフォーマット
     */
    private formatInsertStatement(stmt: any): string {
        const parts: string[] = [];
        
        // 最大キーワード長を計算（グローバル統一）
        const maxKeywordLength = this.calculateGlobalMaxKeywordLength(stmt);
        
        // INSERT INTO (右揃え)
        const tableName = stmt.table?.[0]?.table || 'unknown_table';
        const insertKeyword = this.formatKeyword('INSERT INTO').padStart(maxKeywordLength, ' ');
        parts.push(`${insertKeyword} ${tableName}`);
        
        // カラムリスト
        if (stmt.columns) {
            const columns = stmt.columns.map((col: any) => {
                if (col.value) {
                    return col.value;
                } else if (col.column) {
                    return col.column;
                } else {
                    return col;
                }
            }).join(', ');
            parts.push(`(${columns})`);
        }
        
        // VALUES (右揃え)
        if (stmt.values) {
            const valuesKeyword = this.formatKeyword('VALUES').padStart(maxKeywordLength, ' ');
            parts.push(valuesKeyword);
            
            // VALUES句の構造に応じて処理
            if (stmt.values.values && Array.isArray(stmt.values.values)) {
                const valuesList = stmt.values.values.map((valueSet: any) => {
                    if (valueSet.value && Array.isArray(valueSet.value)) {
                        const values = valueSet.value.map((val: any) => this.formatExpression(val, 0)).join(', ');
                        return `(${values})`;
                    }
                    return '(/* unknown values */)';
                }).join(', ');
                parts.push(valuesList);
            } else if (Array.isArray(stmt.values)) {
                const valuesList = stmt.values.map((valueSet: any) => {
                    if (valueSet.value && Array.isArray(valueSet.value)) {
                        const values = valueSet.value.map((val: any) => this.formatExpression(val, 0)).join(', ');
                        return `(${values})`;
                    }
                    return '(/* unknown values */)';
                }).join(', ');
                parts.push(valuesList);
            }
        }
        
        return parts.join(' ');
    }

    /**
     * UPDATE文をフォーマット
     */
    private formatUpdateStatement(stmt: any): string {
        const parts: string[] = [];
        
        // 最大キーワード長を計算（グローバル統一）
        const maxKeywordLength = this.calculateGlobalMaxKeywordLength(stmt);
        
        // UPDATE (右揃え)
        const tableName = stmt.table?.[0]?.table || 'unknown_table';
        const updateKeyword = this.formatKeyword('UPDATE').padStart(maxKeywordLength, ' ');
        parts.push(`${updateKeyword} ${tableName}`);
        
        // SET
        if (stmt.set) {
            const setKeyword = this.formatKeyword('SET').padStart(maxKeywordLength, ' ');
            
            const assignments = stmt.set.map((assignment: any) => {
                // カラム名を取得
                let columnName = 'unknown_column';
                if (assignment.column && assignment.column.expr && assignment.column.expr.value) {
                    columnName = assignment.column.expr.value;
                } else if (assignment.column && assignment.column.value) {
                    columnName = assignment.column.value;
                } else if (assignment.column) {
                    columnName = assignment.column;
                }
                
                const value = this.formatExpression(assignment.value, 0);
                return `${columnName} = ${value}`;
            });
            
            // 単一代入の場合
            if (assignments.length === 1) {
                parts.push(`${setKeyword} ${assignments[0]}`);
            } else {
                // 複数代入の場合：第一要素はSETキーワードに直接付ける
                const lines = [`${setKeyword} ${assignments[0]}`];
                
                // 残りの代入文（カンマ前置き）
                // カンマの位置は最大キーワード長から2文字引いた位置
                const commaIndent = ' '.repeat(Math.max(0, maxKeywordLength - 1));
                for (let i = 1; i < assignments.length; i++) {
                    lines.push(`${commaIndent}, ${assignments[i]}`);
                }
                
                parts.push(lines.join('\n'));
            }
        }
        
        // WHERE
        if (stmt.where) {
            parts.push(this.formatWhereClause(stmt.where, maxKeywordLength));
        }
        
        return parts.join('\n');
    }

    /**
     * DELETE文をフォーマット
     */
    private formatDeleteStatement(stmt: any): string {
        const parts: string[] = [];
        
        // 最大キーワード長を計算（グローバル統一）
        const maxKeywordLength = this.calculateGlobalMaxKeywordLength(stmt);
        
        // DELETE FROM (右揃え)
        const tableName = stmt.from?.[0]?.table || 'unknown_table';
        const deleteKeyword = this.formatKeyword('DELETE FROM').padStart(maxKeywordLength, ' ');
        parts.push(`${deleteKeyword} ${tableName}`);
        
        // WHERE
        if (stmt.where) {
            parts.push(this.formatWhereClause(stmt.where, maxKeywordLength));
        }
        
        return parts.join('\n');
    }

    /**
     * REPLACE文をフォーマット
     */
    private formatReplaceStatement(stmt: any): string {
        const parts: string[] = [];
        
        // REPLACE INTO
        const tableName = stmt.table?.[0]?.table || 'unknown_table';
        parts.push(`${this.formatKeyword('REPLACE INTO')} ${tableName}`);
        
        // カラムリスト
        if (stmt.columns) {
            const columns = stmt.columns.map((col: any) => {
                if (col.value) {
                    return col.value;
                } else if (col.column) {
                    return col.column;
                } else {
                    return col;
                }
            }).join(', ');
            parts.push(`(${columns})`);
        }
        
        // VALUES
        if (stmt.values) {
            parts.push(this.formatKeyword('VALUES'));
            
            // VALUES句の構造に応じて処理
            if (stmt.values.values && Array.isArray(stmt.values.values)) {
                const valuesList = stmt.values.values.map((valueSet: any) => {
                    if (valueSet.value && Array.isArray(valueSet.value)) {
                        const values = valueSet.value.map((val: any) => this.formatExpression(val, 0)).join(', ');
                        return `(${values})`;
                    }
                    return '(/* unknown values */)';
                }).join(', ');
                parts.push(valuesList);
            } else if (Array.isArray(stmt.values)) {
                const valuesList = stmt.values.map((valueSet: any) => {
                    if (valueSet.value && Array.isArray(valueSet.value)) {
                        const values = valueSet.value.map((val: any) => this.formatExpression(val, 0)).join(', ');
                        return `(${values})`;
                    }
                    return '(/* unknown values */)';
                }).join(', ');
                parts.push(valuesList);
            }
        }
        
        return parts.join(' ');
    }

    /**
     * CREATE文をフォーマット
     */
    private formatCreateStatement(stmt: any): string {
        const parts: string[] = [];
        
        // CREATE [TEMPORARY] keyword
        let createKeyword = this.formatKeyword('CREATE');
        if (stmt.temporary) {
            createKeyword += ` ${this.formatKeyword('TEMPORARY')}`;
        }
        createKeyword += ` ${this.formatKeyword(stmt.keyword?.toUpperCase() || 'TABLE')}`;
        
        // IF NOT EXISTS
        if (stmt.if_not_exists) {
            createKeyword += ` ${this.formatKeyword('IF NOT EXISTS')}`;
        }
        
        // テーブル名/オブジェクト名
        let objectName = 'unknown_object';
        if (stmt.table) {
            if (Array.isArray(stmt.table)) {
                objectName = stmt.table.map((t: any) => t.table || t).join(', ');
            } else if (stmt.table.table) {
                objectName = stmt.table.table;
            } else {
                objectName = stmt.table;
            }
        } else if (stmt.index && typeof stmt.index === 'string') {
            objectName = stmt.index;
        } else if (stmt.index && stmt.index.name) {
            objectName = stmt.index.name;
        }
        
        parts.push(`${createKeyword} ${objectName}`);
        
        // カラム定義など（簡略化）
        if (stmt.create_definitions && Array.isArray(stmt.create_definitions)) {
            parts.push('(');
            parts.push('  /* column definitions */');
            parts.push(')');
        }
        
        return parts.join('\n');
    }

    /**
     * DROP文をフォーマット
     */
    private formatDropStatement(stmt: any): string {
        const parts: string[] = [];
        
        // DROP keyword
        let dropKeyword = this.formatKeyword('DROP');
        if (stmt.keyword) {
            dropKeyword += ` ${this.formatKeyword(stmt.keyword.toUpperCase())}`;
        }
        
        // オブジェクト名
        let objectNames = 'unknown_object';
        if (stmt.name && Array.isArray(stmt.name)) {
            objectNames = stmt.name.map((n: any) => {
                if (typeof n === 'string') {
                    return n;
                } else if (n.table) {
                    return n.table;
                } else {
                    return String(n);
                }
            }).join(', ');
        }
        
        parts.push(`${dropKeyword} ${objectNames}`);
        
        return parts.join(' ');
    }

    /**
     * ALTER文をフォーマット
     */
    private formatAlterStatement(stmt: any): string {
        const parts: string[] = [];
        
        // ALTER TABLE
        parts.push(this.formatKeyword('ALTER TABLE'));
        
        // テーブル名
        let tableName = 'unknown_table';
        if (stmt.table && Array.isArray(stmt.table) && stmt.table.length > 0) {
            tableName = stmt.table[0].table || 'unknown_table';
        }
        parts.push(tableName);
        
        // ALTER操作（簡略化）
        if (stmt.expr) {
            parts.push('/* alter operations */');
        }
        
        return parts.join(' ');
    }

    /**
     * TRUNCATE文をフォーマット
     */
    private formatTruncateStatement(stmt: any): string {
        const parts: string[] = [];
        
        // TRUNCATE [TABLE]
        let truncateKeyword = this.formatKeyword('TRUNCATE');
        if (stmt.keyword) {
            truncateKeyword += ` ${this.formatKeyword(stmt.keyword.toUpperCase())}`;
        }
        
        // テーブル名
        let tableNames = 'unknown_table';
        if (stmt.name && Array.isArray(stmt.name)) {
            tableNames = stmt.name.map((n: any) => {
                if (typeof n === 'string') {
                    return n;
                } else if (n.table) {
                    return n.table;
                } else {
                    return String(n);
                }
            }).join(', ');
        }
        
        parts.push(`${truncateKeyword} ${tableNames}`);
        
        return parts.join(' ');
    }

    /**
     * SHOW文をフォーマット
     */
    private formatShowStatement(stmt: any): string {
        const parts: string[] = [];
        
        // SHOW keyword
        parts.push(this.formatKeyword('SHOW'));
        
        // SHOW対象（簡略化）
        if (stmt.keyword) {
            parts.push(this.formatKeyword(stmt.keyword.toUpperCase()));
        } else {
            parts.push('/* show target */');
        }
        
        return parts.join(' ');
    }


    /**
     * キーワードをフォーマット（大文字/小文字）
     */
    private formatKeyword(keyword: string): string {
        return this.options.keywordCase === 'upper' ? keyword.toUpperCase() : keyword.toLowerCase();
    }
}

/**
 * 公開API
 */
export function formatSql(sql: string, options: FormatterOptions = {}): string {
    const formatter = new SqlFormatter(options);
    return formatter.formatSql(sql);
}