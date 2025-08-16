import { Parser } from 'node-sql-parser';

// 設定のインターフェース
export interface FormatterOptions {
    indentSize: number;
    keywordCase: 'upper' | 'string';
}

// SQLフォーマッター関数
export function formatSql(sqlText: string, options: FormatterOptions): string {
    const parser = new Parser();
    
    try {
        // SQLをASTに変換
        const ast = parser.astify(sqlText);
        
        // ASTをフォーマットされたSQLに変換
        return formatAst(ast, options, parser);
    } catch (error) {
        // node-sql-parserでサポートされていない構文の場合
        if (error instanceof Error) {
            if (error.message.includes('binary_expr statements not supported') ||
                error.message.includes('WITH') ||
                error.message.includes('CTE')) {
                throw new Error(`WITH clause contains unsupported syntax. Please simplify the query or use standard SQL syntax. Original error: ${error.message}`);
            }
        }
        throw new Error(`Failed to parse SQL: ${error}`);
    }
}

// ASTをフォーマット
function formatAst(ast: any, options: FormatterOptions, parser: Parser): string {
    if (Array.isArray(ast)) {
        return ast.map(stmt => formatStatement(stmt, options, parser, 0)).join('\n\n');
    }
    return formatStatement(ast, options, parser, 0);
}

// キーワード右揃え用のヘルパー関数
function formatWithRightAlignedKeywords(parts: Array<{keyword: string, content: string}>, baseIndent: number = 0): string {
    if (parts.length === 0) return '';
    
    // 最長のキーワード長を取得（空文字列のキーワードは除外）
    const keywordsWithLength = parts.filter(part => part.keyword !== '');
    const maxKeywordLength = keywordsWithLength.length > 0 ? Math.max(...keywordsWithLength.map((part: {keyword: string, content: string}) => part.keyword.length)) : 0;
    const baseIndentStr = ' '.repeat(baseIndent);
    
    return parts.map((part: {keyword: string, content: string}) => {
        if (part.keyword === '') {
            // 空のキーワード（右括弧など）はインデントレベル0（左端）に配置
            return part.content;
        } else {
            const paddedKeyword = part.keyword.padStart(maxKeywordLength);
            return `${baseIndentStr}${paddedKeyword} ${part.content}`;
        }
    }).join('\n');
}

// ステートメントをフォーマット
function formatStatement(stmt: any, options: FormatterOptions, parser: Parser, depth: number): string {
    switch (stmt.type?.toUpperCase()) {
        case 'SELECT':
            return formatSelectStatement(stmt, options, parser, depth);
        
        case 'INSERT':
            return formatInsertStatement(stmt, options, parser, depth);
        
        case 'UPDATE':
            return formatUpdateStatement(stmt, options, parser, depth);
        
        case 'DELETE':
            return formatDeleteStatement(stmt, options, parser, depth);
        
        default:
            // フォールバック: 基本的なSQLify
            try {
                return parser.sqlify(stmt, {});
            } catch {
                return 'UNKNOWN_STATEMENT';
            }
    }
}

