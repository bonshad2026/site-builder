-- After copying rows with their ids: move every id sequence past the highest id in its table,
-- so the next insert cannot collide (it never moves a sequence backwards).
DO $$
DECLARE
  r record;
  m bigint;
BEGIN
  FOR r IN
    SELECT s.oid::regclass AS seq, d.refobjid::regclass AS tbl, a.attname AS col
      FROM pg_catalog.pg_class s
      JOIN pg_catalog.pg_depend d ON d.objid = s.oid AND d.classid = 'pg_catalog.pg_class'::regclass
       AND d.refclassid = 'pg_catalog.pg_class'::regclass AND d.deptype IN ('a', 'i')
      JOIN pg_catalog.pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
     WHERE s.relkind = 'S'
  LOOP
    EXECUTE format('SELECT max(%I) FROM %s', r.col, r.tbl) INTO m;
    IF m IS NOT NULL AND m > coalesce(pg_catalog.pg_sequence_last_value(r.seq), 0) THEN
      PERFORM pg_catalog.setval(r.seq, m);
    END IF;
  END LOOP;
END $$;
