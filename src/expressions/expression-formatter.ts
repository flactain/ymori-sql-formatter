import { IndentContext, FormatterOptions } from '../core/indent-context';
import { SelectFormatter } from '../statements/select-formatter';
import { FormatterUtils } from '../utils/formatter-utils';

/**
 * 式フォーマッター - すべての式処理を担当
 */
export class ExpressionFormatter {
    private options: Required<FormatterOptions>;
    private selectFormatter: SelectFormatter;

    constructor(options: Required<FormatterOptions>) {
        this.options = options;
        this.selectFormatter = new SelectFormatter(options, this);
    }

    /**
     * 式をフォーマット（新しいIndentContext対応版）
     */
    formatExpressionWithContext(expr: any, context: IndentContext): string {
        if (!expr) { return ''; }

        switch (expr.type) {
            case 'column_ref':
                return this.formatColumnRef(expr);
            case 'case':
                return this.formatCaseExpressionWithContext(expr, context);
            case 'binary_expr':
                return this.formatBinaryExpressionWithContext(expr, context);
            case 'function':
                // 特別な演算子（EXISTS、ANY、ALL）のチェック
                const specialResult = this.handleSpecialOperators(expr, context);
                if (specialResult) {
                    return specialResult;
                }
                return this.formatFunctionWithContext(expr, context);
            case 'aggr_func':
                return this.formatAggregateFunctionWithContext(expr, context);
            case 'window_func':
                return this.formatWindowFunctionWithContext(expr, context);
            case 'cast':
                return this.formatCastExpressionWithContext(expr, context);
            case 'unary_expr':
                return this.formatUnaryExpressionWithContext(expr, context);
            case 'array':
                return this.formatArrayExpressionWithContext(expr, context);
            case 'param':
                return this.formatParameterExpression(expr);
            case 'backticks_quote_string':
                return `\`${expr.value}\``;
            case 'double_quote_string':
                return `"${expr.value}"`;
            case 'single_quote_string':
                return `'${expr.value}'`;
            case 'string':
                return `'${expr.value}'`;
            case 'regex_string':
                return `~'${expr.value}'`;
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
                return this.formatExprListWithContext(expr, context);
            case 'interval':
                const intervalValue = this.formatExpressionWithContext(expr.expr, context);
                return `INTERVAL ${intervalValue}`;
            case 'extract':
                const extractField = expr.field || 'UNKNOWN';
                const extractSource = this.formatExpressionWithContext(expr.source, context);
                return `EXTRACT(${extractField} FROM ${extractSource})`;
            case undefined:
                return this.handleUndefinedExpression(expr, context);
            default:
                return this.handleUnknownExpression(expr);
        }
    }

    /**
     * CASE式をフォーマット（新しいIndentContext対応版）
     */
    private formatCaseExpressionWithContext(expr: any, context: IndentContext): string {
        const lines = [this.formatKeyword('CASE')];

        // CASEのコンテキストを作成
        const caseContext = context.createSiblingContext('case_when');
        const whenIndent = caseContext.getIndentString();
        const endIndent = ' '.repeat(context.getContextIndent());

        // args配列からWHEN/ELSE句を処理
        if (expr.args) {
            for (const arg of expr.args) {
                if (arg.type === 'when') {
                    const condition = this.formatExpressionWithContext(arg.cond, caseContext);
                    const result = this.formatExpressionWithContext(arg.result, caseContext);
                    lines.push(`${whenIndent}${this.formatKeyword('WHEN')} ${condition} ${this.formatKeyword('THEN')} ${result}`);
                } else if (arg.type === 'else') {
                    const elseResult = this.formatExpressionWithContext(arg.result, caseContext);
                    lines.push(`${whenIndent}${this.formatKeyword('ELSE')} ${elseResult}`);
                }
            }
        }

        // ENDインデント
        lines.push(`${endIndent}${this.formatKeyword('END')}`);

        return lines.join('\n');
    }

