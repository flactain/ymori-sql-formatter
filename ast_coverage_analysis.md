# node-sql-parser AST要素網羅性分析

## TypeScript定義から特定したAST要素

### ExpressionValue タイプ (types.d.ts:214-223)
現在の定義:
- ColumnRef ✅ (実装済み: column_ref)
- Param ✅ (実装済み: type: "param")
- Function ✅ (実装済み: function)
- Case ✅ (実装済み: case)
- AggrFunc ✅ (実装済み: aggr_func)
- Value ✅ (実装済み: 汎用的なValueタイプ)
- Binary ✅ (実装済み: binary_expr)
- Cast ✅ (実装済み: cast)
- Interval ✅ (実装済み: interval)

### ValueExpr タイプ (types.d.ts:77-100)
現在の定義で未実装:
- "backticks_quote_string" ✅ (実装済み)
- "string" ✅ (実装済み)
- "regex_string" ✅ (実装済み)
- "hex_string" ✅ (実装済み)
- "full_hex_string" ❌
- "natural_string" ❌
- "bit_string" ✅ (実装済み)
- "boolean" ✅ (実装済み)
- "param" ✅ (実装済み)
- "origin" ❌
- "date" ✅ (実装済み)
- "datetime" ✅ (実装済み)
- "time" ✅ (実装済み)
- "timestamp" ✅ (実装済み)
- "var_string" ❌

### 実装済みValueExprタイプ:
- "double_quote_string" ✅
- "single_quote_string" ✅
- "bool" ✅
- "null" ✅
- "star" ✅
- "default" ✅

### 文タイプ (AST型 types.d.ts:529以降)
推定される文タイプ:
- select ✅ (実装済み)
- insert ✅ (実装済み)
- update ✅ (実装済み)
- delete ✅ (実装済み)
- replace ✅ (実装済み)
- create ✅ (実装済み)
- drop ✅ (実装済み)
- alter ✅ (実装済み)
- truncate ✅ (実装済み)
- show ✅ (実装済み)
- desc/describe ❌ (PostgreSQL parser未サポート)

### 特殊な式タイプ
未実装の可能性がある特殊タイプ:
- "star" ✅ (Star型として定義済み、実装は要確認)
- "expr_list" ✅ (ExprList型として実装済み)
- "dual" ❌ (MySQL/Oracle特有のDUAL表)
- window関数の詳細な型 ✅ (実装済み)

### PostgreSQL固有要素の推定
TypeScript定義で見つからないがPostgreSQLで必要:
- JSONB演算子 (-> ->> #> #>> @> <@ ? ?& ?|)
- 配列演算子 (@> <@ && ||)
- 範囲型演算子
- UUID型
- INET/CIDR型
- 全文検索演算子 (@@, @@@ etc.)
- LATERAL JOIN
- FILTER句 (集約関数用)
- WINDOW句
- RECURSIVE CTE

## 優先実装対象

### 高優先度 (一般的なSQL構文)
1. param型 (プリペアドステートメント)
2. 各種文字列型 (backticks_quote_string, regex_string等)
3. 日付時刻型 (date, datetime, time, timestamp)
4. replace文
5. 汎用Value型の改善

### 中優先度 (PostgreSQL特有)
1. JSONB演算子
2. 配列演算子  
3. UUID型
4. FILTER句

### 低優先度 (特殊用途)
1. DDL文 (create, drop, alter)
2. hex_string, bit_string等の特殊型
3. DUAL表対応

## 実装戦略
1. まず高優先度の汎用的な要素を実装
2. 次にPostgreSQL特有の要素を実装
3. 最後に特殊用途の要素を実装
4. 各段階でテストケースを追加して検証