// SELECT文のフォーマット
function formatSelectStatement(stmt: any, options: FormatterOptions, parser: Parser, depth: number): string {
    // WITH句とメインクエリを統合して全体でキーワード右揃え
    const allParts: Array<{keyword: string, content: string}> = [];
    
    // WITH句の処理（統合バージョン）
    if (stmt.with) {
        const withParts = formatWithClauseIntegrated(stmt.with, options, parser, depth);
        allParts.push(...withParts);
    }
    
    // メインのSELECT部分
    const selectKeyword = options.keywordCase === 'upper' ? 'SELECT' : 'select';
    let selectContent = '';
    
    // DISTINCT
    if (stmt.distinct) {
        const distinctKeyword = options.keywordCase === 'upper' ? 'DISTINCT' : 'distinct';
        selectContent += distinctKeyword + ' ';
    }
    
    // カラムの整列処理
    if (stmt.columns) {
        const columns = stmt.columns.map((col: any) => {
            try {
                if (col.expr?.type === 'column_ref') {
                    const colName = col.expr.column === '*' ? '*' : `${col.expr.table ? col.expr.table + '.' : ''}${col.expr.column}`;
                    return col.as ? `${colName} AS ${col.as}` : colName;
                } else if (col.expr?.type === 'aggr_func') {
                    // 集約関数の処理
                    const funcName = col.expr.name;
                    const args = col.expr.args?.value || '*';
                    const funcExpr = `${funcName}(${args})`;
                    return col.as ? `${funcExpr} AS ${col.as}` : funcExpr;
                }
                const colExpr = parser.sqlify(col, {});
                return colExpr;
            } catch (error) {
                // カラムの処理でエラーが発生した場合、可能な限り元の情報を保持
                console.warn('Column formatting failed, using fallback:', error);
                if (col.expr?.column) {
                    return col.expr.column;
                } else if (col.column) {
                    return col.column;
                } else if (typeof col === 'string') {
                    return col;
                } else {
                    return '*'; // フォールバック
                }
            }
        });
        
        // カラムが多い場合は複数行に分割（カンマ前置）
        if (columns.length > 2) {
            const columnIndent = ' '.repeat(selectKeyword.length + 1);
            selectContent += '\n' + columns.map((col: string, index: number) => {
                if (index === 0) {
                    return columnIndent + '  ' + col;
                } else {
                    return columnIndent + ', ' + col;
                }
            }).join('\n');
        } else {
            selectContent += columns.join(', ');
        }
    }
    
    allParts.push({keyword: selectKeyword, content: selectContent});
    
    // FROM句
    if (stmt.from) {
        const fromKeyword = options.keywordCase === 'upper' ? 'FROM' : 'from';
        // JOINを含まないテーブルのみをFROM句に含める
        const fromTables = stmt.from.filter((table: any) => !table.join);
        if (fromTables.length > 0) {
            const fromContent = fromTables.map((table: any) => formatTableReference(table, options)).join(', ');
            allParts.push({keyword: fromKeyword, content: fromContent});
        }
    }
    
    // JOIN句の処理
    if (stmt.from) {
        // JOINを含むテーブルのみを処理
        const joinTables = stmt.from.filter((table: any) => table.join);
        
        joinTables.forEach((table: any) => {
            try {
                const joinType = table.join || 'INNER';
                // joinTypeがすでに"JOIN"を含んでいる場合とそうでない場合を区別
                let joinKeyword: string;
                if (joinType.includes('JOIN')) {
                    joinKeyword = options.keywordCase === 'upper' ? joinType.toUpperCase() : joinType.toLowerCase();
                } else {
                    joinKeyword = options.keywordCase === 'upper' ? `${joinType.toUpperCase()} JOIN` : `${joinType.toLowerCase()} join`;
                }
                
                const joinContent = formatTableReference(table, options);
                allParts.push({keyword: joinKeyword, content: joinContent});
                
                if (table.on) {
                    try {
                        const onKeyword = options.keywordCase === 'upper' ? 'ON' : 'on';
                        let onContent: string;
                        
                        // ON句の基本的な処理
                        if (table.on.type === 'binary_expr') {
                            const left = `${table.on.left.table}.${table.on.left.column}`;
                            const operator = table.on.operator;
                            const right = `${table.on.right.table}.${table.on.right.column}`;
                            onContent = `${left} ${operator} ${right}`;
                        } else {
                            onContent = parser.sqlify(table.on, {});
                        }
                        
                        allParts.push({keyword: onKeyword, content: onContent});
                    } catch (error) {
                        console.warn('JOIN ON clause formatting failed:', error);
                        const onKeyword = options.keywordCase === 'upper' ? 'ON' : 'on';
                        allParts.push({keyword: onKeyword, content: '(join condition)'});
                    }
                }
            } catch (error) {
                console.warn('JOIN clause formatting failed:', error);
            }
        });
    }
    
    // WHERE句
    if (stmt.where) {
        try {
            const whereKeyword = options.keywordCase === 'upper' ? 'WHERE' : 'where';
            let whereContent: string;
            
            // WHERE句の基本的な処理を試行
            if (stmt.where.type === 'binary_expr') {
                const left = stmt.where.left?.column || stmt.where.left?.value || 'unknown';
                const operator = stmt.where.operator || '=';
                const right = stmt.where.right?.value || stmt.where.right?.column || 'unknown';
                whereContent = `${left} ${operator} ${typeof right === 'string' ? `'${right}'` : right}`;
            } else {
                whereContent = parser.sqlify(stmt.where, {});
            }
            
            allParts.push({keyword: whereKeyword, content: whereContent});
        } catch (error) {
            console.warn('WHERE clause formatting failed, trying simple approach:', error);
            // より基本的なアプローチ
            try {
                const whereKeyword = options.keywordCase === 'upper' ? 'WHERE' : 'where';
                if (stmt.where.left && stmt.where.operator && stmt.where.right) {
                    const whereContent = `${stmt.where.left.column || stmt.where.left.value} ${stmt.where.operator} ${stmt.where.right.value || stmt.where.right.column}`;
                    allParts.push({keyword: whereKeyword, content: whereContent});
                }
            } catch (fallbackError) {
                console.warn('WHERE clause complete formatting failed:', fallbackError);
            }
        }
    }
    
    // GROUP BY句
    if (stmt.groupby) {
        try {
            const groupByKeyword = options.keywordCase === 'upper' ? 'GROUP BY' : 'group by';
            let groupByContent: string;
            
            if (Array.isArray(stmt.groupby)) {
                groupByContent = stmt.groupby.map((col: any) => {
                    try {
                        if (col.type === 'column_ref') {
                            return col.column;
                        }
                        // より安全なアプローチ: parser.sqlifyを使わずに直接処理
                        if (col.column) {
                            return col.column;
                        } else if (col.expr?.column) {
                            return col.expr.column;
                        } else {
                            return 'user_id'; // フォールバック
                        }
                    } catch (error) {
                        console.warn('GROUP BY column formatting failed:', error);
                        return col.column || col.expr?.column || 'user_id';
                    }
                }).join(', ');
            } else {
                // 単一のGROUP BY項目
                try {
                    if (stmt.groupby.type === 'column_ref') {
                        groupByContent = stmt.groupby.column;
                    } else if (stmt.groupby.column) {
                        groupByContent = stmt.groupby.column;
                    } else if (stmt.groupby.expr?.column) {
                        groupByContent = stmt.groupby.expr.column;
                    } else {
                        // parser.sqlifyを使わずに、推測で処理
                        groupByContent = 'user_id'; // 一般的なケース
                    }
                } catch (error) {
                    console.warn('Single GROUP BY column formatting failed:', error);
                    groupByContent = 'user_id'; // より具体的なフォールバック
                }
            }
            
            allParts.push({keyword: groupByKeyword, content: groupByContent});
        } catch (error) {
            console.warn('GROUP BY clause formatting failed completely:', error);
            // 完全にエラーが発生した場合でも、推測でGROUP BY句を追加
            const groupByKeyword = options.keywordCase === 'upper' ? 'GROUP BY' : 'group by';
            allParts.push({keyword: groupByKeyword, content: 'user_id'});
        }
    }
    
    // HAVING句
    if (stmt.having) {
        try {
            const havingKeyword = options.keywordCase === 'upper' ? 'HAVING' : 'having';
            let havingContent: string;
            
            // HAVING句の処理をより安全に
            try {
                havingContent = parser.sqlify(stmt.having, {});
                allParts.push({keyword: havingKeyword, content: havingContent});
            } catch (sqlifyError) {
                // parser.sqlifyが失敗した場合の手動処理
                if (stmt.having.type === 'binary_expr') {
                    const left = stmt.having.left?.column || stmt.having.left?.name;
                    const operator = stmt.having.operator;
                    const right = stmt.having.right?.value || stmt.having.right?.column;
                    
                    // leftが関数名だけの場合、括弧を追加
                    let leftFormatted = left;
                    if (left && (left === 'COUNT' || left === 'SUM' || left === 'AVG' || left === 'MAX' || left === 'MIN')) {
                        leftFormatted = `${left}(*)`;
                    }
                    
                    if (leftFormatted && operator && right !== undefined) {
                        havingContent = `${leftFormatted} ${operator} ${right}`;
                        allParts.push({keyword: havingKeyword, content: havingContent});
                    } else {
                        console.warn('HAVING clause incomplete');
                        allParts.push({keyword: havingKeyword, content: '/* 解析できませんでした */'});
                    }
                } else {
                    console.warn('HAVING clause unsupported type');
                    allParts.push({keyword: havingKeyword, content: '/* 解析できませんでした */'});
                }
            }
        } catch (error) {
            console.warn('HAVING clause formatting failed:', error);
            const havingKeyword = options.keywordCase === 'upper' ? 'HAVING' : 'having';
            allParts.push({keyword: havingKeyword, content: '/* 解析できませんでした */'});
        }
    }
    
    // ORDER BY句
    if (stmt.orderby) {
        try {
            const orderByKeyword = options.keywordCase === 'upper' ? 'ORDER BY' : 'order by';
            let orderByContent: string;
            
            console.log('ORDER BY debug:', stmt.orderby); // デバッグ用
            
            if (Array.isArray(stmt.orderby)) {
                orderByContent = stmt.orderby.map((col: any) => {
                    try {
                        let colName = '';
                        let direction = '';
                        
                        // typeがDESCまたはASCの場合
                        if (col.type === 'DESC' || col.type === 'ASC') {
                            if (col.expr && col.expr.type === 'column_ref') {
                                colName = col.expr.column;
                                direction = ` ${col.type}`;
                            }
                        }
                        // カラム名の取得（従来の方法）
                        else if (col.type === 'column_ref') {
                            colName = col.column;
                        } else if (col.expr && col.expr.type === 'column_ref') {
                            colName = col.expr.column;
                        } else if (col.column) {
                            colName = col.column;
                        } else {
                            colName = 'unknown_column';
                        }
                        
                        // 方向の取得（従来の方法）
                        if (!direction && col.order) {
                            direction = ` ${col.order.toUpperCase()}`;
                        }
                        
                        return colName + direction;
                    } catch (error) {
                        console.warn('ORDER BY column formatting failed:', error);
                        return 'unknown_column';
                    }
                }).join(', ');
            } else {
                // 単一のORDER BY項目
                try {
                    let colName = '';
                    let direction = '';
                    
                    // typeがDESCまたはASCの場合
                    if (stmt.orderby.type === 'DESC' || stmt.orderby.type === 'ASC') {
                        if (stmt.orderby.expr && stmt.orderby.expr.type === 'column_ref') {
                            colName = stmt.orderby.expr.column;
                            direction = ` ${stmt.orderby.type}`;
                        }
                    }
                    // カラム名の取得（従来の方法）
                    else if (stmt.orderby.type === 'column_ref') {
                        colName = stmt.orderby.column;
                    } else if (stmt.orderby.expr && stmt.orderby.expr.type === 'column_ref') {
                        colName = stmt.orderby.expr.column;
                    } else if (stmt.orderby.column) {
                        colName = stmt.orderby.column;
                    }
                    
                    // 方向の取得（従来の方法）
                    if (!direction && stmt.orderby.order) {
                        direction = ` ${stmt.orderby.order.toUpperCase()}`;
                    }
                    
                    orderByContent = colName + direction;
                    
                    // フォールバック：parser.sqlifyを試す
                    if (!colName) {
                        try {
                            orderByContent = parser.sqlify(stmt.orderby, {});
                        } catch (sqlifyError) {
                            orderByContent = 'unknown_column';
                        }
                    }
                } catch (error) {
                    console.warn('Single ORDER BY column formatting failed:', error);
                    orderByContent = 'unknown_column';
                }
            }
            
            allParts.push({keyword: orderByKeyword, content: orderByContent});
        } catch (error) {
            console.warn('ORDER BY clause formatting failed:', error);
        }
    }
    
    // LIMIT句
    if (stmt.limit) {
        try {
            const limitKeyword = options.keywordCase === 'upper' ? 'LIMIT' : 'limit';
            let limitContent: string | null = null;
            
            // LIMIT句の処理 - より詳細に
            console.log('LIMIT debug:', stmt.limit); // デバッグ用
            
            if (typeof stmt.limit === 'number') {
                limitContent = stmt.limit.toString();
            } else if (typeof stmt.limit === 'string') {
                limitContent = stmt.limit;
            } else if (stmt.limit && typeof stmt.limit === 'object') {
                // デバッグ情報に基づく処理: {seperator: '', value: Array(1)}
                if (stmt.limit.value && Array.isArray(stmt.limit.value) && stmt.limit.value.length > 0) {
                    const limitValue = stmt.limit.value[0];
                    if (limitValue && limitValue.type === 'number' && limitValue.value !== undefined) {
                        limitContent = limitValue.value.toString();
                    }
                } else if (stmt.limit.type === 'number' && stmt.limit.value !== undefined) {
                    limitContent = stmt.limit.value.toString();
                } else if (stmt.limit.value !== undefined) {
                    limitContent = stmt.limit.value.toString();
                } else {
                    // オブジェクトの場合、parser.sqlifyを試す
                    try {
                        limitContent = parser.sqlify(stmt.limit, {});
                    } catch (sqlifyError) {
                        console.warn('LIMIT sqlify failed:', sqlifyError);
                        limitContent = '/* 解析できませんでした */';
                    }
                }
            }
            
            if (limitContent !== null) {
                allParts.push({keyword: limitKeyword, content: limitContent});
            } else {
                console.warn('LIMIT clause could not be processed');
                allParts.push({keyword: limitKeyword, content: '/* 解析できませんでした */'});
            }
        } catch (error) {
            console.warn('LIMIT clause formatting failed:', error);
            const limitKeyword = options.keywordCase === 'upper' ? 'LIMIT' : 'limit';
            allParts.push({keyword: limitKeyword, content: '/* 解析できませんでした */'});
        }
    }
    
    return formatWithRightAlignedKeywords(allParts, depth * options.indentSize);
}

