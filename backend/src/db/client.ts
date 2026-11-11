import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// Re-exported so scripts outside this package (bot/) need no node_modules of their own.
export { sql } from 'drizzle-orm';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

export const sqlClient = postgres(url, { max: 10 });
export const db = drizzle(sqlClient, { schema });
