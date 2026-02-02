# Migration note

Run the following SQL on Postgres to add the manufacturer reference column:

```sql
ALTER TABLE materiels ADD COLUMN "refFabricant" VARCHAR(255);
```
