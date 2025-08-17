import { IndentContext, FormatterOptions } from "../core/indent-context";
import { ExpressionFormatter } from "../expressions/expression-formatter";
import { FormatterUtils } from "../utils/formatter-utils";

/**
 * SELECT文フォーマッター
 */
export class SelectFormatter {
  private options: Required<FormatterOptions>;
  private expressionFormatter: ExpressionFormatter;

  constructor(
    options: Required<FormatterOptions>,
    expressionFormatter: ExpressionFormatter
  ) {
    this.options = options;
    this.expressionFormatter = expressionFormatter;
  }

  /**
   * SELECT文をフォーマット（新しいIndentContext対応版）
   */
  formatSelectStatementWithContext(stmt: any, context: IndentContext, useStandardFormat: boolean = false): string {
    const parts: string[] = [];

    // メインクエリでWITH句がある場合のみ、CTE+メインクエリ全体でのキーワード長を再計算
    let actualContext = context;
    if (
      context.nestLevel === 0 &&
      context.contextType === "main" &&
      stmt.with
    ) {
      // WITH句がある場合は全体の統一キーワード長を計算
      const globalMaxKeywordLength =
        FormatterUtils.calculateGlobalMaxKeywordLength(stmt);
      actualContext = new IndentContext(
        context.nestLevel,
        context.contextType,
        globalMaxKeywordLength,
        context.parent
      );
    } else {
      // CTE内クエリなど、既に適切なキーワード長が設定されている場合はそのまま使用
      actualContext = context;
    }

    // WITH句の処理（ネストしたCTEの場合）
    if (stmt.with) {
      parts.push(this.formatWithClauseWithContext(stmt.with, actualContext, useStandardFormat));
    }

    // SELECT句
    parts.push(this.formatSelectClauseWithContext(stmt, actualContext, useStandardFormat));

    // FROM句
    if (stmt.from) {
      parts.push(this.formatFromClauseWithContext(stmt.from, actualContext, useStandardFormat));
    }

    // WHERE句
    if (stmt.where) {
      parts.push(this.formatWhereClauseWithContext(stmt.where, actualContext));
    }

    // GROUP BY句
    if (stmt.groupby) {
      parts.push(
        this.formatGroupByClauseWithContext(stmt.groupby, actualContext)
      );
    }

    // HAVING句
    if (stmt.having) {
      parts.push(
        this.formatHavingClauseWithContext(stmt.having, actualContext)
      );
    }

    // ORDER BY句
    if (stmt.orderby) {
      parts.push(
        this.formatOrderByClauseWithContext(stmt.orderby, actualContext)
      );
    }

    // LIMIT句（値がある場合のみ）
    if (stmt.limit && stmt.limit.value && stmt.limit.value.length > 0) {
      parts.push(this.formatLimitClauseWithContext(stmt.limit, actualContext));
    }

    // UNION/INTERSECT/EXCEPT句の処理
    if (stmt._next && stmt.set_op) {
      const setOpKeyword = this.formatKeyword(
        stmt.set_op.toUpperCase()
      ).padStart(actualContext.baseKeywordLength, " ");
      parts.push(setOpKeyword);
      parts.push(
        this.formatSelectStatementWithContext(stmt._next, actualContext, useStandardFormat)
      );
    }

    return parts.join("\n");
  }