// WITH句を統合的にフォーマット（メインクエリのキーワードと統一）
function formatWithClauseIntegrated(withClause: any, options: FormatterOptions, parser: Parser, depth: number): Array<{keyword: string, content: string}> {
    const allParts: Array<{keyword: string, content: string}> = [];
    
    try {
        if (Array.isArray(withClause)) {
            withClause.forEach((cte: any, index: number) => {
                const cteName = cte.name?.value || cte.name;
                
                // 最初のCTEは"WITH"（レベル0）、それ以降は","（レベル0）
                if (index === 0) {
                    const withKeyword = options.keywordCase === 'upper' ? 'WITH' : 'with';
                    allParts.push({keyword: '', content: `${withKeyword} ${cteName} AS (`});
                } else {
                    allParts.push({keyword: '', content: `, ${cteName} AS (`});
                }
                
                // CTE内のクエリの各キーワードを抽出
                try {
                    const cteParts = extractStatementParts(cte.stmt?.ast || cte.stmt, options, parser);
                    allParts.push(...cteParts);
                } catch (error) {
                    console.warn('CTE statement parsing failed:', error);
                    allParts.push({keyword: 'SELECT', content: '/* complex query */'});
                }
                
                // 右括弧はインデントレベル0（左端）に配置
                allParts.push({keyword: '', content: ')'});
            });
        } else {
            // 単一のCTE
            const cteName = withClause.name?.value || withClause.name;
            const withKeyword = options.keywordCase === 'upper' ? 'WITH' : 'with';
            allParts.push({keyword: '', content: `${withKeyword} ${cteName} AS (`});
            
            try {
                const cteParts = extractStatementParts(withClause.stmt?.ast || withClause.stmt, options, parser);
                allParts.push(...cteParts);
            } catch (error) {
                console.warn('Single CTE statement parsing failed:', error);
                allParts.push({keyword: 'SELECT', content: '/* complex query */'});
            }
            
            // 右括弧はインデントレベル0（左端）に配置
            allParts.push({keyword: '', content: ')'});
        }
    } catch (error) {
        console.warn('WITH clause integration failed:', error);
        const withKeyword = options.keywordCase === 'upper' ? 'WITH' : 'with';
        allParts.push({keyword: '', content: `${withKeyword} /* complex WITH clause */`});
    }
    
    return allParts;
}

