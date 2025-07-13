import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './index';
import path from 'path';

async function runMigrations() {
  console.log('Running migrations...');
  
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, '../../migrations') });
    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();