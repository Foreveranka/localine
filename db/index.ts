import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
function createDb(){const url=process.env.DATABASE_URL;if(!url)throw new Error("Order database is not configured");return drizzle(neon(url),{schema});}
let db:ReturnType<typeof createDb>|null=null;
export function getDb(){return db??(db=createDb());}