    /**
     * 二項演算式をフォーマット（新しいIndentContext対応版）
     */
    private formatBinaryExpressionWithContext(expr: any, context: IndentContext): string {
        const left = this.formatExpressionWithContext(expr.left, context);
        
        // CASE文を含む=演算子の特別処理
        if (expr.operator === '=' && expr.right.type === 'case') {
            const caseContext = new IndentContext(
                context.nestLevel,
                'case_when',
                context.baseKeywordLength,
                context
            );
            const right = this.formatCaseExpressionWithContext(expr.right, caseContext);
            return `${left} ${expr.operator} ${right}`;
        }
        
        // サブクエリを含む演算子の特別処理
        const subqueryOperators = ['IN', 'EXISTS', 'ANY', 'ALL'];
        if (subqueryOperators.includes(expr.operator) && expr.right) {
            return this.handleSubqueryOperator(expr, left, context);
        }
        
        // NOT IN演算子の特別処理
        if (expr.operator === 'NOT IN' && expr.right) {
            return this.handleNotInOperator(expr, left, context);
        }
        
        // NOT演算子の特別処理（NOT IN, NOT EXISTS等）
        if (expr.operator === 'NOT' && expr.right && expr.right.operator) {
            const rightOp = expr.right.operator;
            if (subqueryOperators.includes(rightOp)) {
                return this.handleNotSubqueryOperator(expr, left, context);
            }
            // NOT BETWEEN演算子の特別処理
            if (rightOp === 'BETWEEN') {
                return this.handleNotBetweenOperator(expr, left, context);
            }
        }
        
        // BETWEEN演算子の特別処理
        if (expr.operator === 'BETWEEN' && expr.right) {
            return this.handleBetweenOperator(expr, left, context);
        }
        
        // NOT BETWEEN演算子の特別処理（直接のNOT BETWEEN演算子）
        if (expr.operator === 'NOT BETWEEN' && expr.right) {
            return this.handleDirectNotBetweenOperator(expr, left, context);
        }
        
        // ANY/ALL演算子の特別処理
        if (expr.right && expr.right.type === 'function' && expr.right.name && expr.right.name.name) {
            const funcName = expr.right.name.name[0].value.toUpperCase();
            if ((funcName === 'ANY' || funcName === 'ALL') && expr.right.args && expr.right.args.value && expr.right.args.value[0] && expr.right.args.value[0].ast) {
                const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
                const subqueryResult = this.formatSubqueryWithContext(expr.right.args.value[0].ast, context.createSubqueryContext(6), true, isWhereCtx);
                
                if (isWhereCtx) {
                    return `${left} ${expr.operator} ${funcName} (\n${subqueryResult}\n${' '.repeat(context.baseKeywordLength - 2)})`;
                } else {
                    return `${left} ${expr.operator} ${funcName} (\n${subqueryResult}\n${context.getIndentString()})`;
                }
            }
        }
        
        const right = this.formatExpressionWithContext(expr.right, context);
        
        // AND/OR条件の改行処理
        if ((expr.operator === 'AND' || expr.operator === 'OR') && context.nestLevel === 0) {
            const conditions = this.flattenAndOrConditions(expr, expr.operator);
            const formattedConditions = conditions.map((condition: any, index: number) => {
                const conditionStr = this.formatExpressionWithContext(condition, context);
                if (index === 0) {
                    return conditionStr;
                } else {
                    const keywordPadding = context.baseKeywordLength - expr.operator.length;
                    const paddedKeyword = ' '.repeat(keywordPadding) + expr.operator;
                    return `${paddedKeyword} ${conditionStr}`;
                }
            });
            return formattedConditions.join('\n');
        }
        
        return `${left} ${expr.operator} ${right}`;
    }

