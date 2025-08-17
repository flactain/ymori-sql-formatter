import { Parser } from 'node-sql-parser';
import { IndentContext, FormatterOptions, DEFAULT_FORMATTER_OPTIONS } from './core/indent-context';
import { ExpressionFormatter } from './expressions/expression-formatter';
import { SelectFormatter } from './statements/select-formatter';
import { FormatterUtils } from './utils/formatter-utils';

/**
 * SQLフォーマッターのメインクラス（モジュール分割版）
 * 右揃えキーワードシステムと左揃えカラム配置を実装
 */
export class SqlFormatter {
    private parser: Parser;
    private options: Required<FormatterOptions>;
    private expressionFormatter: ExpressionFormatter;
    private selectFormatter: SelectFormatter;

    constructor(options: FormatterOptions = {}) {
        this.parser = new Parser();
        this.options = { ...DEFAULT_FORMATTER_OPTIONS, ...options };
        this.expressionFormatter = new ExpressionFormatter(this.options);
        this.selectFormatter = new SelectFormatter(this.options, this.expressionFormatter);
    }

    /**
     * SQLをフォーマットする
     */
    formatSql(sql: string): string {
        try {
            // ヒント句を抽出・保存（ダミーヒント句オプション対応）
            const { sql: cleanSql, hint } = FormatterUtils.extractHintComment(sql, this.options.insertDummyHint);
            
            // クエリ全体がSELECTで始まるかどうかを判定
            const trimmedSql = cleanSql.trim().toUpperCase();
            const queryStartsWithSelect = trimmedSql.startsWith('SELECT');
            
            // PostgreSQL用でパース
            const ast = this.parser.astify(cleanSql, { database: 'Postgresql' });
            
            // ASTが配列でない場合（UNION文など）は配列に変換
            const statements = Array.isArray(ast) ? ast : [ast];
            
            if (statements.length === 0) {
                throw new Error('No valid SQL statements found');
            }

            // 各文をフォーマット
            const formattedStatements = statements.map(stmt => this.formatStatement(stmt, queryStartsWithSelect));
            let result = formattedStatements.join('\n\n');

            // ヒント句を復元
            if (hint) {
                result = FormatterUtils.restoreHintComment(result, hint);
            }

            // セミコロンを追加
            if (!result.endsWith(';')) {
                result += `\n;`;
            }

            return result;

        } catch (error) {
            console.error('SQL formatting failed:', error);
            // エラー時は元のSQLを返す
            return sql;
        }
    }

    /**
     * 文をフォーマット
     */
    private formatStatement(stmt: any, queryStartsWithSelect: boolean = false): string {
        try {
            if (!stmt || !stmt.type) {
                console.warn('Invalid statement structure:', stmt);
                return '/* invalid statement */';
            }

            switch (stmt.type) {
                case 'select':
                    return this.formatSelectStatement(stmt, queryStartsWithSelect);
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
                    console.warn(`Unsupported statement type: ${stmt.type}`);
                    return `/* unsupported statement type: ${stmt.type} */`;
            }
        } catch (error) {
            console.error('Error formatting statement:', error, stmt);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return `/* error formatting statement: ${errorMessage} */`;
        }
    }

    /**
     * SELECT文をフォーマット
     */
    private formatSelectStatement(stmt: any, queryStartsWithSelect: boolean = false): string {
        // 最大キーワード長を計算（CTE+メインクエリ全体）
        const maxKeywordLength = FormatterUtils.calculateGlobalMaxKeywordLength(stmt);
        
        // フォーマット制御：SELECTで始まる場合のみ改行あり（標準形式）
        const useStandardFormat = queryStartsWithSelect;
        
        // ルートコンテキストを作成
        const rootContext = new IndentContext(0, 'main', maxKeywordLength, null, false);
        const result = this.selectFormatter.formatSelectStatementWithContext(stmt, rootContext, useStandardFormat);
        
        return result;
    }

    // 他の文のフォーマット（プレースホルダー）
    private formatInsertStatement(stmt: any): string {
        const parts: string[] = [];
        parts.push(`${this.formatKeyword('INSERT INTO')} ${stmt.table[0].table}`);
        
        if (stmt.columns) {
            const columns = stmt.columns.map((col: any) => col.column || col).join(', ');
            parts.push(`(${columns})`);
        }
        
        if (stmt.values) {
            parts.push(this.formatKeyword('VALUES'));
            const values = stmt.values.map((valueSet: any) => {
                const vals = valueSet.value.map((val: any) => {
                    if (typeof val === 'string') { return `'${val}'`; }
                    return String(val);
                }).join(', ');
                return `(${vals})`;
            }).join(', ');
            parts.push(values);
        }
        
        return parts.join(' ');
    }

    private formatReplaceStatement(stmt: any): string {
        return this.formatInsertStatement(stmt).replace(/^INSERT INTO/, 'REPLACE INTO');
    }

    private formatUpdateStatement(stmt: any): string {
        const parts: string[] = [];
        parts.push(`${this.formatKeyword('UPDATE')} ${stmt.table[0].table}`);
        
        if (stmt.set) {
            const setClause = stmt.set.map((assignment: any) => {
                return `${assignment.column} = ${assignment.value}`;
            }).join(', ');
            parts.push(`${this.formatKeyword('SET')} ${setClause}`);
        }
        
        if (stmt.where) {
            parts.push(`${this.formatKeyword('WHERE')} ${stmt.where}`);
        }
        
        return parts.join(' ');
    }

    private formatDeleteStatement(stmt: any): string {
        const parts: string[] = [];
        parts.push(`${this.formatKeyword('DELETE FROM')} ${stmt.from[0].table}`);
        
        if (stmt.where) {
            parts.push(`${this.formatKeyword('WHERE')} ${stmt.where}`);
        }
        
        return parts.join(' ');
    }

    private formatCreateStatement(stmt: any): string {
        return `${this.formatKeyword('CREATE')} ${this.formatKeyword('TABLE')} ${stmt.table[0].table}`;
    }

    private formatDropStatement(stmt: any): string {
        return `${this.formatKeyword('DROP')} ${this.formatKeyword('TABLE')} ${stmt.name}`;
    }

    private formatAlterStatement(stmt: any): string {
        return `${this.formatKeyword('ALTER')} ${this.formatKeyword('TABLE')} ${stmt.table}`;
    }

    private formatTruncateStatement(stmt: any): string {
        return `${this.formatKeyword('TRUNCATE')} ${this.formatKeyword('TABLE')} ${stmt.table}`;
    }

    private formatShowStatement(_stmt: any): string {
        return `${this.formatKeyword('SHOW')} ${this.formatKeyword('TABLES')}`;
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

// 型定義もエクスポート
export { FormatterOptions } from './core/indent-context';