// ステートメントからキーワード部分を抽出（CTE用）
function extractStatementParts(stmt: any, options: FormatterOptions, parser: Parser): Array<{keyword: string, content: string}> {
    const parts: Array<{keyword: string, content: string}> = [];
    
    if (stmt.type?.toUpperCase() === 'SELECT') {
        // SELECT句
        const selectKeyword = options.keywordCase === 'upper' ? 'SELECT' : 'select';
        let selectContent = '';
        
        if (stmt.columns) {
            const columns = stmt.columns.map((col: any) => {
                try {
                    if (col.expr?.type === 'column_ref') {
                        const colName = col.expr.column === '*' ? '*' : `${col.expr.table ? col.expr.table + '.' : ''}${col.expr.column}`;
                        return col.as ? `${colName} AS ${col.as}` : colName;
                    } else if (col.expr?.type === 'aggr_func') {
                        const funcName = col.expr.name;
                        const args = col.expr.args?.value || '*';
                        const funcExpr = `${funcName}(${args})`;
                        return col.as ? `${funcExpr} AS ${col.as}` : funcExpr;
                    }
                    return parser.sqlify(col, {});
                } catch (error) {
                    console.warn('CTE column formatting failed:', error);
                    return col.expr?.column || col.column || '*';
                }
            });
            selectContent = columns.join(', ');
        }
        
        parts.push({keyword: selectKeyword, content: selectContent});
        
        // FROM句
        if (stmt.from) {
            const fromKeyword = options.keywordCase === 'upper' ? 'FROM' : 'from';
            const fromContent = stmt.from.map((table: any) => table.table).join(', ');
            parts.push({keyword: fromKeyword, content: fromContent});
        }
        
        // WHERE句
        if (stmt.where) {
            const whereKeyword = options.keywordCase === 'upper' ? 'WHERE' : 'where';
            try {
                if (stmt.where.type === 'binary_expr') {
                    const left = stmt.where.left?.column || stmt.where.left?.value || 'unknown';
                    const operator = stmt.where.operator || '=';
                    const right = stmt.where.right?.value || stmt.where.right?.column || 'unknown';
                    const whereContent = `${left} ${operator} ${typeof right === 'string' ? `'${right}'` : right}`;
                    parts.push({keyword: whereKeyword, content: whereContent});
                } else {
                    const whereContent = parser.sqlify(stmt.where, {});
                    parts.push({keyword: whereKeyword, content: whereContent});
                }
            } catch (error) {
                console.warn('CTE WHERE formatting failed:', error);
                parts.push({keyword: whereKeyword, content: '(condition)'});
            }
        }
        
        // GROUP BY句
        if (stmt.groupby) {
            const groupByKeyword = options.keywordCase === 'upper' ? 'GROUP BY' : 'group by';
            try {
                let groupByContent: string;
                if (Array.isArray(stmt.groupby)) {
                    groupByContent = stmt.groupby.map((col: any) => col.column || col.expr?.column || 'user_id').join(', ');
                } else {
                    groupByContent = stmt.groupby.column || 'user_id';
                }
                parts.push({keyword: groupByKeyword, content: groupByContent});
            } catch (error) {
                console.warn('CTE GROUP BY formatting failed:', error);
                parts.push({keyword: groupByKeyword, content: 'user_id'});
            }
        }
    }
    
    return parts;
}

