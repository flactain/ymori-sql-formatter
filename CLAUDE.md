# CLAUDE.md

このファイルは、このリポジトリでコードを操作する際にClaude Code (claude.ai/code) にガイダンスを提供します。

## よく使用する開発コマンド

### ビルドとパッケージ
- `npm run compile` - webpackを使用して拡張機能をビルド
- `npm run package` - 最適化されたバンドルでプロダクションビルドを作成
- `npm run watch` - 開発用ウォッチモード、変更時に自動的に再ビルド

### テスト
- `npm run test` - すべてのテストを実行（pretestでコンパイルとlintが必要）
- `npm run pretest` - テスト準備：テストコンパイル、拡張機能コンパイル、lintを実行
- `npm run compile-tests` - TypeScriptテストをJavaScript出力ディレクトリにコンパイル
- `npm run watch-tests` - テストコンパイル用ウォッチモード

### コード品質
- `npm run lint` - srcディレクトリでESLintを実行
- 対象を絞ったlintには直接`eslint src`を使用

### VS Code拡張機能開発
- `vscode:prepublish` - 拡張機能を公開用に準備（packageスクリプトを実行）
- VS CodeでF5を押して拡張機能開発ホストを起動してテスト

## アーキテクチャ概要

これは`node-sql-parser`ライブラリを使用して`.sql`ファイルのSQLフォーマット機能を提供するVS Code拡張機能です。

### 主要コンポーネント

**拡張機能エントリーポイント** (`src/extension.ts`)
- SQLランゲージファイルで有効化
- 自動フォーマット用のドキュメントフォーマットプロバイダーを登録
- 手動フォーマットコマンド（`ymori-sql-formatter.format`）を提供
- フォーマットオプションのユーザー設定を取得
- ユーザーへのエラーレポートを処理

**SQLフォーマッターエンジン** (`src/formatter.ts`)
- AST生成に`node-sql-parser`を使用したメインフォーマットロジック
- SELECT、INSERT、UPDATE、DELETE文をサポート
- 複雑なSQL機能に対応：WITH句、JOIN、サブクエリ
- 右揃えキーワードフォーマットスタイルを実装
- インデントとキーワードケース（大文字/小文字）が設定可能
- サポートされていないSQL構文に対する堅牢なエラーハンドリング

### 主要機能
- **右揃えキーワード**: すべてのSQLキーワード（SELECT、FROM、WHERE等）を垂直に整列
- **複数行カラムリスト**: 2つ以上のカラムがある場合、自動的に複数行にフォーマット
- **WITH句サポート**: 共通テーブル式（CTE）の統合フォーマット
- **JOINフォーマット**: ON条件を含む様々なJOINタイプの適切な処理
- **セミコロン自動追加**: すべてのSQL文の末尾にセミコロンが自動的に追加
- **包括的AST対応**: node-sql-parserのPostgreSQL AST要素を網羅的にサポート
- **AS キーワード保持**: テーブル別名で元々ASが使用されている場合は保持、使用されていない場合は追加しない
- **ヒント句・SQL_ID サポート**: 最初のキーワード直後のコメント（`/* ... */`）を保持
- **動的カラム整列**: JOIN種別に関係なく、カラムがFROM/WHERE句要素と適切に整列
- **PostgreSQL機能サポート**: EXTRACT関数、INTERVAL式、WINDOW関数、current_date関数
- **設定オプション**:
  - `indentSize`: インデントのスペース数（デフォルト: 2）
  - `keywordCase`: SQLキーワードの'upper'または'lower'（デフォルト: 'upper'）

### 実装済みAST要素（PostgreSQL特化）
- **文タイプ**: SELECT、INSERT、UPDATE、DELETE、REPLACE、CREATE、DROP、ALTER、TRUNCATE、SHOW
- **式タイプ**: カラム参照、関数、集約関数、CASE、CAST、バイナリ式、単項式、配列、パラメータ
- **値タイプ**: 各種文字列リテラル、数値、ブール値、日付時刻、NULL値
- **複雑な構造**: WITH句、ウィンドウ関数、サブクエリ、UNION/INTERSECT/EXCEPT

