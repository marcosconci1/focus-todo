# Repository Guidelines

## Parameter Binding

All repositories must use positional SQL parameters ("?"). See:

- `../../../docs/database-parameter-binding.md`

## Repository Pattern

- Each repository is responsible for one table or related group of queries.
- Public helpers should validate inputs before touching the database.
- Use `wrapDbError()` to add context to thrown database errors.
- Prefer `getDatabase()` for non-transactional reads/writes.

## Transactions

- Use `withTransaction()` for multi-step write flows.
- Repositories must be safe to call inside a shared transaction.
- Keep transactions short to avoid `SQLITE_BUSY` errors.

## Error Handling

- Use `wrapDbError()` when catching errors in repository methods.
- Throw clear, user-friendly errors for validation failures.
- Avoid swallowing original errors; include them as causes where possible.

## Examples

```typescript
// Create with transaction
await withTransaction(async (db) => {
  await createWithDb(db, category)
})

// Read a record
const task = await getById(taskId)

// Update with WHERE clause parameter last
await db.run("UPDATE tasks SET name = ?, emoji = ? WHERE id = ?", [
  task.name,
  task.emoji,
  task.id,
])
```