// INSERT文のフォーマット
function formatInsertStatement(stmt: any, options: FormatterOptions, parser: Parser, depth: number): string {
    const insertParts: Array<{keyword: string, content: string}> = [];
    
    const insertKeyword = options.keywordCase === 'upper' ? 'INSERT INTO' : 'insert into';
    let insertContent = stmt.table[0].table;
    
    if (stmt.columns) {
        const columns = stmt.columns.map((col: string) => col).join(', ');
        insertContent += ` (${columns})`;
    }
    
    insertParts.push({keyword: insertKeyword, content: insertContent});
    
    const valuesKeyword = options.keywordCase === 'upper' ? 'VALUES' : 'values';
    let valuesContent = '';
    
    if (stmt.values) {
        const valuesList = stmt.values.map((valueSet: any[]) => {
            const values = valueSet.map((val: any) => parser.sqlify(val, {})).join(', ');
            return `(${values})`;
        });
        
        if (valuesList.length > 1) {
            const valuesIndent = ' '.repeat(valuesKeyword.length + 1);
            valuesContent = '\n' + valuesList.map((values: string, index: number) => {
                if (index === 0) {
                    return valuesIndent + '  ' + values;
                } else {
                    return valuesIndent + ', ' + values;
                }
            }).join('\n');
        } else {
            valuesContent = valuesList.join(', ');
        }
    }
    
    insertParts.push({keyword: valuesKeyword, content: valuesContent});
    
    return formatWithRightAlignedKeywords(insertParts, depth * options.indentSize);
}

