<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Bulk schema-drift fix: prod MySQL has many columns that are NOT NULL
 * without a DEFAULT, even though the create migrations declared defaults.
 * Every INSERT that omits such a column fails with:
 *   SQLSTATE[HY000] 1364 "Field '<col>' doesn't have a default value"
 *
 * Instead of fixing tables one by one, we scan information_schema and set
 * a sensible default on every offending column in app-owned tables:
 *   - text/varchar/char/json  → ''
 *   - int/bigint/smallint     → 0
 *   - tinyint (bool)          → 0
 *   - decimal/float/double    → 0
 *
 * We skip framework/package tables, primary keys, and *_id / uuid-shaped
 * columns to avoid masking real FK problems.
 */
return new class extends Migration
{
    private array $skipTables = [
        'migrations', 'cache', 'cache_locks', 'sessions',
        'password_reset_tokens', 'failed_jobs', 'jobs', 'job_batches',
        'personal_access_tokens',
        'model_has_permissions', 'model_has_roles', 'role_has_permissions',
        'permissions', 'roles',
    ];

    public function up(): void
    {
        $db = DB::getDatabaseName();
        $cols = DB::select(
            "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
               FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = ?
                AND IS_NULLABLE = 'NO'
                AND COLUMN_DEFAULT IS NULL
                AND EXTRA NOT LIKE '%auto_increment%'
                AND EXTRA NOT LIKE '%DEFAULT_GENERATED%'
                AND COLUMN_KEY <> 'PRI'",
            [$db]
        );

        foreach ($cols as $c) {
            $table = $c->TABLE_NAME;
            $col   = $c->COLUMN_NAME;
            $type  = strtolower($c->DATA_TYPE);
            $ctype = $c->COLUMN_TYPE;

            if (in_array($table, $this->skipTables, true)) {
                continue;
            }
            // Skip FK-shaped columns — they should be explicit, not defaulted.
            if ($col === 'id' || str_ends_with($col, '_id') || str_ends_with($col, '_by')) {
                continue;
            }
            // Skip timestamp/date types — separate migration handles those.
            if (in_array($type, ['timestamp', 'datetime', 'date', 'time', 'year'], true)) {
                continue;
            }

            [$default, $backfill] = $this->defaultFor($type);
            if ($default === null) {
                continue;
            }

            try {
                // Backfill any NULL rows (shouldn't be any since NOT NULL, but safe).
                DB::statement("UPDATE `{$table}` SET `{$col}` = ? WHERE `{$col}` IS NULL", [$backfill]);
                DB::statement("ALTER TABLE `{$table}` MODIFY `{$col}` {$ctype} NOT NULL DEFAULT {$default}");
            } catch (\Throwable $e) {
                // Log and continue — one bad column shouldn't abort the whole fix.
                logger()->warning("drift-fix skip {$table}.{$col}: " . $e->getMessage());
            }
        }
    }

    public function down(): void
    {
        // Non-destructive fix.
    }

    private function defaultFor(string $type): array
    {
        return match ($type) {
            'tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint' => ['0', '0'],
            'decimal', 'numeric', 'float', 'double', 'real'                => ['0', '0'],
            'char', 'varchar', 'text', 'tinytext', 'mediumtext', 'longtext' => ["''", ''],
            'json' => ["('{}')", '{}'],
            default => [null, null],
        };
    }
};
