import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const mocks=vi.hoisted(()=>({admin:vi.fn(),limit:vi.fn()}));
vi.mock("@/lib/server-guard",()=>({requireAdmin:mocks.admin}));
vi.mock("@/lib/rate-limit",()=>({rateLimit:mocks.limit}));
import { POST } from "@/app/api/admin/upload-image/route";
import { GET } from "@/app/media/[name]/route";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64");
let dir:string;
function upload(bytes:Uint8Array=png,type="image/png"){
 const form=new FormData();form.set("file",new File([new Uint8Array(bytes)],"image.png",{type}));return new Request("http://localhost/api/admin/upload-image",{method:"POST",body:form});
}
beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),"quantorium-upload-"));vi.stubEnv("STORAGE_DRIVER","local");vi.stubEnv("UPLOADS_DIR",dir);mocks.admin.mockResolvedValue("mentor");mocks.limit.mockReturnValue(true)});
afterEach(async()=>{vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true})});
describe("local image storage",()=>{
 it("stores on disk and serves identical bytes without process memory",async()=>{
  const response=await POST(upload());expect(response.status).toBe(200);const{url}=await response.json();expect(url).toMatch(/^\/media\/[\w-]+\.png$/);
  const name=url.split('/').at(-1);expect(await readFile(path.join(dir,name))).toEqual(png);
  const read=await GET(new Request('http://localhost'+url),{params:Promise.resolve({name})});expect(read.status).toBe(200);expect(read.headers.get('content-type')).toBe('image/png');expect(Buffer.from(await read.arrayBuffer())).toEqual(png);
 });
 it("rejects unauthenticated uploads",async()=>{mocks.admin.mockRejectedValue(new Error('FORBIDDEN'));expect((await POST(upload())).status).toBe(403)});
 it("rejects disguised HTML and MIME mismatch",async()=>{expect((await POST(upload(Buffer.from('<html>not an image</html>')))).status).toBe(400);expect((await POST(upload(png,'image/jpeg'))).status).toBe(400)});
 it("rejects oversized input before writing",async()=>{expect((await POST(new Request("http://localhost/api/admin/upload-image", { method: "POST", body: new Uint8Array(6*1024*1024) }))).status).toBe(413)});
 it("rejects traversal and unknown files",async()=>{for(const name of ['../secret.png','%2e%2e.png','missing.png'])expect((await GET(new Request('http://localhost/media/x'),{params:Promise.resolve({name})})).status).toBe(404)});
 it("preserves rate limiting",async()=>{mocks.limit.mockReturnValue(false);expect((await POST(upload())).status).toBe(429)});
});
