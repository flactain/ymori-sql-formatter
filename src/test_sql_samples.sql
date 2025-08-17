-- 1. 基本的なSELECT
select id, name from users;

-- 2. WHERE句付き
select user_id, email from users where status = 'active';

-- 3. ORDER BY付き
select name, created_at from users order by created_at desc;

-- 4. 複数カラムのSELECT（カンマ前置テスト）
select user_id, first_name, last_name, email, phone, address, city from users;

-- 5. GROUP BY + 集約関数
select department_id, count(*) as employee_count from employees group by department_id;

-- 6. HAVING句付き
select department_id, count(*) as cnt from employees group by department_id having count(*) > 100;

-- 7. INNER JOIN
select u.name, p.title from users u inner join posts p on u.id = p.user_id;

-- 8. LEFT JOIN
select u.name, p.title from users u left join posts p on u.id = p.user_id;

-- 9. 複数テーブルJOIN
select u.name, p.title, c.content from users u join posts p on u.id = p.user_id join comments c on p.id = c.post_id;

-- 10. INSERT文
insert into users (name, email, status) values ('John Doe', 'john@example.com', 'active');

-- 11. 複数行INSERT
insert into users (name, email) values ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com'), ('Charlie', 'charlie@example.com');

insert into users (name, email) select name, email from user_source us where us.id in (select id from target_users)
-- 12. UPDATE文
update users set email = 'newemail@example.com', status = 'inactive' where id = 1;

-- 13. DELETE文
delete from users where status = 'inactive' and last_login < '2023-01-01';

-- 14. LIMIT句
select name, email from users order by created_at desc limit 10;

-- 15. サブクエリ
select name from users where id in (select user_id from orders where total > 1000);

-- 16. 単一WITH句
with active_users as (select id, name from users where status = 'active') select name from active_users;

-- 17. 複数WITH句（複雑）
with active_users as (select user_id, name, email from users where status = 'active' and created_at > '2023-01-01'), user_orders as (select user_id, count(*) as order_count, sum(total) as total_amount from orders where created_at > '2023-01-01' group by user_id), top_customers as (select uo.user_id, au.name, uo.order_count, uo.total_amount from active_users au join user_orders uo on au.user_id = uo.user_id where uo.order_count >= 5) select tc.name, tc.order_count, tc.total_amount from top_customers tc order by tc.total_amount desc limit 20;

-- 18. ネストした複雑なクエリ
select u.name, (select count(*) from posts p where p.user_id = u.id) as post_count, (select avg(rating) from reviews r join posts p on r.post_id = p.id where p.user_id = u.id) as avg_rating from users u where u.status = 'active' order by post_count desc;

-- 19. WINDOW関数
select name, salary, rank() over (partition by department_id order by salary desc) as salary_rank from employees;

-- 20. CASE文
select name, case when salary > 100000 then 'High' when salary > 50000 then 'Medium' else 'Low' end as salary_grade from employees;

-- 20の期待値
SELECT 
       name
     , CASE
         WHEN salary > 100000 THEN 'High'
         WHEN salary > 50000 THEN 'Medium'
         ELSE 'Low'
       END AS salary_grade
  FROM employees;


-- 21. PostgreSQL特有のARRAY
select name, array_agg(skill) as skills from user_skills group by name;

-- 22. 超複雑なクエリ（全部入り）
with quarterly_sales as (select extract(quarter from order_date) as quarter, extract(year from order_date) as year, user_id, sum(total) as total_sales, count(*) as order_count from orders where order_date >= current_date - interval '2 years' group by extract(quarter from order_date), extract(year from order_date), user_id), user_metrics as (select u.id, u.name, u.email, u.department_id, coalesce(qs.total_sales, 0) as total_sales, coalesce(qs.order_count, 0) as order_count, rank() over (partition by u.department_id order by coalesce(qs.total_sales, 0) desc) as dept_rank from users u left join quarterly_sales qs on u.id = qs.user_id where u.status = 'active'), department_summary as (select d.name as dept_name, count(um.id) as active_users, avg(um.total_sales) as avg_sales, sum(um.total_sales) as dept_total_sales from departments d join user_metrics um on d.id = um.department_id group by d.id, d.name having count(um.id) > 3) select ds.dept_name, ds.active_users, round(ds.avg_sales, 2) as avg_sales, ds.dept_total_sales, um.name as top_performer, um.total_sales as top_sales from department_summary ds join user_metrics um on ds.dept_name = (select name from departments where id = um.department_id) where um.dept_rank = 1 order by ds.dept_total_sales desc, ds.avg_sales desc;

-- 23. ヒント句やSQL ID
select /* userMapper.fetch */u.id from users u where u.user_id = '001';
with /* emplyeeMapper.fetch */ emp as (select * from employees) select name from emp e;

-- 24. LEFT JOIN
with quarterly_sales as (select extract(quarter from order_date) as quarter, extract(year from order_date) as year, user_id, sum(total) as total_sales, count(*) as order_count from orders where order_date >= current_date - interval '2 years' group by extract(quarter from order_date), extract(year from order_date), user_id), user_metrics as (select u.id, u.name, u.email, u.department_id, coalesce(qs.total_sales, 0) as total_sales, coalesce(qs.order_count, 0) as order_count, rank() over (partition by u.department_id order by coalesce(qs.total_sales, 0) desc) as dept_rank from users u left join quarterly_sales qs on u.id = qs.user_id where u.status = 'active'), department_summary as (select d.name as dept_name, count(um.id) as active_users, avg(um.total_sales) as avg_sales, sum(um.total_sales) as dept_total_sales from departments d left join user_metrics um on d.id = um.department_id group by d.id, d.name having count(um.id) > 3) select ds.dept_name, ds.active_users, round(ds.avg_sales, 2) as avg_sales, ds.dept_total_sales, um.name as top_performer, um.total_sales as top_sales from department_summary ds left join user_metrics um on ds.dept_name = (select name from departments where id = um.department_id) where um.dept_rank = 1 order by ds.dept_total_sales desc, ds.avg_sales desc;


-- 25 FROM subquery
SELECT
       user_name
     , total_orders
  FROM (   SELECT
                  name     AS user_name
                , COUNT(*) AS total_orders
             FROM users AS u
       INNER JOIN orders AS o
               ON u.id = o.user_id
         GROUP BY name
       ) AS user_stats
;

-- 26 tuple