  /**
   * WITH句をフォーマット（新しいIndentContext対応版）
   */
  private formatWithClauseWithContext(
    withClause: any,
    context: IndentContext,
    useStandardFormat: boolean = false
  ): string {
    if (!withClause || !Array.isArray(withClause)) {
      return this.formatKeyword("WITH") + " /* invalid CTE */";
    }

    const parts: string[] = [];

    withClause.forEach((cte: any, index: number) => {
      const cteName = cte.name?.value || cte.name || "unnamed_cte";
      const cteQuery = cte.stmt?.ast || cte.stmt;

      if (index === 0) {
        // WITHキーワードも右揃えする
        const withKeyword = "WITH";
        parts.push(`${withKeyword} ${cteName} AS (`);
      } else {
        // 2番目以降のCTEもインデントを統一
        const commaIndent = " ".repeat(
          Math.max(0, context.baseKeywordLength - 2)
        );
        parts.push(`,    ${cteName} AS (`);
      }

      if (cteQuery) {
        // CTE内クエリは現在のコンテキストと同じキーワード長でフォーマット（CTE+メインクエリ統一）
        // CTE専用のコンテキストを作成（統一キーワード長を保持）
        const cteContext = new IndentContext(
          0, // CTE内もルートレベル扱い
          "main", // メインクエリタイプ
          context.baseKeywordLength, // 統一されたキーワード長を引き継ぎ
          context.parent,
          false // CTEは常にコンパクト形式
        );
        const formattedQuery = this.formatSelectStatementWithContext(
          cteQuery,
          cteContext,
          useStandardFormat
        );
        parts.push(`${formattedQuery}`);
      }
      parts.push(")");
    });

    return parts.join("\n");
  }

