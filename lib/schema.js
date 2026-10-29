// Schema editor: turns a list of structure changes into SQL (Postgres or SQLite), with the reverse SQL for undo.
// Names are validated, types come from an allowlist, defaults are parsed (never pasted raw). Pure functions: no I/O here.

export class SchemaError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

export const PG_TYPES = ['text', 'integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision', 'boolean', 'date', 'time', 'timestamp', 'timestamptz', 'uuid', 'json', 'jsonb', 'bytea'];
export const SQLITE_TYPES = ['TEXT', 'INTEGER', 'REAL', 'NUMERIC', 'BLOB'];

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

export function checkName(n, what = 'Name') {
  if (typeof n !== 'string' || !NAME.test(n)) throw new SchemaError(`${what} must start with a letter or underscore and use only letters, numbers and underscores (max 63).`);
  return n;
}

export function checkType(engine, t) {
  const s = String(t || '').trim();
  if (engine === 'sqlite') {
    const u = s.toUpperCase();
    if (!SQLITE_TYPES.includes(u)) throw new SchemaError(`Type must be one of ${SQLITE_TYPES.join(', ')}.`);
    return u;
  }
  const l = s.toLowerCase();
  if (PG_TYPES.includes(l)) return l;
  let m = /^(varchar|char|character varying)\((\d{1,4})\)$/.exec(l); if (m) return `${m[1]}(${m[2]})`;
  m = /^numeric\((\d{1,3}),\s*(\d{1,3})\)$/.exec(l); if (m) return `numeric(${m[1]},${m[2]})`;
  throw new SchemaError(`Type "${s}" is not allowed. Use one of: ${PG_TYPES.join(', ')}, varchar(n), numeric(p,s).`);
}

// A default is one of: nothing, now(), a uuid generator, true/false, a number, or a quoted text value.
export function defaultSql(engine, d) {
  if (d === null || d === undefined || d === '') return null;
  const s = String(d).trim();
  if (/^(now\(\)|current_timestamp)$/i.test(s)) return engine === 'sqlite' ? 'CURRENT_TIMESTAMP' : 'now()';
  if (/^gen_random_uuid\(\)$/i.test(s)) { if (engine === 'sqlite') throw new SchemaError('SQLite has no uuid generator default.'); return 'gen_random_uuid()'; }
  if (/^(true|false)$/i.test(s)) return engine === 'sqlite' ? (s.toLowerCase() === 'true' ? '1' : '0') : s.toLowerCase();
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (s.includes('\0')) throw new SchemaError('Default contains a NUL byte.');
  return lit(s);
}

const colMap = (cols) => new Map(cols.map((c) => [c.name, c]));

function colDef(engine, c) {
  const type = checkType(engine, c.type);
  const def = defaultSql(engine, c.default);
  return `${q(checkName(c.name, 'Column name'))} ${type}${c.nullable === false ? ' NOT NULL' : ''}${def ? ` DEFAULT ${def}` : ''}`;
}

/**
 * ops: [{ op, ... }]. cols: current columns [{name,type,nullable,default,pk}]. indexes: [{name, def, unique, columns}].
 * Returns { statements, down, warnings, destructive, reversible, tableAfter }.
 */