    // サブクエリ処理メソッド群
    private handleSubqueryOperator(expr: any, left: string, context: IndentContext): string {
        const operator = expr.operator;
        const right = expr.right;
        
        // サブクエリの検出：複数のパターンをチェック
        const subqueryAst = this.extractSubqueryAst(right);
        
        if (subqueryAst) {
            // サブクエリの場合：WHERE句コンテキストかどうかを判定
            const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
            const subqueryResult = this.formatSubqueryWithContext(subqueryAst, context.createSubqueryContext(6), true, isWhereCtx);
            
            if (isWhereCtx) {
                // WHERE句の場合：コンパクトな形式
                return `${left} ${operator} (${subqueryResult}\n${' '.repeat(context.baseKeywordLength + 1)})`;
            } else {
                // SELECT句の場合：従来の深いインデント
                return `${left} ${operator} (\n${subqueryResult}\n${context.getIndentString()})`;
            }
        } else {
            // 値リストの場合：IN句で複数値があれば改行フォーマット
            if (operator === 'IN' && right.type === 'expr_list' && right.value && right.value.length >= 2) {
                const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
                if (isWhereCtx) {
                    const multilineList = this.formatMultilineValueList(right.value, context);
                    return `${left} ${operator} ${multilineList}`;
                }
            }
            
            // 通常の処理
            const rightFormatted = this.formatExpressionWithContext(right, context);
            return `${left} ${operator} ${rightFormatted}`;
        }
    }

    private handleNotInOperator(expr: any, left: string, context: IndentContext): string {
        // NOT IN演算子の特別処理
        if (expr.right && expr.right.type === 'expr_list') {
            // サブクエリの検出
            const subqueryAst = this.extractSubqueryAst(expr.right);
            
            if (subqueryAst) {
                const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
                const subqueryResult = this.formatSubqueryWithContext(subqueryAst, context.createSubqueryContext(6), true, isWhereCtx);
                
                if (isWhereCtx) {
                    return `${left} NOT IN (\n${subqueryResult}\n${' '.repeat(context.baseKeywordLength - 2)})`;
                } else {
                    return `${left} NOT IN (\n${subqueryResult}\n${context.getIndentString()})`;
                }
            } else {
                // 値リストの場合：IN句で複数値があれば改行フォーマット
                if (expr.right.type === 'expr_list' && expr.right.value && expr.right.value.length >= 2) {
                    const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
                    if (isWhereCtx) {
                        const multilineList = this.formatMultilineValueList(expr.right.value, context);
                        return `${left} NOT IN ${multilineList}`;
                    }
                }
                
                // 通常の処理
                const rightFormatted = this.formatExpressionWithContext(expr.right, context);
                return `${left} NOT IN ${rightFormatted}`;
            }
        }
        
        // フォールバック
        const rightFormatted = this.formatExpressionWithContext(expr.right, context);
        return `${left} NOT IN ${rightFormatted}`;
    }

    private handleNotSubqueryOperator(expr: any, left: string, context: IndentContext): string {
        const rightExpr = expr.right;
        const operator = rightExpr.operator;
        
        // サブクエリの検出
        const subqueryAst = this.extractSubqueryAst(rightExpr.right);
        
        if (subqueryAst) {
            // サブクエリの場合：WHERE句コンテキストかどうかを判定
            const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
            const subqueryResult = this.formatSubqueryWithContext(subqueryAst, context.createSubqueryContext(6), true, isWhereCtx);
            
            if (isWhereCtx) {
                // WHERE句の場合：コンパクトな形式
                return `${left} NOT ${operator} (\n${subqueryResult}\n${' '.repeat(context.baseKeywordLength - 2)})`;
            } else {
                // SELECT句の場合：従来の深いインデント
                return `${left} NOT ${operator} (\n${subqueryResult}\n${context.getIndentString()})`;
            }
        } else {
            // 値リストの場合：IN句で複数値があれば改行フォーマット
            if (operator === 'IN' && rightExpr.right.type === 'expr_list' && rightExpr.right.value && rightExpr.right.value.length >= 2) {
                const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
                if (isWhereCtx) {
                    const multilineList = this.formatMultilineValueList(rightExpr.right.value, context);
                    return `${left} NOT ${operator} ${multilineList}`;
                }
            }
            
            // 通常の処理
            const rightFormatted = this.formatExpressionWithContext(rightExpr.right, context);
            return `${left} NOT ${operator} ${rightFormatted}`;
        }
    }

