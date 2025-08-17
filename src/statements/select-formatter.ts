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
  formatSelectStatementWithContext(stmt: any, context: IndentContext): string {
    const parts: string[] = [];

    // メインクエリ（nestLevel=0）またはCTEルートレベルの場合のみ、CTE+メインクエリ全体でのキーワード長を再計算
    let actualContext = context;
    if (
      context.nestLevel === 0 ||
      (context.contextType === "main" && stmt.with)
    ) {
      const globalMaxKeywordLength =
        FormatterUtils.calculateGlobalMaxKeywordLength(stmt);
      actualContext = new IndentContext(
        context.nestLevel,
        context.contextType,
        globalMaxKeywordLength,
        context.parent
      );
    }

    // WITH句の処理（ネストしたCTEの場合）
    if (stmt.with) {
      parts.push(this.formatWithClauseWithContext(stmt.with, actualContext));
    }

    // SELECT句
    parts.push(this.formatSelectClauseWithContext(stmt, actualContext));

    // FROM句
    if (stmt.from) {
      parts.push(this.formatFromClauseWithContext(stmt.from, actualContext));
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
        this.formatSelectStatementWithContext(stmt._next, actualContext)
      );
    }

    return parts.join("\n");
  }

  /**
   * WITH句をフォーマット（新しいIndentContext対応版）
   */
  private formatWithClauseWithContext(
    withClause: any,
    context: IndentContext
  ): string {
    if (!withClause || !Array.isArray(withClause)) {
      return this.formatKeyword("WITH") + " /* invalid CTE */";
    }

    const parts: string[] = [];

    withClause.forEach((cte: any, index: number) => {
      const cteName = cte.name?.value || cte.name || "unnamed_cte";
      const cteQuery = cte.stmt?.ast || cte.stmt;

      if (index === 0) {
        // WITHキーワードは基準位置
        parts.push(`${this.formatKeyword("WITH")} ${cteName} AS (`);
      } else {
        parts.push(`, ${cteName} AS (`);
      }

      if (cteQuery) {
        // CTE内クエリは現在のコンテキストと同じキーワード長でフォーマット（CTE+メインクエリ統一）
        const formattedQuery = this.formatSelectStatementWithContext(
          cteQuery,
          context
        );
        parts.push(formattedQuery);
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
    context: IndentContext
  ): string {
    const keyword = this.formatKeyword("SELECT");

    if (!stmt.columns || stmt.columns.length === 0) {
      return keyword;
    }

    // SELECTキーワードも右揃えする
    const selectKeyword = keyword.padStart(context.baseKeywordLength, " ");

    // カラムをフォーマット（SELECT句のコンテキストで）
    const selectContext = context.createSiblingContext("select_clause");
    const formattedColumns = stmt.columns.map((col: any) =>
      this.formatColumnWithContext(col, selectContext)
    );

    // 結果
    const lines = [];

    // 単一カラムの場合
    if (formattedColumns.length === 1) {
      return `${selectKeyword} ${formattedColumns[0]}`;
    } else {
      // 複数カラムの場合は左揃え形式
      lines.push(selectKeyword);
    }

    // カラムの開始位置を動的に計算
    const columnIndent = " ".repeat(context.baseKeywordLength + 1);

    // 最初のカラム
    lines.push(`${columnIndent}${formattedColumns[0]}`);

    // 残りのカラム（カンマ前置き）
    const commaIndent = " ".repeat(Math.max(0, context.baseKeywordLength - 1));
    for (let i = 1; i < formattedColumns.length; i++) {
      lines.push(`${commaIndent}, ${formattedColumns[i]}`);
    }

    return lines.join("\n");
  }

  /**
   * FROM句をフォーマット（新しいIndentContext対応版）
   */
  private formatFromClauseWithContext(
    fromClause: any[],
    context: IndentContext
  ): string {
    const keyword = this.formatKeyword("FROM").padStart(
      context.baseKeywordLength,
      " "
    );

    // JOINが含まれているかチェック
    const hasJoin = fromClause.some((table, index) => index > 0 && table.join);

    if (fromClause.length === 1 && !hasJoin) {
      // 単純なテーブル
      const table = this.formatTableWithContext(fromClause[0], context);
      return `${keyword} ${table}`;
    }

    // 複雑なFROM句（JOIN含む）の処理
    return `${keyword} ${this.formatComplexFromWithContext(
      fromClause,
      context
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

  private formatTableWithContext(table: any, _context: IndentContext): string {
    let result = table.table;
    if (table.as) {
      result += ` AS ${table.as}`;
    }
    return result;
  }

  private formatComplexFromWithContext(
    fromClause: any[],
    context: IndentContext
  ): string {
    const lines: string[] = [];

    for (let i = 0; i < fromClause.length; i++) {
      const table = fromClause[i];

      if (i === 0) {
        // 最初のテーブル
        lines.push(this.formatTableWithContext(table, context));
      } else if (table.join) {
        // JOIN処理：実際のJOINタイプを使用し、右揃えを適用
        const joinKeyword = this.formatKeyword(table.join).padStart(
          context.baseKeywordLength,
          " "
        );
        const tableName = this.formatTableWithContext(table, context);
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
        lines.push(this.formatTableWithContext(table, context));
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
}