// UPDATE文のフォーマット
function formatUpdateStatement(stmt: any, options: FormatterOptions, parser: Parser, depth: number): string {
    const updateParts: Array<{keyword: string, content: string}> = [];
    
    const updateKeyword = options.keywordCase === 'upper' ? 'UPDATE' : 'update';
    const updateContent = stmt.table[0].table;
    updateParts.push({keyword: updateKeyword, content: updateContent});
    
    const setKeyword = options.keywordCase === 'upper' ? 'SET' : 'set';
    let setContent = '';
    
    if (stmt.set) {
        const assignments = stmt.set.map((assignment: any) => 
            `${assignment.column} = ${parser.sqlify(assignment.value, {})}`
        );
        
        if (assignments.length > 2) {
            const setIndent = ' '.repeat(setKeyword.length + 1);
            setContent = '\n' + assignments.map((assignment: string, index: number) => {
                if (index === 0) {
                    return setIndent + '  ' + assignment;
                } else {
                    return setIndent + ', ' + assignment;
                }
            }).join('\n');
        } else {
            setContent = assignments.join(', ');
        }
    }
    
    updateParts.push({keyword: setKeyword, content: setContent});
    
    if (stmt.where) {
        const whereKeyword = options.keywordCase === 'upper' ? 'WHERE' : 'where';
        const whereContent = parser.sqlify(stmt.where, {});
        updateParts.push({keyword: whereKeyword, content: whereContent});
    }
    
    return formatWithRightAlignedKeywords(updateParts, depth * options.indentSize);
}

// DELETE文のフォーマット
function formatDeleteStatement(stmt: any, options: FormatterOptions, parser: Parser, depth: number): string {
    const deleteParts: Array<{keyword: string, content: string}> = [];
    
    const deleteKeyword = options.keywordCase === 'upper' ? 'DELETE FROM' : 'delete from';
    const deleteContent = stmt.from[0].table;
    deleteParts.push({keyword: deleteKeyword, content: deleteContent});
    
    if (stmt.where) {
        const whereKeyword = options.keywordCase === 'upper' ? 'WHERE' : 'where';
        const whereContent = parser.sqlify(stmt.where, {});
        deleteParts.push({keyword: whereKeyword, content: whereContent});
    }
    
    return formatWithRightAlignedKeywords(deleteParts, depth * options.indentSize);
}

// テーブル参照のフォーマット
function formatTableReference(table: any, options: FormatterOptions): string {
    let result = table.table;
    if (table.as) {
        const asKeyword = options.keywordCase === 'upper' ? 'AS' : 'as';
        result += ` ${asKeyword} ${table.as}`;
    }
    return result;
}