    private handleBetweenOperator(expr: any, left: string, context: IndentContext): string {
        // BETWEEN演算子の右側は通常、expr_listまたは2つの値を持つ構造
        const right = expr.right;
        
        if (right && right.type === 'expr_list' && right.value && right.value.length === 2) {
            // BETWEEN value1 AND value2の形式
            const value1 = this.formatExpressionWithContext(right.value[0], context);
            const value2 = this.formatExpressionWithContext(right.value[1], context);
            return `${left} BETWEEN ${value1} AND ${value2}`;
        } else if (right && Array.isArray(right) && right.length === 2) {
            // 配列形式の場合
            const value1 = this.formatExpressionWithContext(right[0], context);
            const value2 = this.formatExpressionWithContext(right[1], context);
            return `${left} BETWEEN ${value1} AND ${value2}`;
        } else {
            // フォールバック：通常の二項演算子として処理
            const rightFormatted = this.formatExpressionWithContext(right, context);
            return `${left} BETWEEN ${rightFormatted}`;
        }
    }

    private handleNotBetweenOperator(expr: any, left: string, context: IndentContext): string {
        // NOT BETWEEN演算子の処理：expr.right.rightがBETWEEN演算子の右側値
        const betweenExpr = expr.right;
        const right = betweenExpr.right;
        
        if (right && right.type === 'expr_list' && right.value && right.value.length === 2) {
            // NOT BETWEEN value1 AND value2の形式
            const value1 = this.formatExpressionWithContext(right.value[0], context);
            const value2 = this.formatExpressionWithContext(right.value[1], context);
            return `${left} NOT BETWEEN ${value1} AND ${value2}`;
        } else if (right && Array.isArray(right) && right.length === 2) {
            // 配列形式の場合
            const value1 = this.formatExpressionWithContext(right[0], context);
            const value2 = this.formatExpressionWithContext(right[1], context);
            return `${left} NOT BETWEEN ${value1} AND ${value2}`;
        } else {
            // フォールバック：通常の処理
            const rightFormatted = this.formatExpressionWithContext(right, context);
            return `${left} NOT BETWEEN ${rightFormatted}`;
        }
    }

    private handleDirectNotBetweenOperator(expr: any, left: string, context: IndentContext): string {
        // 直接のNOT BETWEEN演算子の処理（operator: "NOT BETWEEN"）
        const right = expr.right;
        
        if (right && right.type === 'expr_list' && right.value && right.value.length === 2) {
            // NOT BETWEEN value1 AND value2の形式
            const value1 = this.formatExpressionWithContext(right.value[0], context);
            const value2 = this.formatExpressionWithContext(right.value[1], context);
            return `${left} NOT BETWEEN ${value1} AND ${value2}`;
        } else if (right && Array.isArray(right) && right.length === 2) {
            // 配列形式の場合
            const value1 = this.formatExpressionWithContext(right[0], context);
            const value2 = this.formatExpressionWithContext(right[1], context);
            return `${left} NOT BETWEEN ${value1} AND ${value2}`;
        } else {
            // フォールバック：通常の処理
            const rightFormatted = this.formatExpressionWithContext(right, context);
            return `${left} NOT BETWEEN ${rightFormatted}`;
        }
    }

