import { mkdirSync, writeFileSync, unlinkSync, createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type Metadata } from 'sharp';
import type { Store } from '../db.js';
import type { Config } from '../config.js';
import { ApiError, hash, id, now, requireValue, token } from '../core.js';
export class Media {
  constructor(private db: Store, private cfg: Config) { mkdirSync(cfg.uploadDir,{recursive:true}); }
  async upload(bytes: Buffer, purpose: 'product'|'custom', owner?: string) {
    requireValue(bytes.length>0 && bytes.length<=5*1024*1024,413,'Choose a JPEG, PNG or WebP image up to 5 MB.');
    let metadata: Metadata;
    try { metadata=await sharp(bytes,{limitInputPixels:20_000_000,failOn:'warning'}).metadata(); }
    catch { throw new ApiError(400,'Image bytes are invalid.'); }
    requireValue(['jpeg','png','webp'].includes(metadata.format || '') && (metadata.pages || 1)===1 && metadata.width && metadata.height && metadata.width<=8000 && metadata.height<=8000,400,'Use a single JPEG, PNG or WebP image under 20 megapixels.');
    // Decode/re-encode validates the full image and removes EXIF/location data.
    const clean=await sharp(bytes,{limitInputPixels:20_000_000,failOn:'warning'}).rotate().webp({quality:90}).toBuffer({resolveWithObject:true}).catch(()=>{throw new ApiError(400,'Image decoding failed.');});
    const mediaId=id(),filename=`${mediaId}.webp`,uploadToken=token();
    writeFileSync(join(this.cfg.uploadDir,filename),clean.data,{flag:'wx',mode:0o600});
    try {
      this.db.run('INSERT INTO media(id,filename,purpose,owner_id,upload_hash,mime,bytes,width,height,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',mediaId,filename,purpose,owner || null,hash(uploadToken),'image/webp',clean.data.length,clean.info.width,clean.info.height,now());
    } catch (e) { unlinkSync(join(this.cfg.uploadDir,filename)); throw e; }
    return {media_id:mediaId,url:`${this.cfg.publicUrl}/api/media/${mediaId}`,upload_token:uploadToken,purpose};
  }
  get(mediaId: string, customer?: string, admin=false, uploadToken?: string, trackingToken?: string) {
    const row=this.db.one('SELECT * FROM media WHERE id=?',mediaId);
    let allowed=row && (row.purpose==='product' || admin);
    if (row?.purpose==='custom' && !allowed) {
      const request=this.db.one('SELECT customer_id,access_hash FROM custom_requests WHERE media_id=?',mediaId);
      allowed=request ? Boolean((customer && request.customer_id===customer) || (!request.customer_id && trackingToken && request.access_hash===hash(trackingToken))) : Boolean((customer && row.owner_id===customer) || (uploadToken && row.upload_hash===hash(uploadToken)));
    }
    requireValue(row && allowed && existsSync(join(this.cfg.uploadDir,row.filename)),404,'Image not found.');
    return {stream:createReadStream(join(this.cfg.uploadDir,row.filename)),mime:row.mime,public:row.purpose==='product'};
  }
  cleanup() {
    const cutoff=new Date(Date.now()-24*3600000).toISOString();
    return this.db.tx(()=>{
      const rows=this.db.all(`SELECT * FROM media m WHERE created_at<? AND (attached_at IS NULL OR (purpose='product'
        AND NOT EXISTS (SELECT 1 FROM products p WHERE p.archived=0 AND instr(json_extract(p.data,'$.image_url'),'/api/media/'||m.id)>0)
        AND NOT EXISTS (SELECT 1 FROM orders o,json_each(o.items) item WHERE instr(json_extract(item.value,'$.product_image'),'/api/media/'||m.id)>0)))`,cutoff);
      for (const row of rows) {
        if (existsSync(join(this.cfg.uploadDir,row.filename))) unlinkSync(join(this.cfg.uploadDir,row.filename));
        this.db.run('DELETE FROM media WHERE id=?',row.id);
      }
      this.db.run('DELETE FROM sessions WHERE expires_at<?',now());
      return rows.length;
    });
  }
}