  /**
   * SELECT句をフォーマット（新しいIndentContext対応版）
   */
  private formatSelectClauseWithContext(
    stmt: any,
    context: IndentContext,
    useStandardFormat: boolean = false
  ): string {
    const keyword = this.formatKeyword("SELECT");

    if (!stmt.columns || stmt.columns.length === 0) {
      return keyword;
    }

    // SELECTキーワードも右揃えする
    const selectKeyword = keyword.padStart(context.baseKeywordLength, " ");

    // カラムをフォーマット（SELECT句のコンテキストで）
    const selectContext = context.createSiblingContext("select_clause");
    const formattedColumns = this.formatColumnsWithAliasAlignment(
      stmt.columns,
      selectContext
    );

    // 結果
    const lines = [];

    // 単一カラムの場合もuseStandardFormatを考慮
    if (formattedColumns.length === 1) {
      if (useStandardFormat) {
        // 標準形式：SELECT + 改行 + カラム
        const columnIndent = " ".repeat(context.baseKeywordLength + 1);
        return `${selectKeyword}\n${columnIndent}${formattedColumns[0]}`;
      } else {
        // コンパクト形式：SELECT カラム（同一行）
        return `${selectKeyword} ${formattedColumns[0]}`;
      }
    }
    
    // 複数カラムの場合：改行制御
    // useStandardFormat = true (SELECTで始まる) → 標準形式（改行あり）
    // useStandardFormat = false (WITHで始まる) → コンパクト形式（改行なし）
    const shouldUseCompactFormat = !useStandardFormat;
    
    if (shouldUseCompactFormat) {
      // コンパクト形式：SELECTキーワードと最初のカラムを同じ行に
      const firstLine = `${selectKeyword} ${formattedColumns[0]}`;
      lines.push(firstLine);
      
      // 残りのカラム（カンマ前置き）
      const commaIndent = " ".repeat(Math.max(0, context.baseKeywordLength - 1));
      for (let i = 1; i < formattedColumns.length; i++) {
        lines.push(`${commaIndent}, ${formattedColumns[i]}`);
      }
    } else {
      // 標準形式：SELECTキーワード後に改行
      lines.push(selectKeyword);
      
      // カラムの開始位置を動的に計算
      const columnIndent = " ".repeat(context.baseKeywordLength + 1);
      
      // 最初のカラム
      lines.push(`${columnIndent}${formattedColumns[0]}`);
      
      // 残りのカラム（カンマ前置き）
      const commaIndent = " ".repeat(Math.max(0, context.baseKeywordLength - 1));
      for (let i = 1; i < formattedColumns.length; i++) {
        lines.push(`${commaIndent}, ${formattedColumns[i]}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * FROM句をフォーマット（新しいIndentContext対応版）
   */
  private formatFromClauseWithContext(
    fromClause: any[],
    context: IndentContext,
    useStandardFormat: boolean = false
  ): string {
    const keyword = this.formatKeyword("FROM").padStart(
      context.baseKeywordLength,
      " "
    );

    // JOINが含まれているかチェック
    const hasJoin = fromClause.some((table, index) => index > 0 && table.join);

    if (fromClause.length === 1 && !hasJoin) {
      // 単純なテーブル
      const table = this.formatTableWithContext(fromClause[0], context, useStandardFormat);
      return `${keyword} ${table}`;
    }

    // 複雑なFROM句（JOIN含む）の処理
    return `${keyword} ${this.formatComplexFromWithContext(
      fromClause,
      context,
      useStandardFormat
    )}`;
  }

  /**
   * WHERE句をフォーマット（新しいIndentContext対応版）
   */
  private formatWhereClauseWithContext(
    whereClause: any,
    context: IndentContext
  ): string {
    const keyword = this.formatKeyword("WHERE").padStart(
      context.baseKeywordLength,
      " "
    );
    const whereContext = context.createSiblingContext("where_clause");
    const condition = this.expressionFormatter.formatExpressionWithContext(
      whereClause,
      whereContext
    );
    return `${keyword} ${condition}`;
  }

  /**
   * GROUP BY句をフォーマット（新しいIndentContext対応版）
   */
  private formatGroupByClauseWithContext(
    groupByClause: any,
    context: IndentContext
  ): string {
    const keyword = this.formatKeyword("GROUP BY").padStart(
      context.baseKeywordLength,
      " "
    );

    // GROUP BY句が配列でない場合の対応
    if (!Array.isArray(groupByClause)) {
      groupByClause = [groupByClause];
    }

    const columns = groupByClause
      .map((col: any) =>
        this.expressionFormatter.formatExpressionWithContext(col, context)
      )
      .join(", ");
    return `${keyword} ${columns}`;
  }

  /**
   * HAVING句をフォーマット（新しいIndentContext対応版）
   */
  private formatHavingClauseWithContext(
    havingClause: any,
    context: IndentContext
  ): string {
    const keyword = this.formatKeyword("HAVING").padStart(
      context.baseKeywordLength,
      " "
    );
    const condition = this.expressionFormatter.formatExpressionWithContext(
      havingClause,
      context
    );
    return `${keyword} ${condition}`;
  }

  /**
   * ORDER BY句をフォーマット（新しいIndentContext対応版）
   */
  private formatOrderByClauseWithContext(
    orderByClause: any[],
    context: IndentContext
  ): string {
    const keyword = this.formatKeyword("ORDER BY").padStart(
      context.baseKeywordLength,
      " "
    );
    const columns = orderByClause
      .map((col: any) => {
        let result = this.expressionFormatter.formatExpressionWithContext(
          col.expr || col,
          context
        );
        if (col.type && (col.type === "ASC" || col.type === "DESC")) {
          result += ` ${col.type}`;
        }
        return result;
      })
      .join(", ");
    return `${keyword} ${columns}`;
  }

  /**
   * LIMIT句をフォーマット（新しいIndentContext対応版）
   */
  private formatLimitClauseWithContext(
    limitClause: any,
    context: IndentContext
  ): string {
    const keyword = this.formatKeyword("LIMIT").padStart(
      context.baseKeywordLength,
      " "
    );

    if (limitClause.value && Array.isArray(limitClause.value)) {
      // LIMIT値を抽出
      const limitValue = this.expressionFormatter.formatExpressionWithContext(
        limitClause.value[0],
        context
      );

      // OFFSETがある場合
      if (limitClause.seperator === "offset" && limitClause.value.length > 1) {
        const offsetValue =
          this.expressionFormatter.formatExpressionWithContext(
            limitClause.value[1],
            context
          );
        return `${keyword} ${limitValue} OFFSET ${offsetValue}`;
      } else {
        return `${keyword} ${limitValue}`;
      }
    } else {
      // フォールバック
      return `${keyword} ${limitClause}`;
    }
  }

  // プライベートメソッド群
  private formatColumnsWithAliasAlignment(
    columns: any[],
    context: IndentContext
  ): string[] {
    // 1. 各カラムの式部分とエイリアス部分を分離してフォーマット
    const columnData = columns.map((col) => {
      const expressionPart = this.formatColumnExpression(col, context);
      const aliasPart = col.as ? col.as : null;
      return { expressionPart, aliasPart, originalColumn: col };
    });

    // 2. 最大の式部分の長さを計算（AS句がある場合のみ）
    const hasAnyAlias = columnData.some((data) => data.aliasPart !== null);

    if (!hasAnyAlias) {
      // AS句がない場合は従来通り
      return columnData.map((data) => data.expressionPart);
    }

    const maxExpressionLength = Math.max(
      ...columnData.map((data) => data.expressionPart.length)
    );

    // 3. AS句を統一位置に揃えてフォーマット
    return columnData.map((data) => {
      if (data.aliasPart) {
        const padding = " ".repeat(
          maxExpressionLength - data.expressionPart.length
        );
        return `${data.expressionPart}${padding} AS ${data.aliasPart}`;
      } else {
        return data.expressionPart;
      }
    });
  }

  private formatColumnExpression(col: any, context: IndentContext): string {
    // カラム式部分のみをフォーマット（AS句は含まない）
    if (col.type === "expr" && col.expr) {
      return this.expressionFormatter.formatExpressionWithContext(
        col.expr,
        context
      );
    } else if (col.expr) {
      return this.expressionFormatter.formatExpressionWithContext(
        col.expr,
        context
      );
    } else {
      return this.expressionFormatter.formatExpressionWithContext(col, context);
    }
  }

  private formatColumnWithContext(col: any, context: IndentContext): string {
    let result = "";
    // カラムの型に応じて処理
    if (col.type === "expr" && col.expr) {
      result = this.expressionFormatter.formatExpressionWithContext(
        col.expr,
        context
      );
    } else if (col.expr) {
      result = this.expressionFormatter.formatExpressionWithContext(
        col.expr,
        context
      );
    } else {
      result = this.expressionFormatter.formatExpressionWithContext(
        col,
        context
      );
    }

    // AS句を処理
    if (col.as) {
      result += ` AS ${col.as}`;
    }

    return result;
  }

  private formatTableWithContext(table: any, context: IndentContext, useStandardFormat: boolean = false): string {
    let result = "";

    try {
      // サブクエリの場合 (table.expr.ast が存在)
      if (table.expr && table.expr.ast) {
        // FROM句内のサブクエリをフォーマット - 動的にキーワード長を計算
        const subqueryKeywordLength =
          this.calculateSubqueryKeywordLength(table.expr.ast) <= 6
            ? 8
            : this.calculateSubqueryKeywordLength(table.expr.ast);
        const subqueryContext = new IndentContext(
          context.nestLevel + 1,
          'subquery',
          subqueryKeywordLength,
          context,
          false // サブクエリは常にコンパクト形式
        );
        const formattedSubquery = this.formatSelectStatementWithContext(
          table.expr.ast,
          subqueryContext,
          useStandardFormat
        );
        const baseIndent = " ".repeat(context.baseKeywordLength + 1);
        const indentedSubquery = formattedSubquery
          .split("\n")
          .map((line, index) => {
            if (index === 0 && line.trim() === "SELECT") {
              return line.trim()
                ? `${" ".repeat(
                    subqueryKeywordLength - context.baseKeywordLength - 2
                  )}${line.trim()}`
                : line;
            } else {
              return line.trim() ? `${baseIndent}${line}` : line;
            }
          })
          .join("\n");
        result = `( ${indentedSubquery}\n${baseIndent})`;
      }
      // 通常のテーブルの場合
      else if (table.table) {
        result = table.table;
      }
      // 予期しない構造の場合のフォールバック
      else {
        console.warn("Unexpected table structure:", table);
        result = table.name || table.value || "unknown_table";
      }

      // AS句の処理
      if (table.as) {
        result += ` AS ${table.as}`;
      }

      return result;
    } catch (error) {
      // エラーハンドリング：元の情報を保持
      console.error("Error formatting table:", error, table);
      const fallbackName =
        table.table || table.name || table.as || "error_table";
      return table.as ? `${fallbackName} AS ${table.as}` : fallbackName;
    }
  }

  private formatComplexFromWithContext(
    fromClause: any[],
    context: IndentContext,
    useStandardFormat: boolean = false
  ): string {
    const lines: string[] = [];

    for (let i = 0; i < fromClause.length; i++) {
      const table = fromClause[i];

      if (i === 0) {
        // 最初のテーブル
        lines.push(this.formatTableWithContext(table, context, useStandardFormat));
      } else if (table.join) {
        // JOIN処理：実際のJOINタイプを使用し、右揃えを適用
        const joinKeyword = this.formatKeyword(table.join).padStart(
          context.baseKeywordLength,
          " "
        );
        const tableName = this.formatTableWithContext(table, context, useStandardFormat);
        const joinLine = `${joinKeyword} ${tableName}`;

        if (table.on) {
          // JOIN行を追加
          lines.push(joinLine);
          // ON条件を別行で右揃え（JOIN条件コンテキストで）
          const joinContext = context.createSiblingContext("join_condition");
          const onLines = this.formatJoinConditionWithContext(
            table.on,
            context,
            joinContext
          );
          lines.push(...onLines);
        } else {
          lines.push(joinLine);
        }
      } else {
        // 通常のテーブル（カンマ区切り）
        lines.push(this.formatTableWithContext(table, context, useStandardFormat));
      }
    }

    return lines.join("\n");
  }

  /**
   * JOIN条件（ON句）をフォーマット
   */
  private formatJoinConditionWithContext(
    condition: any,
    context: IndentContext,
    joinContext: IndentContext
  ): string[] {
    return this.formatJoinConditionRecursiveWithContext(
      condition,
      context,
      joinContext,
      true
    );
  }

  /**
   * JOIN条件を再帰的にフォーマット
   */
  private formatJoinConditionRecursiveWithContext(
    condition: any,
    context: IndentContext,
    joinContext: IndentContext,
    isFirst: boolean
  ): string[] {
    const lines: string[] = [];

    if (condition.type === "binary_expr" && condition.operator === "AND") {
      // AND条件の場合、左右を再帰的に処理
      const leftLines = this.formatJoinConditionRecursiveWithContext(
        condition.left,
        context,
        joinContext,
        isFirst
      );
      const rightLines = this.formatJoinConditionRecursiveWithContext(
        condition.right,
        context,
        joinContext,
        false
      );

      lines.push(...leftLines);
      lines.push(...rightLines);
    } else {
      // 通常の条件の場合
      const conditionStr = this.expressionFormatter.formatExpressionWithContext(
        condition,
        joinContext
      );

      if (isFirst) {
        const onKeyword = this.formatKeyword("ON").padStart(
          context.baseKeywordLength,
          " "
        );
        lines.push(`${onKeyword} ${conditionStr}`);
      } else {
        const andKeyword = this.formatKeyword("AND").padStart(
          context.baseKeywordLength,
          " "
        );
        lines.push(`${andKeyword} ${conditionStr}`);
      }
    }

    return lines;
  }

  private formatKeyword(keyword: string): string {
    return this.options.keywordCase === "upper"
      ? keyword.toUpperCase()
      : keyword.toLowerCase();
  }

  /**
   * サブクエリのキーワード長を計算
   */
  private calculateSubqueryKeywordLength(ast: any): number {
    const keywords = FormatterUtils.collectKeywordsFromStatement(ast);
    return keywords.length > 0 ? Math.max(...keywords.map((k) => k.length)) : 6;
  }
}
