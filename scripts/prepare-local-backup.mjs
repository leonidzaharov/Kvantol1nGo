import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const [input,mapFile,output]=process.argv.slice(2);
if(!input||!mapFile||!output||path.resolve(input)===path.resolve(output))throw new Error('Usage: prepare-local-backup.mjs INPUT_JSON STORAGE_MAP OUTPUT_JSON (new file)');
const map=JSON.parse(await readFile(mapFile,'utf8'));let replacements=0;
for (const [from,to] of Object.entries(map)) {
 if (!/^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/lesson-images\//.test(from) || typeof to!=='string' || !/^\/media\/[a-f0-9]{64}\.(png|jpg|gif|webp)$/.test(to)) throw new Error('Invalid Storage URL mapping');
}
function replace(value){
 if(typeof value==='string'){
  for(const [from,to] of Object.entries(map)){const parts=value.split(from);replacements+=parts.length-1;value=parts.join(to);}
  return value;
 }
 if(Array.isArray(value))return value.map(replace);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)]));
 return value;
}
const backup=replace(JSON.parse(await readFile(input,'utf8')));
if (/\.supabase\.co\/storage\/v1\/object\/public\/lesson-images\//.test(JSON.stringify(backup))) throw new Error('Unmapped Storage URLs remain. Review export before restoring; output not written.');
await writeFile(output,JSON.stringify(backup,null,2),{flag:'wx',mode:0o600});
console.log(`Prepared separate backup; replaced ${replacements} image URLs. Original unchanged.`);
