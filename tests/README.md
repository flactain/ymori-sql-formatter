# SQLフォーマッター テストスイート

このディレクトリには、SQLフォーマッターの包括的なテストスイートが含まれています。

## 📁 ディレクトリ構造

```
tests/
├── README.md                           # このファイル
├── test-runner.js                      # メインテストランナー
├── fixtures/
│   └── test-cases.js                   # 再利用可能なテストケースの定義
├── unit/
│   └── formatter.test.js               # ユニットテスト
└── integration/
    └── real-world-queries.test.js      # 統合テスト（実際のクエリ）
```

## 🚀 テストの実行方法

### 基本的な実行

```bash
# 全テストを実行
npm run test:formatter

# ユニットテストのみ
npm run test:formatter:unit

# 統合テストのみ
npm run test:formatter:integration

# 詳細出力で実行
npm run test:formatter:verbose

# ウォッチモード（ファイル変更時に自動再実行）
npm run test:formatter:watch
```

### 直接実行

```bash
# 全テスト
node tests/test-runner.js

# オプション指定
node tests/test-runner.js --unit --verbose
node tests/test-runner.js --integration --watch
```

## 📊 テストカテゴリ

### ユニットテスト (`tests/unit/`)

- **基本機能**: SELECT、WHERE、JOIN句の基本的なフォーマット
- **AS keyword保持**: 元のSQLでのAS使用状況の保持
- **高度なSQL関数**: EXTRACT、INTERVAL、Window関数
- **複雑な構造**: サブクエリ、CTE（Common Table Expression）
- **設定オプション**: multiLineThreshold、semicolonHandling、keywordCase
- **データベース方言**: PostgreSQL、MySQL、BigQuery、Snowflake
- **エラーハンドリング**: 不正なSQL、空入力の処理

### 統合テスト (`tests/integration/`)

- **実世界クエリ**: Eコマース分析、データウェアハウスクエリ
- **パフォーマンステスト**: 中程度の大きさのクエリの処理時間
- **エラー耐性**: サポートされていない構文の適切な処理
- **方言互換性**: 異なるデータベース設定での動作確認

## 🧪 テストケースの追加

新しいテストケースを追加する場合：

1. **fixtures/test-cases.js** に新しいテストケースを追加
2. 適切なテストファイル（unit または integration）にテストを追加
3. テストケースには以下を含める：
   - 明確な名前と説明
   - 入力SQL
   - 期待される出力
   - 使用するオプション

### テストケース例

\`\`\`javascript
newTestCase: {
    name: 'Description of what this tests',
    input: 'SELECT * FROM users WHERE active = true;',
    options: { indentSize: 2, keywordCase: 'upper' },
    expected: \`SELECT *
  FROM users
 WHERE active = true;\`
}
\`\`\`

## 🔧 テスト設定

- **テストフレームワーク**: Mocha
- **アサーションライブラリ**: Node.js内蔵のassert
- **タイムアウト**: 5秒（integration テストを考慮）
- **レポーター**: progress（通常）、spec（詳細モード）

## 📈 テスト結果の見方

### 成功例
```
✅ 全テストが成功しました！
```

### 失敗例
```
❌ テストが失敗しました。
```

詳細な失敗情報は `--verbose` フラグで確認できます。

## 🐛 トラブルシューティング

### よくある問題

1. **Mocha not found エラー**
   ```bash
   npm install -g mocha
   ```

2. **テストファイルが見つからない**
   - プロジェクトルートディレクトリから実行していることを確認

3. **タイムアウトエラー**
   - 複雑なクエリのテストでタイムアウトが発生する場合は、test-runner.jsのタイムアウト値を調整

## 🚦 継続的インテグレーション

このテストスイートは、以下の場面で実行することを推奨します：

- コード変更前後（開発時）
- プルリクエスト作成時
- リリース前
- 定期的な品質チェック

## 📝 テストケースの品質ガイドライン

- **再現可能**: 同じ入力は常に同じ出力を生成する
- **明確な期待値**: 期待される結果が明確に定義されている
- **独立性**: テスト同士が互いに依存しない
- **包括性**: 主要な機能とエッジケースをカバーする
- **保守性**: 読みやすく、理解しやすいテストコード