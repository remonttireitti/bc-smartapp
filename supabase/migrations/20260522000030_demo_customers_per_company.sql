-- Three named demo customers per company (e.g. "BC Smartapp asiakas 1").

INSERT INTO customers (owner_company_id, name, address, city)
SELECT c.id, c.name || ' asiakas ' || n.n, 'Testiosoite ' || n.n, 'Helsinki'
FROM companies c
CROSS JOIN generate_series(1, 3) AS n(n)
WHERE NOT EXISTS (
  SELECT 1
  FROM customers cu
  WHERE cu.owner_company_id = c.id
    AND cu.name = c.name || ' asiakas ' || n.n
);
