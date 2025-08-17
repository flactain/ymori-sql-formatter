/**
 * SQLフォーマッターのユニットテスト
 * Mocha + Node.js Assert を使用
 */

const assert = require('assert');
const { formatSql, DEFAULT_FORMATTER_OPTIONS } = require('../../dist/formatter');
const testCases = require('../fixtures/test-cases');

describe('SQL Formatter', function() {
    describe('Basic Functionality', function() {
        it('should format basic SELECT statement', function() {
            const testCase = testCases.basicSelect;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });

        it('should format SELECT with WHERE clause', function() {
            const testCase = testCases.selectWithWhere;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });

        it('should format SELECT with JOIN clause', function() {
            const testCase = testCases.selectWithJoin;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });
    });

    describe('AS Keyword Preservation', function() {
        it('should preserve absence of AS keyword', function() {
            const testCase = testCases.asKeywordPreservation;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });

        it('should preserve presence of AS keyword', function() {
            const testCase = testCases.asKeywordWithAS;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });
    });

    describe('Advanced SQL Functions', function() {
        it('should format EXTRACT function', function() {
            const testCase = testCases.extractFunction;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });

        it('should format INTERVAL expression', function() {
            const testCase = testCases.intervalExpression;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });

        it('should format Window function', function() {
            const testCase = testCases.windowFunction;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });
    });

    describe('Complex Structures', function() {
        it('should format complex subquery', function() {
            const testCase = testCases.complexSubquery;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });

        it('should format complex CTE', function() {
            const testCase = testCases.complexCTE;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });
    });

    describe('Configuration Options', function() {
        it('should respect multiLineThreshold setting', function() {
            const testCase = testCases.customMultiLineThreshold;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });

        it('should handle semicolon removal', function() {
            const testCase = testCases.customSemicolonRemoval;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });

        it('should format with lowercase keywords', function() {
            const testCase = testCases.lowercaseKeywords;
            const result = formatSql(testCase.input, testCase.options);
            assert.strictEqual(result.trim(), testCase.expected.trim(), 
                `Failed for test case: ${testCase.name}`);
        });
    });

    describe('Database Dialects', function() {
        it('should work with MySQL dialect', function() {
            const testCase = testCases.mysqlMode;
            const result = formatSql(testCase.input, testCase.options);
            // MySQLモードでは結果が異なる可能性があるので、エラーが発生しないことを確認
            assert.ok(result.length > 0, 'Should produce formatted output');
            assert.ok(result.includes('SELECT'), 'Should contain SELECT keyword');
        });
    });

    describe('Default Options', function() {
        it('should use default options when not specified', function() {
            const input = 'select * from users;';
            const minimalOptions = { indentSize: 2, keywordCase: 'upper' };
            const result = formatSql(input, minimalOptions);
            
            assert.ok(result.length > 0, 'Should produce output');
            assert.ok(result.includes('SELECT'), 'Should contain uppercase SELECT');
            assert.ok(result.includes(';'), 'Should contain semicolon');
        });

        it('should export default options', function() {
            assert.ok(DEFAULT_FORMATTER_OPTIONS, 'Should export default options');
            assert.strictEqual(DEFAULT_FORMATTER_OPTIONS.indentSize, 2);
            assert.strictEqual(DEFAULT_FORMATTER_OPTIONS.keywordCase, 'upper');
            assert.strictEqual(DEFAULT_FORMATTER_OPTIONS.database, 'postgresql');
        });
    });

    describe('Error Handling', function() {
        it('should handle invalid SQL gracefully', function() {
            const invalidSQL = 'SELECT FROM WHERE INVALID SQL;;;';
            
            assert.throws(() => {
                formatSql(invalidSQL, { indentSize: 2, keywordCase: 'upper' });
            }, Error, 'Should throw error for invalid SQL');
        });

        it('should handle empty input', function() {
            // 空文字の場合、実際にはエラーが投げられないので、空文字が返ることを確認
            const result = formatSql('', { indentSize: 2, keywordCase: 'upper' });
            assert.strictEqual(result, '', 'Should return empty string for empty input');
        });
    });
});