export function buildPlan(engine, table, ops, cols = [], indexes = []) {
  if (!Array.isArray(ops) || !ops.length) throw new SchemaError('No changes to apply.');
  if (ops.length > 25) throw new SchemaError('Too many changes at once (max 25).');
  const out = { statements: [], down: [], warnings: [], destructive: false, reversible: true, tableAfter: table };
  const cur = colMap(cols.map((c) => ({ ...c })));
  const idx = new Map(indexes.map((i) => [i.name, i]));
  let t = table;
  const T = () => q(t);
  const need = (n) => { const c = cur.get(n); if (!c) throw new SchemaError(`There is no column called ${n}.`); return c; };
  const pgOnly = (what) => { if (engine === 'sqlite') throw new SchemaError(`SQLite cannot ${what} in place. Add a new column, copy the data with SQL, then drop the old one.`); };

  for (const o of ops) {
    switch (o.op) {
      case 'add_column': {
        const name = checkName(o.name, 'Column name'); if (cur.has(name)) throw new SchemaError(`Column ${name} already exists.`);
        const c = { name, type: checkType(engine, o.type), nullable: o.nullable !== false, default: o.default ?? null };
        const def = defaultSql(engine, c.default);
        if (!c.nullable && !def) out.warnings.push(`${name} is NOT NULL with no default: this fails if the table already has rows.`);
        out.statements.push(`ALTER TABLE ${T()} ADD COLUMN ${colDef(engine, c)}`);
        out.down.unshift(`ALTER TABLE ${T()} DROP COLUMN ${q(name)}`);
        cur.set(name, { ...c, pk: false });
        break;
      }
      case 'rename_column': {
        const from = o.from, to = checkName(o.to, 'New column name'); need(from); if (cur.has(to)) throw new SchemaError(`Column ${to} already exists.`);
        out.statements.push(`ALTER TABLE ${T()} RENAME COLUMN ${q(from)} TO ${q(to)}`);
        out.down.unshift(`ALTER TABLE ${T()} RENAME COLUMN ${q(to)} TO ${q(from)}`);
        out.warnings.push(`The app's code may still use the name ${from}. Update it too, or the app will break.`);
        const c = cur.get(from); cur.delete(from); cur.set(to, { ...c, name: to });
        break;
      }
      case 'drop_column': {
        const c = need(o.name); if (c.pk) throw new SchemaError(`${o.name} is the primary key and cannot be dropped here.`);
        out.statements.push(`ALTER TABLE ${T()} DROP COLUMN ${q(o.name)}`);
        out.destructive = true; out.reversible = false; out.warnings.push(`Dropping ${o.name} permanently deletes its data. A backup is taken first.`);
        cur.delete(o.name);
        break;
      }
      case 'set_type': {
        pgOnly('change a column type'); const c = need(o.name); const type = checkType(engine, o.type);
        out.statements.push(`ALTER TABLE ${T()} ALTER COLUMN ${q(o.name)} TYPE ${type} USING ${q(o.name)}::${type}`);
        out.down.unshift(`ALTER TABLE ${T()} ALTER COLUMN ${q(o.name)} TYPE ${c.type} USING ${q(o.name)}::${c.type}`);
        out.warnings.push(`Changing ${o.name} from ${c.type} to ${type} can fail or lose precision if values do not fit.`);
        c.type = type;
        break;
      }
      case 'set_nullable': {
        pgOnly('change NOT NULL'); const c = need(o.name); const nullable = o.nullable !== false;
        out.statements.push(`ALTER TABLE ${T()} ALTER COLUMN ${q(o.name)} ${nullable ? 'DROP' : 'SET'} NOT NULL`);
        out.down.unshift(`ALTER TABLE ${T()} ALTER COLUMN ${q(o.name)} ${nullable ? 'SET' : 'DROP'} NOT NULL`);
        if (!nullable) out.warnings.push(`This fails if ${o.name} already contains NULLs.`);
        c.nullable = nullable;
        break;
      }
      case 'set_default': {
        pgOnly('change a default'); const c = need(o.name); const def = defaultSql(engine, o.default);
        out.statements.push(def ? `ALTER TABLE ${T()} ALTER COLUMN ${q(o.name)} SET DEFAULT ${def}` : `ALTER TABLE ${T()} ALTER COLUMN ${q(o.name)} DROP DEFAULT`);
        out.down.unshift(c.default ? `ALTER TABLE ${T()} ALTER COLUMN ${q(o.name)} SET DEFAULT ${c.default}` : `ALTER TABLE ${T()} ALTER COLUMN ${q(o.name)} DROP DEFAULT`);
        c.default = def;
        break;
      }
      case 'add_index': {
        const columns = Array.isArray(o.columns) ? o.columns : []; if (!columns.length) throw new SchemaError('Pick at least one column for the index.');
        columns.forEach(need);
        const name = checkName(o.name || `idx_${t}_${columns.join('_')}`.slice(0, 60), 'Index name'); if (idx.has(name)) throw new SchemaError(`An index called ${name} already exists.`);
        out.statements.push(`CREATE ${o.unique ? 'UNIQUE ' : ''}INDEX ${q(name)} ON ${T()} (${columns.map(q).join(', ')})`);
        out.down.unshift(`DROP INDEX ${engine === 'postgres' ? `${q('public')}.` : ''}${q(name)}`);
        if (o.unique) out.warnings.push('A unique index fails if the column already has duplicate values.');
        idx.set(name, { name, columns, unique: !!o.unique });
        break;
      }
      case 'drop_index': {
        const i = idx.get(o.name); if (!i) throw new SchemaError(`There is no index called ${o.name}.`);
        out.statements.push(`DROP INDEX ${engine === 'postgres' ? `${q('public')}.` : ''}${q(o.name)}`);
        if (i.def) out.down.unshift(i.def); else out.reversible = false;
        idx.delete(o.name);
        break;
      }
      case 'rename_table': {
        const to = checkName(o.to, 'New table name');
        out.statements.push(`ALTER TABLE ${T()} RENAME TO ${q(to)}`);
        out.down.unshift(`ALTER TABLE ${q(to)} RENAME TO ${T()}`);
        out.warnings.push(`The app's code may still use the table name ${t}. Update it too, or the app will break.`);
        t = to; out.tableAfter = to;
        break;
      }
      default: throw new SchemaError(`Unknown change type "${o.op}".`);
    }
  }
  return out;
}

/** CREATE TABLE plan (no existing table). columns: [{name,type,nullable,default}], autoId adds an id primary key. */
export function buildCreateTable(engine, name, columns, autoId = true) {
  checkName(name, 'Table name');
  const cols = Array.isArray(columns) ? columns : [];
  if (!cols.length && !autoId) throw new SchemaError('Add at least one column.');
  const seen = new Set(autoId ? ['id'] : []);
  const defs = [];
  if (autoId) defs.push(engine === 'sqlite' ? '"id" INTEGER PRIMARY KEY AUTOINCREMENT' : '"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY');
  for (const c of cols) { if (seen.has(c.name)) throw new SchemaError(`Column ${c.name} is listed twice.`); seen.add(c.name); defs.push(colDef(engine, c)); }
  return { statements: [`CREATE TABLE ${q(name)} (${defs.join(', ')})`], down: [`DROP TABLE ${q(name)}`], warnings: [], destructive: false, reversible: true, tableAfter: name };
}

export function buildDropTable(name) {
  checkName(name, 'Table name');
  return { statements: [`DROP TABLE ${q(name)}`], down: [], warnings: [`Dropping ${name} permanently deletes the table and all its rows. A backup is taken first.`], destructive: true, reversible: false, tableAfter: null };
}