    private handleSpecialOperators(expr: any, context: IndentContext): string | null {
        // EXISTS関数の処理
        if (expr.type === 'function' && expr.name && expr.name.name) {
            const funcName = expr.name.name[0].value.toUpperCase();
            if (funcName === 'EXISTS' && expr.args && expr.args.value && expr.args.value[0] && expr.args.value[0].ast) {
                const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
                const subqueryResult = this.formatSubqueryWithContext(expr.args.value[0].ast, context.createSubqueryContext(6), true, isWhereCtx);
                
                if (isWhereCtx) {
                    return `EXISTS (\n${subqueryResult}\n${' '.repeat(context.baseKeywordLength - 2)})`;
                } else {
                    return `EXISTS (\n${subqueryResult}\n${context.getIndentString()})`;
                }
            }
        }
        
        // ANY/ALL関数の処理
        if (expr.type === 'function' && expr.name && expr.name.name) {
            const funcName = expr.name.name[0].value.toUpperCase();
            if ((funcName === 'ANY' || funcName === 'ALL') && expr.args && expr.args.value && expr.args.value[0] && expr.args.value[0].ast) {
                const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
                const subqueryResult = this.formatSubqueryWithContext(expr.args.value[0].ast, context.createSubqueryContext(6), true, isWhereCtx);
                
                if (isWhereCtx) {
                    return `${funcName} (\n${subqueryResult}\n${' '.repeat(context.baseKeywordLength - 2)})`;
                } else {
                    return `${funcName} (\n${subqueryResult}\n${context.getIndentString()})`;
                }
            }
        }
        
        return null;
    }

    private formatSubqueryWithContext(ast: any, subqueryContext: IndentContext, skipParentheses: boolean = false, isWhereContext: boolean = false): string {
        // サブクエリのASTから動的にキーワード長を計算
        const subqueryKeywordLength = this.calculateSubqueryKeywordLength(ast);
        
        // サブクエリ用のコンテキストを動的なキーワード長で再作成
        const parentContext = subqueryContext.parent || subqueryContext;
        const dynamicSubqueryContext = parentContext.createSubqueryContext(subqueryKeywordLength);
        
        // サブクエリ内容をフォーマット（動的コンテキストを使用）
        const subqueryResult = this.selectFormatter.formatSelectStatementWithContext(ast, dynamicSubqueryContext);
        
        // WHERE句とSELECT句で異なるインデント処理
        if (isWhereContext) {
            // WHERE句内のサブクエリ：ネストレベルに応じたコンパクトなインデント
            const originalParentContext = subqueryContext.parent || subqueryContext;
            // ネストレベルに応じてインデントを調整（レベル1: base-2, レベル2: base, レベル3: base+2など）
            const baseIndent = originalParentContext.baseKeywordLength;
            const compactIndent = ' '.repeat(Math.max(baseIndent + 1 , 2));
            
            const indentedSubquery = subqueryResult.split('\n').map((line) => {
                if (!line.trim()) { return line; } // 空行はそのまま
                return `${compactIndent}${line}`; // 最初の行(SELECT)も含めてすべてインデント
            }).join('\n');
            
            // skipParenthesesがtrueの場合はカッコを付けない
            if (skipParentheses) {
                return `\n${indentedSubquery}`;
            }
            
            // WHERE句用の閉じかっこ位置（ネストレベルに応じて調整）
            const closingIndent = ' '.repeat(Math.max(baseIndent + 1 , 0));
            return `(\n${indentedSubquery}\n${closingIndent})`;
        } else {
            // SELECT句内のサブクエリ：従来の深いインデント
            const subqueryIndentString = dynamicSubqueryContext.getIndentString();
            const indentedSubquery = subqueryResult.split('\n').map(line => 
                line.trim() ? `${subqueryIndentString}${line}` : line
            ).join('\n');
            
            // skipParenthesesがtrueの場合はカッコを付けない（expr_listで既にカッコが付くため）
            if (skipParentheses) {
                return `\n${indentedSubquery}\n`;
            }
            
            // SELECT句用の閉じかっこ位置（従来通り）
            const closingIndent = ' '.repeat(dynamicSubqueryContext.getClosingIndent());
            return `(\n${indentedSubquery}\n${closingIndent})`;
        }
    }

    // その他のメソッド群（関数、集約関数、ウィンドウ関数等）
    private formatFunctionWithContext(expr: any, context: IndentContext): string {
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
        
        // 引数の処理（関数引数コンテキストで）
        const argContext = context.createChildContext('function_arg');
        
        if (expr.args && expr.args.value && expr.args.value.length > 0) {
            const args = expr.args.value.map((arg: any) => this.formatExpressionWithContext(arg, argContext)).join(', ');
            return `${funcName}(${args})`;
        } else if (expr.args && Array.isArray(expr.args)) {
            const args = expr.args.map((arg: any) => this.formatExpressionWithContext(arg, argContext)).join(', ');
            return `${funcName}(${args})`;
        } else {
            return `${funcName}()`;
        }
    }

