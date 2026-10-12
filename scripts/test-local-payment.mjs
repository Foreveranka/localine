import {build} from "esbuild";
import {mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
await mkdir(".local",{recursive:true});
await build({entryPoints:["tests/local-payment.ts"],outfile:".local/local-payment-tests.cjs",bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"server-only-test-stub",setup(b){b.onResolve({filter:/^server-only$/},()=>({path:"server-only",namespace:"test"}));b.onLoad({filter:/.*/,namespace:"test"},()=>({contents:""}));}}]});
execFileSync(process.execPath,[".local/local-payment-tests.cjs"],{stdio:"inherit"});
