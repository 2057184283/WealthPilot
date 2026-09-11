import { readdirSync,readFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>['.git','data','node_modules'].includes(e.name)?[]:e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]);}
const files=walk(root),code=files.filter(f=>/\.(mjs|js)$/.test(f));
for(const file of code){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
for(const file of ['public/index.html','public/app.js','public/styles.css','public/favicon.svg'])if(!readFileSync(resolve(root,file)).length)throw new Error('Empty required asset: '+file);
console.log(`Build validation passed: ${code.length} JavaScript modules; all required web assets present. No bundling required.`);
