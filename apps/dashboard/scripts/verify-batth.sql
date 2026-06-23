-- Post-load verification queries (run against terra_batth). Read-only.
\echo '=== farm + ownership ==='
SELECT f.name, f."isDemo", u.email AS owner, m.role, m.status
FROM "Farm" f
LEFT JOIN "FarmMembership" m ON m."farmId"=f.id
LEFT JOIN "User" u ON u.id=m."userId"
WHERE f.name='Batth Farms';

\echo '=== meter / interval / bill counts ==='
SELECT
  (SELECT count(*) FROM "Pump" p JOIN "Farm" f ON f.id=p."farmId" WHERE f.name='Batth Farms') AS pumps,
  (SELECT count(*) FROM "Pump" p JOIN "Farm" f ON f.id=p."farmId" WHERE f.name='Batth Farms' AND p.status='UNMAPPED') AS unmapped,
  (SELECT count(*) FROM "UsageInterval" i JOIN "Pump" p ON p.id=i."pumpId" JOIN "Farm" f ON f.id=p."farmId" WHERE f.name='Batth Farms') AS intervals,
  (SELECT count(DISTINCT i."pumpId") FROM "UsageInterval" i JOIN "Pump" p ON p.id=i."pumpId" JOIN "Farm" f ON f.id=p."farmId" WHERE f.name='Batth Farms') AS pumps_with_intervals,
  (SELECT count(*) FROM "BillingPeriod" b JOIN "Pump" p ON p.id=b."pumpId" JOIN "Farm" f ON f.id=p."farmId" WHERE f.name='Batth Farms') AS billing_periods;

\echo '=== coverage / cost-source distribution ==='
SELECT p."coverageState",
       count(*) AS pumps,
       count(*) FILTER (WHERE p."modeledMonthlyCents" IS NOT NULL) AS with_modeled
FROM "Pump" p JOIN "Farm" f ON f.id=p."farmId"
WHERE f.name='Batth Farms'
GROUP BY p."coverageState" ORDER BY 1;

\echo '=== billed $ per account (reconciled meters, latest-period printed totals) ==='
SELECT a.number AS account,
       count(DISTINCT p.id) AS reconciled_pumps,
       to_char(SUM(bp."printedTotalCents")/100.0,'FM999,999,990.00') AS sum_printed_usd
FROM "Pump" p
JOIN "Farm" f ON f.id=p."farmId"
JOIN "Account" a ON a.id=p."accountId"
JOIN "BillingPeriod" bp ON bp."pumpId"=p.id
WHERE f.name='Batth Farms' AND p."coverageState"='reconciled'
GROUP BY a.number ORDER BY 2 DESC;

\echo '=== recommendations by tool (the savings findings) ==='
SELECT r.tool, count(*) AS n,
       count(*) FILTER (WHERE r."impactUsd" IS NOT NULL) AS with_dollar,
       to_char(SUM(r."impactUsd"),'FM999,999,990.00') AS sum_impact_usd
FROM "Recommendation" r JOIN "Farm" f ON f.id=r."farmId"
WHERE f.name='Batth Farms'
GROUP BY r.tool ORDER BY 2 DESC;

\echo '=== any findings on UNMAPPED meters? (should be ZERO) ==='
SELECT count(*) AS findings_on_unmapped
FROM "Recommendation" r
JOIN "Farm" f ON f.id=r."farmId"
WHERE f.name='Batth Farms'
  AND (r.action->'params'->>'pumpId') IN (
    SELECT p.id FROM "Pump" p JOIN "Farm" f2 ON f2.id=p."farmId"
    WHERE f2.name='Batth Farms' AND p.status='UNMAPPED'
  );

\echo '=== solar arrays (must be 840 + 1092 = 1932 kW, never 12180) ==='
SELECT to_char(a."nameplateKw",'FM999990') AS kw, a."nemType", count(DISTINCT bm."B") AS benefiting_meters
FROM "Farm" f JOIN "SolarArray" a ON a."farmId"=f.id
LEFT JOIN "_NemAllocation" bm ON bm."A"=a.id
WHERE f.name='Batth Farms'
GROUP BY a.id, a."nameplateKw", a."nemType" ORDER BY a."nameplateKw";

\echo '=== top rate-optimization findings (verify each is real, not artifact) ==='
SELECT (r.action->'params'->>'pumpId') AS pump,
       to_char(r."impactUsd",'FM999,990.00') AS impact_usd,
       r.severity, left(r.situation, 80) AS situation
FROM "Recommendation" r JOIN "Farm" f ON f.id=r."farmId"
WHERE f.name='Batth Farms' AND r.tool='rate-optimization'
ORDER BY r."impactUsd" DESC NULLS LAST LIMIT 15;
