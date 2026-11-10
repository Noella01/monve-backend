import type { Store, Row } from '../db.js';
import type { CustomInput } from '../schemas.js';
import { id, now, hash, json, requireValue } from '../core.js';
const steps = ['NEW','CONTACTED','DESIGNING','APPROVED','IN PRODUCTION','READY','COMPLETED'];
export class Customs {
  constructor(public db: Store) {}
  row(requestId: string) { const row = this.db.one('SELECT * FROM custom_requests WHERE id=?',requestId); requireValue(row,404,'Request not found.'); return row; }
  dto(row: Row, admin = false) {
    const data = JSON.parse(row.data);
    const common = { id:row.id,request_number:row.request_number,clothing_type:data.clothing_type,preferred_color:data.preferred_color,occasion:data.occasion,preferred_deadline:data.preferred_deadline,status:row.status,notes:row.notes,estimated_price:row.estimated_price,version:row.version,created_at:row.created_at,updated_at:row.updated_at,media_id:row.media_id,
      history:this.db.all('SELECT status,timestamp,notes FROM custom_history WHERE request_id=? ORDER BY id',row.id), deadline_is_confirmed:false };
    return admin ? { ...data,...common,internal_notes:row.internal_notes } : { ...common,full_name:data.full_name,phone:data.phone };
  }
  list(customer?: string) { return this.db.all(`SELECT * FROM custom_requests${customer ? ' WHERE customer_id=?' : ''} ORDER BY created_at DESC,id`,...(customer ? [customer] : [])).map(r=>this.dto(r,!customer)); }
  track(number: string, customer?: string, accessToken?: string) {
    const row = this.db.one('SELECT * FROM custom_requests WHERE request_number=?',number.trim().replace(/^#/,''));
    requireValue(row && ((customer && row.customer_id===customer) || (!row.customer_id && accessToken && row.access_hash===hash(accessToken))),404,'Request not found or access proof is invalid.', 'NOT_FOUND');
    return this.dto(row);
  }
  create(input: CustomInput, customer: string | undefined, key: string) {
    return this.db.tx(() => {
      requireValue(customer || input.access_token,400,'A private access token is required for guest tracking.');
      const scope = `custom:${customer || hash(input.access_token!)}`;
      const previous = this.db.prior(scope,key,input);
      if (previous) return this.dto(this.row(previous));
      const today = new Intl.DateTimeFormat('en-CA',{ timeZone:'Africa/Kigali',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
      requireValue(input.preferred_deadline >= today,400,'Choose today or a future preferred deadline. This remains a request, not a completion promise.');
      if (input.media_id) {
        const media = this.db.one("SELECT * FROM media WHERE id=? AND purpose='custom' AND attached_at IS NULL",input.media_id);
        requireValue(media && ((customer && media.owner_id===customer) || (input.upload_token && media.upload_hash===hash(input.upload_token))),404,'Reference image not found or unavailable.');
        this.db.run('UPDATE media SET attached_at=? WHERE id=?',now(),input.media_id);
      }
      const { access_token,upload_token,media_id,...data } = input;
      const requestId=id(),timestamp=now();
      this.db.run(`INSERT INTO custom_requests(id,request_number,customer_id,access_hash,media_id,data,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'NEW',?,?)`,requestId,`CUS-${requestId.slice(0,8).toUpperCase()}`,customer || null,customer ? null : hash(access_token!),media_id || null,json({gender:'Unisex',measurements:'',occasion:'',...data}),timestamp,timestamp);
      this.db.run('INSERT INTO custom_history(request_id,status,actor_id,timestamp) VALUES (?,?,?,?)',requestId,'NEW',customer || null,timestamp);
      this.db.remember(scope,key,input,requestId);
      this.db.event('custom_request_created',requestId,'private',customer || null,1);
      return this.dto(this.row(requestId));
    });
  }
  update(requestId: string, input: { status:string; notes?:string; internal_notes?:string; expected_version:number; estimated_price?:number }, actor: string) {
    return this.db.tx(() => {
      const row=this.row(requestId);
      requireValue(row.version===input.expected_version,409,'Request changed. Refresh and try again.','VERSION_CONFLICT');
      const valid = input.status===row.status || (row.status!=='COMPLETED' && row.status!=='CANCELLED' && (input.status==='CANCELLED' || steps[steps.indexOf(row.status)+1]===input.status));
      requireValue(valid,409,`Cannot change ${row.status} to ${input.status}.`,'INVALID_TRANSITION');
      this.db.run('UPDATE custom_requests SET status=?,notes=?,internal_notes=?,estimated_price=?,version=version+1,updated_at=? WHERE id=?',input.status,input.notes ?? row.notes,input.internal_notes ?? row.internal_notes,input.estimated_price ?? row.estimated_price,now(),requestId);
      this.db.run('INSERT INTO custom_history(request_id,status,actor_id,timestamp,notes) VALUES (?,?,?,?,?)',requestId,input.status,actor,now(),input.notes ?? row.notes);
      this.db.audit(actor,'custom_updated',requestId,{from:row.status,to:input.status});
      this.db.event('custom_request_updated',requestId,'private',row.customer_id,row.version+1);
      return this.dto(this.row(requestId),true);
    });
  }
}