### ビルドシステム
- **Webpack**: TypeScriptソースを単一の`dist/extension.js`にバンドル
- **TypeScript**: Node16モジュール、ES2022ターゲットで設定
- **ESLint**: TypeScript固有のルールでコード品質を強制
- **ソースマップ**: デバッグサポート用に生成

### 拡張機能設定
- `sql`ランゲージファイルで有効化
- キーバインディング提供：SQLファイル用の`Shift+Alt+F`
- VS Codeの組み込みフォーマットシステムと統合
- VS Code設定パネルで設定可能

### テストフレームワーク
- MochaでVS Codeテストフレームワークを使用
- テストファイルは`src/test/`ディレクトリ
- 現在はテストカバレッジが最小限 - メインテストはプレースホルダー

### 依存関係
- **ランタイム**: SQLパースとAST操作のための`node-sql-parser`
- **開発**: VS Code拡張機能開発用の完全なTypeScript/Webpack/ESLintツールチェーン

## 最近の機能拡張・修正履歴

### ASキーワード保持機能 (2024年8月実装)
- **要件**: テーブル別名でASキーワードが元々使用されている場合は保持、使用されていない場合は追加しない
- **実装**: `detectTableAsUsage()` 関数で個別テーブルのAS使用状況を検出
- **対象**: `users u` (AS不要) と `orders as o` (AS保持) の混在パターンに対応

### ヒント句・SQL_IDサポート (2024年8月実装)
- **要件**: 最初のキーワード（SELECT、WITH等）直後のコメント `/* ... */` を保持
- **実装**: `extractHintComment()` と `restoreHintComment()` でパイプライン処理
- **例**: `select /* userMapper.fetch */ u.id from users u` → コメントが保持される
- **対象**: 単一行・複数行コメント、WITH句でのヒント句にも対応

### 動的カラム整列機能 (2024年8月実装)
- **要件**: JOIN種別（INNER JOIN、LEFT JOIN等）に関係なく、SELECTカラムがFROM/WHERE句要素と適切に整列
- **問題**: LEFT JOINクエリでカラムが正しく整列されない問題
- **実装**: `formatColumns()` で固定インデント(11文字)から動的計算(`maxKeywordLength + 1`)に変更
- **効果**: すべてのJOIN種別で一貫したカラム整列を実現

### PostgreSQL機能拡張 (2024年8月実装)
- **EXTRACT関数サポート**: `extract(quarter from order_date)` などの日付関数をフォーマット
- **INTERVAL式サポート**: `current_date - interval '2 years'` などの期間演算
- **WINDOW関数サポート**: `rank() over (partition by ... order by ...)` 構文
- **current_date関数**: エラーハンドリングを改善し、literal date値への変換エラーを解消

### 複雑なSQL構文サポート
- **WITH句統合**: 複数CTEでのネストした複雑クエリ対応
- **GROUP BY式処理**: EXTRACT関数をGROUP BY句で適切に処理（"complex expression"エラーの解消）
- **サブクエリ整列**: ネストしたクエリでの適切なインデント処理

## 開発時の重要な注意点

### デバッグ優先方針
- **エラー対応の第一指針**: エラーが発生した際は、すぐにフォールバック処理を検討するのではなく、まずデバッグを行い根本原因を特定して修正する
- **問題の特定**: エラーメッセージ、スタックトレース、問題となるSQL構文を詳細に分析
- **段階的修正**: 個別の機能（パース、AST変換、フォーマット）ごとに問題箇所を特定し、該当箇所のロジックを修正
- **フォールバック**: 根本修正が困難な場合の最後の手段として位置づける