    private formatAggregateFunctionWithContext(expr: any, context: IndentContext): string {
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
                const argContext = context.createChildContext('function_arg');
                argStr += this.formatExpressionWithContext(expr.args.expr, argContext);
            }
            
            return `${funcName}(${argStr})`;
        }
        
        return `${funcName}()`;
    }

    private formatWindowFunctionWithContext(expr: any, context: IndentContext): string {
        const funcName = expr.name;
        
        // OVER句の処理
        let result = `${funcName}()`;
        
        if (expr.over && expr.over.as_window_specification && expr.over.as_window_specification.window_specification) {
            const windowSpec = expr.over.as_window_specification.window_specification;
            const parts: string[] = [];
            
            // PARTITION BY句
            if (windowSpec.partitionby && Array.isArray(windowSpec.partitionby)) {
                const argContext = context.createChildContext('function_arg');
                const partitionColumns = windowSpec.partitionby.map((col: any) => {
                    if (col.expr) {
                        return this.formatExpressionWithContext(col.expr, argContext);
                    }
                    return this.formatExpressionWithContext(col, argContext);
                }).join(', ');
                parts.push(`PARTITION BY ${partitionColumns}`);
            }
            
            // ORDER BY句
            if (windowSpec.orderby && Array.isArray(windowSpec.orderby)) {
                const argContext = context.createChildContext('function_arg');
                const orderColumns = windowSpec.orderby.map((col: any) => {
                    let result = this.formatExpressionWithContext(col.expr || col, argContext);
                    if (col.type && (col.type === 'ASC' || col.type === 'DESC')) {
                        result += ` ${col.type}`;
                    }
                    return result;
                }).join(', ');
                parts.push(`ORDER BY ${orderColumns}`);
            }
            
            if (parts.length > 0) {
                result += ` OVER (${parts.join(' ')})`;
            } else {
                result += ' OVER ()';
            }
        }
        
        return result;
    }

    private formatCastExpressionWithContext(expr: any, context: IndentContext): string {
        const expression = this.formatExpressionWithContext(expr.expr, context);
        const targetType = expr.target || 'UNKNOWN';
        
        // CAST(expr AS type) 形式かexpr::type形式かを判定
        if (expr.operator && expr.operator === '::') {
            return `${expression}::${targetType}`;
        } else {
            return `CAST(${expression} AS ${targetType})`;
        }
    }

    private formatUnaryExpressionWithContext(expr: any, context: IndentContext): string {
        const operator = expr.operator;
        
        // NOT EXISTSの特別処理
        if (operator === 'NOT' && expr.expr && expr.expr.type === 'function' && expr.expr.name && expr.expr.name.name) {
            const funcName = expr.expr.name.name[0].value.toUpperCase();
            if (funcName === 'EXISTS' && expr.expr.args && expr.expr.args.value && expr.expr.args.value[0] && expr.expr.args.value[0].ast) {
                const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
                const subqueryResult = this.formatSubqueryWithContext(expr.expr.ast, context.createSubqueryContext(6), true, isWhereCtx);
                
                if (isWhereCtx) {
                    return `NOT EXISTS (\n${subqueryResult}\n${' '.repeat(context.baseKeywordLength - 2)})`;
                } else {
                    return `NOT EXISTS (\n${subqueryResult}\n${context.getIndentString()})`;
                }
            }
        }
        
        const operand = this.formatExpressionWithContext(expr.expr, context);
        
        // 演算子によって前置か後置かを判定
        if (operator === 'NOT' || operator === '-' || operator === '+' || operator === 'NOT EXISTS') {
            return `${operator} ${operand}`;
        } else {
            return `${operand} ${operator}`;
        }
    }

    private formatArrayExpressionWithContext(expr: any, context: IndentContext): string {
        if (expr.value && Array.isArray(expr.value)) {
            const elements = expr.value.map((element: any) => this.formatExpressionWithContext(element, context)).join(', ');
            return `ARRAY[${elements}]`;
        }
        return 'ARRAY[]';
    }

    private formatExprListWithContext(expr: any, context: IndentContext): string {
        if (expr.value && Array.isArray(expr.value)) {
            // サブクエリを含む場合のチェック
            const hasSubquery = expr.value.some((v: any) => v.ast);
            
            if (hasSubquery) {
                // サブクエリを含む場合の処理
                const values = expr.value.map((v: any) => {
                    if (v.ast) {
                        const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
                        return this.formatSubqueryWithContext(v.ast, context.createSubqueryContext(6), true, isWhereCtx);
                    }
                    return this.formatExpressionWithContext(v, context.createChildContext('function_arg'));
                }).join(', ');
                return `(${values}\n${context.getClosingIndentString()})`;
            }
            
            // 通常の単一行フォーマット
            const values = expr.value.map((v: any) => {
                return this.formatExpressionWithContext(v, context.createChildContext('function_arg'));
            }).join(', ');
            return `(${values})`;
        }
        return '()';
    }

    private handleUndefinedExpression(expr: any, context: IndentContext): string {
        // サブクエリの検出 (type: undefined with ast property)
        if (expr.ast) {
            // WHERE句内のサブクエリの場合は特別処理
            const isWhereCtx = context.contextType === 'where_clause' || context.contextType === 'join_condition';
            return this.formatSubqueryWithContext(expr.ast, context.createSubqueryContext(6), false, isWhereCtx);
        }
        // カラムリストの検出 (type: undefined with columns property)
        if (expr.columns && Array.isArray(expr.columns)) {
            return expr.columns.map((col: any) => this.formatExpressionWithContext(col, context)).join(', ');
        }
        // その他のundefinedタイプはフォールバックへ
        return this.handleUnknownExpression(expr);
    }

    // ユーティリティメソッド群
    private formatKeyword(keyword: string): string {
        return this.options.keywordCase === 'upper' ? keyword.toUpperCase() : keyword.toLowerCase();
    }

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

    private formatParameterExpression(expr: any): string {
        return expr.value;
    }

    private handleUnknownExpression(expr: any): string {
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
     * IN句の複数値リストを改行フォーマット
     */
    private formatMultilineValueList(values: any[], context: IndentContext): string {
        const formattedValues = values.map((v: any) => {
            return this.formatExpressionWithContext(v, context.createChildContext('function_arg'));
        });
        
        // インデント計算
        const firstValueIndent = ' '.repeat(context.baseKeywordLength + 3);
        const subsequentValueIndent = ' '.repeat(context.baseKeywordLength + 1);
        const closingIndent = ' '.repeat(context.baseKeywordLength + 1);
        
        const lines: string[] = [];
        lines.push('(');
        
        // 最初の値
        lines.push(`${firstValueIndent}${formattedValues[0]}`);
        
        // 後続の値（カンマ前置き）
        for (let i = 1; i < formattedValues.length; i++) {
            lines.push(`${subsequentValueIndent}, ${formattedValues[i]}`);
        }
        
        lines.push(`${closingIndent})`);
        
        return lines.join('\n');
    }

    /**
     * サブクエリASTを抽出
     */
    private extractSubqueryAst(expr: any): any {
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

    /**
     * SELECT文をフォーマット
     */
    private formatSelectStatementWithContext(ast: any, context: IndentContext): string {
        return this.selectFormatter.formatSelectStatementWithContext(ast, context);
    }

    /**
     * サブクエリのキーワード長を計算
     */
    private calculateSubqueryKeywordLength(ast: any): number {
        const keywords = FormatterUtils.collectKeywordsFromStatement(ast);
        return keywords.length > 0 ? Math.max(...keywords.map(k => k.length)) : 6;
    }
}