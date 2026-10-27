/**
 * Maps API field names to fixed column names. Column names come only from this
 * static map (never from user input); values are always bound as parameters.
 */
export interface TableDef {
  table: string;
  columns: Record<string, string>;
  /** Columns stored as jsonb. Arrays must be stringified or pg sends them as Postgres arrays. */
  json: ReadonlySet<string>;
}

export function selectList(def: TableDef): string {
  return ['id', ...Object.entries(def.columns).map(([field, col]) => `${col} AS "${field}"`), 'created_at AS "createdAt"', 'updated_at AS "updatedAt"'].join(', ');
}

function encode(def: TableDef, field: string, value: unknown) {
  return def.json.has(field) ? JSON.stringify(value) : value;
}

export function buildInsert(def: TableDef, data: Record<string, unknown>) {
  const fields = Object.keys(def.columns).filter((f) => data[f] !== undefined);
  const cols = fields.map((f) => def.columns[f]);
  const values = fields.map((f) => encode(def, f, data[f]));
  const placeholders = fields.map((_, i) => `$${i + 1}`);
  return { sql: `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${selectList(def)}`, values };
}

export function buildUpdate(def: TableDef, id: string, data: Record<string, unknown>) {
  const fields = Object.keys(def.columns).filter((f) => data[f] !== undefined);
  const sets = fields.map((f, i) => `${def.columns[f]} = $${i + 2}`);
  const values = [id, ...fields.map((f) => encode(def, f, data[f]))];
  return {
    sql: `UPDATE ${def.table} SET ${[...sets, 'updated_at = now()'].join(', ')} WHERE id = $1 RETURNING ${selectList(def)}`,
    values,
  };
}
