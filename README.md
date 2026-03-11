# sqlite-plan-diff

`sqlite-plan-diff` is a small TypeScript CLI for comparing SQLite query plans semantically, not just with plain text diffing.

It runs `EXPLAIN QUERY PLAN`, normalizes plan nodes, and reports meaningful changes such as:

- `SCAN -> SEARCH`
- index added/removed/changed
- covering index gained/lost
- temporary b-tree introduced/removed
- major subtree/join shape changes

## Install

```bash
pnpm install
pnpm build
```

If `better-sqlite3` native bindings are blocked on first install (pnpm security prompt), run:

```bash
pnpm approve-builds
```

Then approve `better-sqlite3`.

Run locally during development:

```bash
pnpm dev -- --help
```

## Usage

### `explain`

```bash
sqlite-plan-diff explain app.db "select * from users where email = ?"
sqlite-plan-diff explain app.db "select * from users where email = ?" --json
```

### `diff`

```bash
sqlite-plan-diff diff app.db \
  --before "select * from users where name = 'Alice'" \
  --after "select * from users where email = 'alice@example.com'"
```

```bash
sqlite-plan-diff diff app.db \
  --before "select * from users where name = ?" --before-param "Alice" \
  --after "select * from users where email = ?" --after-param "alice@example.com" \
  --json
```

### `whatif`

```bash
sqlite-plan-diff whatif app.db \
  --query "select * from orders where customer_id = 42 order by created_at desc" \
  --index "create index idx_orders_customer_created on orders(customer_id, created_at desc)"
```

`whatif` works by cloning the DB file to a temporary location, applying the DDL there, and then diffing baseline vs hypothetical plans.

## Demo (Before/After)

Using the included fixture database:

```bash
sqlite-plan-diff whatif test/fixtures/app.db \
  --query "select * from orders where customer_id = 42 order by created_at desc" \
  --index "create index idx_orders_customer_created on orders(customer_id, created_at desc)"
```

Expected semantic changes include:

- `scan_to_search` for `orders`
- `index_added` (`idx_orders_customer_created`)
- `temp_btree_removed` (`ORDER BY`)

Typical output:

```text
Semantic Diff
- [scan_to_search] Table "orders" improved from SCAN to SEARCH.
- [index_added] Table "orders" now uses index "idx_orders_customer_created".
- [temp_btree_removed] Temporary B-tree removed (ORDER BY).

Before Plan
SCAN | table=orders
TEMP_BTREE | reason=ORDER BY

After Plan
SEARCH | table=orders | index=idx_orders_customer_created | where=customer_id=?
```

## JSON Output

All commands support `--json`. Output includes:

- raw EQP rows
- normalized plan (`op`, `table`, `index`, `covering`, `whereTerms`, `tempReason`, `children`)
- semantic diff changes for `diff` and `whatif`

## Limitations

- Planner comparison tool only: it does not benchmark runtime.
- Query plans can differ across SQLite versions and dataset statistics.
- Parameter values can affect plan choice.
- Use this tool to detect likely plan improvements/regressions, then confirm with real timing on representative data.

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Project Layout

- `src/cli.ts`
- `src/commands/explain.ts`
- `src/commands/diff.ts`
- `src/commands/whatif.ts`
- `src/sqlite/connect.ts`
- `src/sqlite/eqp.ts`
- `src/parser/normalizePlan.ts`
- `src/diff/semanticDiff.ts`
- `src/diff/renderTerminal.ts`
- `src/diff/renderJson.ts`
- `src/sandbox/cloneDb.ts`
- `test/`
