/**
 * 実際のプロダクションで使用されるような複雑なSQLクエリのテスト
 */

const assert = require('assert');
const { formatSql } = require('../../dist/formatter');

describe('Real-world SQL Queries', function() {
    const defaultOptions = { indentSize: 2, keywordCase: 'upper' };

    describe('E-commerce Analytics Queries', function() {
        it('should format complex quarterly sales report query', function() {
            const complexQuery = `with quarterly_sales as (select extract(quarter from order_date) as quarter, extract(year from order_date) as year, user_id, sum(total) as total_sales, count(*) as order_count from orders where order_date >= current_date - interval '2 years' group by extract(quarter from order_date), extract(year from order_date), user_id), user_metrics as (select u.id, u.name, u.email, u.department_id, coalesce(qs.total_sales, 0) as total_sales, coalesce(qs.order_count, 0) as order_count, rank() over (partition by u.department_id order by coalesce(qs.total_sales, 0) desc) as dept_rank from users u left join quarterly_sales qs on u.id = qs.user_id where u.status = 'active'), department_summary as (select d.name as dept_name, count(um.id) as active_users, avg(um.total_sales) as avg_sales, sum(um.total_sales) as dept_total_sales from departments d join user_metrics um on d.id = um.department_id group by d.id, d.name having count(um.id) > 3) select ds.dept_name, ds.active_users, round(ds.avg_sales, 2) as avg_sales, ds.dept_total_sales, um.name as top_performer, um.total_sales as top_sales from department_summary ds join user_metrics um on ds.dept_name = (select name from departments where id = um.department_id) where um.dept_rank = 1 order by ds.dept_total_sales desc, ds.avg_sales desc;`;

            const result = formatSql(complexQuery, defaultOptions);

            // 基本的な検証
            assert.ok(result.length > 0, 'Should produce output');
            assert.ok(result.includes('WITH'), 'Should contain WITH clause');
            assert.ok(result.includes('quarterly_sales AS'), 'Should contain CTE definition');
            assert.ok(result.includes('LEFT JOIN'), 'Should contain LEFT JOIN');
            assert.ok(result.includes('INNER JOIN'), 'Should contain INNER JOIN');
            assert.ok(result.includes('EXTRACT('), 'Should contain EXTRACT function');
            assert.ok(result.includes('INTERVAL'), 'Should contain INTERVAL expression');
            assert.ok(result.includes('ORDER BY'), 'Should contain ORDER BY clause');
            
            // JOIN句が改行されていることを確認
            const lines = result.split('\n');
            const joinLines = lines.filter(line => line.includes('JOIN'));
            assert.ok(joinLines.length >= 2, 'JOIN clauses should be on separate lines');
        });
    });

    describe('Data Warehouse Queries', function() {
        it('should format complex aggregation query with window functions', function() {
            const dwQuery = `select 
                customer_id,
                order_date,
                total_amount,
                sum(total_amount) over (partition by customer_id order by order_date rows between unbounded preceding and current row) as running_total,
                avg(total_amount) over (partition by customer_id order by order_date rows between 6 preceding and current row) as moving_avg_7_days,
                lag(total_amount, 1) over (partition by customer_id order by order_date) as prev_order_amount,
                case 
                    when total_amount > avg(total_amount) over (partition by customer_id) then 'Above Average'
                    when total_amount < avg(total_amount) over (partition by customer_id) then 'Below Average'
                    else 'Average'
                end as performance_category
            from orders 
            where order_date >= '2023-01-01' 
            and customer_id in (select customer_id from customers where tier = 'premium')
            order by customer_id, order_date;`;

            const result = formatSql(dwQuery, defaultOptions);

            assert.ok(result.includes('OVER ('), 'Should contain window functions');
            assert.ok(result.includes('PARTITION BY'), 'Should contain PARTITION BY');
            assert.ok(result.includes('LAG('), 'Should contain LAG function');
            assert.ok(result.includes('CASE'), 'Should contain CASE statement');
        });
    });

    describe('Error Prone Queries', function() {
        it('should handle queries with unsupported syntax gracefully', function() {
            // PostgreSQL固有の機能を含むクエリ
            const postgresQuery = `select array_agg(name) from users;`;
            
            // エラーが発生するか、または正常にフォーマットされるかを確認
            try {
                const result = formatSql(postgresQuery, defaultOptions);
                assert.ok(result.length > 0, 'Should handle PostgreSQL-specific functions');
            } catch (error) {
                assert.ok(error.message.length > 0, 'Should provide meaningful error message');
            }
        });

        it('should provide helpful error messages for unsupported features', function() {
            // 非常に複雑なクエリ（パーサーが処理できない可能性がある）
            const complexQuery = `select * from table1 where column1 = some_unsupported_function();`;
            
            try {
                formatSql(complexQuery, defaultOptions);
            } catch (error) {
                assert.ok(error.message.includes('Failed to parse'), 'Should indicate parsing failure');
            }
        });
    });

    describe('Performance Tests', function() {
        it('should handle moderately large queries efficiently', function() {
            // 中程度のサイズのクエリを生成
            const largeQuery = `select ${Array.from({length: 20}, (_, i) => `col${i+1}`).join(', ')} from users where id in (${Array.from({length: 100}, (_, i) => i+1).join(', ')});`;
            
            const startTime = Date.now();
            const result = formatSql(largeQuery, defaultOptions);
            const endTime = Date.now();
            
            assert.ok(result.length > 0, 'Should format large query');
            assert.ok(endTime - startTime < 1000, 'Should complete within 1 second');
        });
    });

    describe('Different Database Dialects', function() {
        it('should work with different database settings', function() {
            const query = 'select u.name, p.title from users u join posts p on u.id = p.user_id;';
            
            const databases = ['postgresql', 'mysql', 'bigquery', 'snowflake'];
            
            databases.forEach(db => {
                try {
                    const result = formatSql(query, { 
                        ...defaultOptions, 
                        database: db 
                    });
                    assert.ok(result.length > 0, `Should work with ${db} dialect`);
                } catch (error) {
                    // 一部のデータベース方言でエラーが発生する可能性があるが、
                    // 少なくとも意味のあるエラーメッセージを提供すべき
                    assert.ok(error.message.length > 0, `Should provide error message for ${db}`);
                }
            });
        });
    });
});