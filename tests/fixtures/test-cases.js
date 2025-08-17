/**
 * SQLフォーマッターのテストケース集
 * 各テストケースは expected 結果とともに定義され、再現可能なテストを提供します
 */

module.exports = {
    // 基本的なSELECT文
    basicSelect: {
        name: 'Basic SELECT statement',
        input: 'select id, name from users;',
        options: { indentSize: 2, keywordCase: 'upper' },
        expected: `SELECT 
         id
       , name
  FROM users;`
    },

    // WHERE句付き
    selectWithWhere: {
        name: 'SELECT with WHERE clause',
        input: "select user_id, email from users where status = 'active';",
        options: { indentSize: 2, keywordCase: 'upper' },
        expected: `SELECT 
         user_id
       , email
  FROM users
 WHERE status = 'active';`
    },

    // JOIN句
    selectWithJoin: {
        name: 'SELECT with JOIN clause',
        input: 'select u.name, p.title from users u join posts p on u.id = p.user_id;',
        options: { indentSize: 2, keywordCase: 'upper' },
        expected: `    SELECT 
         u.name
       , p.title
      FROM users u
INNER JOIN posts p
        ON u.id = p.user_id;`
    },

    // AS keyword preservation
    asKeywordPreservation: {
        name: 'AS keyword preservation (without AS)',
        input: 'select * from users u;',
        options: { indentSize: 2, keywordCase: 'upper', preserveOriginalAs: true },
        expected: `SELECT *
  FROM users u;`
    },

    asKeywordWithAS: {
        name: 'AS keyword preservation (with AS)',
        input: 'select * from users as u;',
        options: { indentSize: 2, keywordCase: 'upper', preserveOriginalAs: true },
        expected: `SELECT *
  FROM users AS u;`
    },

    // EXTRACT function
    extractFunction: {
        name: 'EXTRACT function formatting',
        input: 'select extract(year from date_col) from table1;',
        options: { indentSize: 2, keywordCase: 'upper' },
        expected: `SELECT EXTRACT(YEAR FROM date_col)
  FROM table1;`
    },

    // INTERVAL expression
    intervalExpression: {
        name: 'INTERVAL expression formatting',
        input: "select * from orders where order_date >= current_date - interval '1 year';",
        options: { indentSize: 2, keywordCase: 'upper' },
        expected: `SELECT *
  FROM orders
 WHERE order_date >= CURRENT_DATE() - INTERVAL '1 year';`
    },

    // CASE statement
    caseStatement: {
        name: 'CASE statement formatting',
        input: "select name, case when salary > 100000 then 'High' when salary > 50000 then 'Medium' else 'Low' end as salary_grade from employees;",
        options: { indentSize: 2, keywordCase: 'upper', caseStyle: 'multiline' },
        expected: `SELECT 
         name
       , CASE
           WHEN salary > 100000 THEN 'High'
           WHEN salary > 50000 THEN 'Medium'
           ELSE 'Low'
         END AS salary_grade
  FROM employees;`
    },

    // Window function
    windowFunction: {
        name: 'Window function formatting',
        input: "select name, salary, rank() over (partition by department_id order by salary desc) as salary_rank from employees;",
        options: { indentSize: 2, keywordCase: 'upper' },
        expected: `SELECT 
         name
       , salary
       , rank() OVER (PARTITION BY department_id ORDER BY salary DESC) AS salary_rank
  FROM employees;`
    },

    // Complex subquery
    complexSubquery: {
        name: 'Complex subquery formatting',
        input: "select u.name, (select count(*) from posts p where p.user_id = u.id) as post_count from users u;",
        options: { indentSize: 2, keywordCase: 'upper' },
        expected: `SELECT 
         u.name
       , (
    SELECT COUNT(*)
      FROM posts AS p
     WHERE p.user_id = u.id
) AS post_count
  FROM users AS u;`
    },

    // Complex CTE
    complexCTE: {
        name: 'Complex CTE formatting',
        input: "with active_users as (select user_id, name from users where status = 'active'), user_posts as (select u.user_id, u.name, count(p.id) as post_count from active_users u left join posts p on u.user_id = p.user_id group by u.user_id, u.name) select * from user_posts where post_count > 0;",
        options: { indentSize: 2, keywordCase: 'upper' },
        expected: `WITH active_users AS (
      SELECT 
             user_id
           , name
        FROM users
       WHERE status = 'active'
)
, user_posts AS (
         SELECT 
             u.user_id
           , u.name
           , COUNT(p.id) AS post_count
           FROM active_users AS u
      LEFT JOIN posts AS p
             ON u.user_id = p.user_id
       GROUP BY user_id
)
SELECT *
  FROM user_posts
 WHERE post_count > 0;`
    },

    // Custom options tests
    customMultiLineThreshold: {
        name: 'Custom multiLineThreshold',
        input: 'select id, name, email from users;',
        options: { indentSize: 2, keywordCase: 'upper', multiLineThreshold: 4 },
        expected: `SELECT id, name, email
  FROM users;`
    },

    customSemicolonRemoval: {
        name: 'Semicolon removal',
        input: 'select * from users;',
        options: { indentSize: 2, keywordCase: 'upper', semicolonHandling: 'remove' },
        expected: `SELECT *
  FROM users`
    },

    lowercaseKeywords: {
        name: 'Lowercase keywords',
        input: 'SELECT * FROM USERS;',
        options: { indentSize: 2, keywordCase: 'lower' },
        expected: `select *
  from USERS;`
    },

    // Database dialect tests
    mysqlMode: {
        name: 'MySQL database mode',
        input: 'select u.name, p.title from users u join posts p on u.id = p.user_id;',
        options: { indentSize: 2, keywordCase: 'upper', database: 'mysql' },
        expected: `SELECT 
         u.name
       , p.title
      FROM users AS u
INNER JOIN posts AS p
        ON u.id = p.user_id;`
    }
};