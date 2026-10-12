import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
const url=process.env.DATABASE_URL_UNPOOLED;if(!url)throw Error('Direct database URL is missing');
await migrate(drizzle(neon(url)),{migrationsFolder:'./drizzle'});
console.log('Order migrations applied');
