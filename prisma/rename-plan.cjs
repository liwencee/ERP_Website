/* Rename one InvestmentPlan. Dry-run unless APPLY=1. */
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DBURL, ssl: { rejectUnauthorized: false } });
const MATCH = '%Save Future%';
const NEW_NAME = 'My Savings Plan – Save Future SF'; // en-dash to match other plan titles
(async () => {
  const client = await pool.connect();
  try {
    const found = await client.query('SELECT id, name, type FROM "InvestmentPlan" WHERE name ILIKE $1', [MATCH]);
    console.log('Matches (' + found.rows.length + '):');
    console.table(found.rows);
    if (found.rows.length !== 1) { console.log('Expected exactly 1 match — ABORTING.'); return; }
    console.log('OLD: "' + found.rows[0].name + '"');
    console.log('NEW: "' + NEW_NAME + '"');
    if (process.env.APPLY !== '1') { console.log('\nDRY RUN — re-run with APPLY=1 to apply.'); return; }
    const r = await client.query('UPDATE "InvestmentPlan" SET name = $1, "updatedAt" = now() WHERE id = $2', [NEW_NAME, found.rows[0].id]);
    console.log('\nAPPLIED ✓ updated ' + r.rowCount + ' row.');
  } catch (e) { console.error('ERR', e.message); } finally { client.release(); await pool.end(); }
})();
