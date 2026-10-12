export async function keyHash(key: string) {return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,"0")).join("");}
export function json(data: unknown, status = 200) {return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
