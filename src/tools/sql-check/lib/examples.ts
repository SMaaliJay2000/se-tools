// Sample inputs per dialect, so the first click shows something meaningful.

const RANDOM_FN: Record<string, string> = { postgresql: "RANDOM()", mysql: "RAND()", sqlserver: "NEWID()", sqlite: "RANDOM()" };

export function badExample(dialect: string): string {
  const page = dialect === "sqlserver" ? "OFFSET 5000 ROWS FETCH NEXT 20 ROWS ONLY" : "LIMIT 20 OFFSET 5000";
  return `-- Several things that go wrong
UPDATE users SET status = 'inactive';

SELECT *
FROM orders o, customers c
WHERE LOWER(c.email) LIKE '%@gmail.com'
ORDER BY ${RANDOM_FN[dialect] ?? "RANDOM()"}
${page};

DELETE FROM sessions WHERE 1 = 1;
`;
}

export function goodExample(dialect: string): string {
  const top = dialect === "sqlserver" ? "TOP 20 " : "";
  const limit = dialect === "sqlserver" ? "" : "\nLIMIT 20";
  return `SELECT ${top}o.id, o.total, c.name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'shipped'
  AND o.created_at >= '2024-01-01'
ORDER BY o.created_at DESC, o.id DESC${limit};

UPDATE users SET status = 'inactive' WHERE id = 42;
`;
}

export function exampleSchema(dialect: string): string {
  const ts = dialect === "postgresql" ? "TIMESTAMP" : "DATETIME";
  return `CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100), email VARCHAR(200));
CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT, status VARCHAR(20), total INT, created_at ${ts});
CREATE INDEX idx_orders_status_created ON orders (status, created_at);
CREATE TABLE users (id INT PRIMARY KEY, status VARCHAR(20));
CREATE TABLE sessions (id INT PRIMARY KEY, user_id INT);
`;
}