### テスト用SQLサンプル
- `src/test_sql_samples.sql`: 各機能のテストケースを含む
- 22番: INNER JOINを使用した複雑なクエリ
- 23番: ヒント句テストケース
- 24番: LEFT JOINを使用した複雑なクエリ（typo修正済み）

### エラーハンドリング
- `current_date` 関数: パースエラーの場合のみエラー報告（過度に厳格でない処理）
- 複雑な式: EXTRACT、INTERVAL、WINDOW関数での"complex expression"エラーを回避
- AST変換失敗: 元のSQLを返すフォールバック機能

### キーワード長計算
- CTE内でのキーワード長推定: "INNER JOIN" (10文字) を基準
- 動的計算: クエリ内の最大キーワード長に基づく右揃え処理
- カラム開始位置: `keywordLength + 1` で統一

## 最新の要件・仕様

### PostgreSQL AST網羅的サポート (2024年8月追加)
- **目標**: node-sql-parser（PostgreSQL）でASTに取りうるすべての値を調べ上げ、網羅的にサポート
- **実装方針**: 
  - 各SQL文タイプ（SELECT、INSERT、UPDATE、DELETE、UNION、CTE等）の完全サポート
  - 式（expression）タイプの網羅的対応
  - データ型と演算子の完全サポート
  - PostgreSQL固有機能の対応
  - 未対応のAST要素を特定し、段階的に実装
- **メンテナンス性向上**: 
  - AST処理の統一化とモジュール化
  - 新しいSQL構文への拡張性を考慮した設計
  - エラーハンドリングの一元化
  - コードの可読性とテスタビリティの向上

### 調査・実装対象のSQL構文とAST要素
- **文タイプ**: select, insert, update, delete, union, intersect, except, with (recursive), create, drop, alter
- **式タイプ**: column_ref, binary_expr, function, aggr_func, window_func, case, interval, extract, cast, array, exists, in, between, like, regexp, null, default, star, subquery, unary_expr
- **データ型**: number, single_quote_string, double_quote_string, bool, null, array, interval, jsonb, uuid, timestamp
- **演算子**: 算術演算子（+, -, *, /, %）、比較演算子（=, !=, <, >, <=, >=, <>）、論理演算子（AND, OR, NOT）、文字列演算子（LIKE, ILIKE, REGEXP, ~~, !~~）、配列演算子（@>, <@, &&）
- **PostgreSQL固有**: EXTRACT, INTERVAL, WINDOW関数, ARRAY型, JSONB演算子（->, ->>）, CTE（WITH RECURSIVE）, LATERAL JOIN, FILTER句

### 実装状況サマリー (2024年8月時点)
- **サポート状況**: 67個の包括的テストケースのうち66個が成功（98.5%のサポート率）
- **未サポート**: WITH RECURSIVE (1件) - node-sql-parserのパース段階の制限
- **新規実装した主要機能**:
  - UNION/INTERSECT/EXCEPT文の完全サポート
  - CAST式（CAST関数と::演算子）の対応
  - 単項式（NOT, -, +演算子）の対応
  - 配列式（ARRAY[]構文）の対応
  - 集約関数のDISTINCT句サポート
  - 複数データ型のサポート（double_quote_string, null等）
  - ウィンドウ関数の完全対応（PARTITION BY, ORDER BY）
  - サブクエリの適切なインデント処理
  - PostgreSQL特有の演算子とデータ型
  - DDL文のサポート（CREATE、DROP、ALTER、TRUNCATE、SHOW、REPLACE）
  - 各種文字列リテラル（バッククォート、正規表現、16進数、バイナリ）
  - 日付時刻リテラル（DATE、TIME、TIMESTAMP、DATETIME）
  - パラメータ式（プリペアドステートメント用）
  - 動的インデント修正：固定インデントを`maxKeywordLength`ベースの動的計算に変更
  - CTEとメインクエリの統一右揃え：CTE内とメインクエリで一貫したキーワード右揃えを実現