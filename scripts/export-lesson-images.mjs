import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/export-lesson-images.mjs OUTPUT_DIRECTORY');
const root=path.resolve(output);await mkdir(path.join(root,'uploads'),{recursive:true});
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const mapping={};const manifest=[];
async function walk(prefix='') {
 for(let offset=0;;offset+=100){
  const {data,error}=await client.storage.from('lesson-images').list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});
  if(error)throw new Error('Storage listing failed');
  for(const item of data){
   const key=prefix?`${prefix}/${item.name}`:item.name;
   if(!item.id){await walk(key);continue;}
   const {data:blob,error:downloadError}=await client.storage.from('lesson-images').download(key);
   if(downloadError)throw new Error('Storage download failed');
   const bytes=Buffer.from(await blob.arrayBuffer());
   const extension=/\.(png|jpe?g|gif|webp)$/i.exec(key)?.[1].toLowerCase().replace('jpeg','jpg');
   if(!extension)throw new Error('Unsupported image extension in Storage; review export before migration');
   const hash=createHash('sha256').update(bytes).digest('hex');const name=`${hash}.${extension}`;
   await writeFile(path.join(root,'uploads',name),bytes,{mode:0o640});
   const oldUrl=client.storage.from('lesson-images').getPublicUrl(key).data.publicUrl;
   mapping[oldUrl]=`/media/${name}`;
   mapping[decodeURI(oldUrl)]=`/media/${name}`;
   manifest.push({key,file:name,size:bytes.length,sha256:hash});
  }
  if(data.length<100)break;
 }
}
await walk();
await writeFile(path.join(root,'storage-map.json'),JSON.stringify(mapping,null,2));
await writeFile(path.join(root,'storage-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Exported ${manifest.length} Storage objects; mapping and SHA256 manifest saved.`);
