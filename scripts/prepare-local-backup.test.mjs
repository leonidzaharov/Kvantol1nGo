import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
describe('offline migration copy',()=>{
 it('replaces nested lesson URLs without changing IDs, PIN hashes, balances or source',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'quantorium-convert-'));
  try {
   const old='https://example.supabase.co/storage/v1/object/public/lesson-images/old.png';const local='/media/'+ 'a'.repeat(64)+'.png';
   const source={tables:{User:[{id:'student',pinHash:'hash',currency:540,pixelsRedeemed:12}],Lesson:[{id:7,content:JSON.stringify({theory:`![image](${old})`})}]}};
   const input=path.join(dir,'input.json'),mapping=path.join(dir,'map.json'),output=path.join(dir,'output.json');
   writeFileSync(input,JSON.stringify(source));writeFileSync(mapping,JSON.stringify({[old]:local}));
   const result=spawnSync(process.execPath,['scripts/prepare-local-backup.mjs',input,mapping,output],{encoding:'utf8'});
   expect(result.status).toBe(0);const converted=JSON.parse(readFileSync(output,'utf8'));
   expect(converted.tables.User).toEqual(source.tables.User);expect(JSON.parse(converted.tables.Lesson[0].content).theory).toContain(local);expect(JSON.parse(readFileSync(input,'utf8'))).toEqual(source);
   expect(spawnSync(process.execPath,['scripts/prepare-local-backup.mjs',input,mapping,output]).status).not.toBe(0);
  }finally{rmSync(dir,{recursive:true,force:true})}
 });
});
