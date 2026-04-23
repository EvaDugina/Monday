import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

async function main(): Promise<void> {
  const sourcePath = resolve(process.argv[2] ?? process.env.SQLITE_PATH ?? '/data/monday.sqlite');
  const targetPath = process.argv[3];

  if (!targetPath) {
    throw new Error('Usage: node dist/cli/backup.js <source-sqlite-path> <target-backup-path>');
  }

  const absoluteTargetPath = resolve(targetPath);
  mkdirSync(dirname(absoluteTargetPath), { recursive: true });

  const database = new Database(sourcePath, { readonly: true });

  try {
    await database.backup(absoluteTargetPath);

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'sqlite_backup_completed',
        sourcePath,
        targetPath: absoluteTargetPath,
      }),
    );
  } finally {
    database.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'sqlite_backup_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  process.exit(1);
});
