import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply, type HTTPMethods } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { Type as T } from '@sinclair/typebox';
import { config, type Config } from './config.js';
import { Store } from './db.js';
import { Auth } from './auth.js';
import { ApiError, now, requireValue, json } from './core.js';
import * as S from './schemas.js';
import * as R from './responses.js';
import { Catalog } from './services/catalog.js';
import { Shopping } from './services/shopping.js';
import { Orders } from './services/orders.js';
import { Customs } from './services/customs.js';
import { Media } from './services/media.js';
import { Flutterwave, verifyWebhook, type Provider } from './services/flutterwave.js';
import { Payments } from './services/payments.js';
import { Emails, type EmailProvider } from './services/emails.js';

declare module 'fastify' { interface FastifyRequest { rawBody?: string } }
type Request = Omit<FastifyRequest,'body'|'params'|'query'> & { body:any; params:{id:string}; query:any };
export async function buildApp(options: { config?:Config; store?:Store; provider?:Provider; emailProvider?:EmailProvider; logging?:boolean }={}) {
  const cfg=options.config || config(),db=options.store || new Store(cfg.databasePath);
  const app=Fastify({ logger:options.logging ? { level:'info',redact:['req.headers.cookie','req.headers.authorization','req.headers["x-order-token"]','req.headers["x-tracking-token"]','req.headers["x-upload-token"]','req.headers["verif-hash"]','req.headers["flutterwave-signature"]'],serializers:{req:(req)=>({method:req.method,url:req.url?.split('?')[0],id:req.id})} } : false,
    bodyLimit:256*1024,trustProxy:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}} });
  const auth=new Auth(db,cfg),catalog=new Catalog(db),shopping=new Shopping(db,catalog),orders=new Orders(db,catalog,cfg),customs=new Customs(db),media=new Media(db,cfg),payments=new Payments(db,orders,cfg,options.provider || new Flutterwave(cfg)),emails=new Emails(db,cfg,options.emailProvider);
  const services={db,auth,catalog,shopping,orders,customs,media,payments,emails,cfg};
  await app.register(cookie);
  await app.register(cors,{origin:cfg.origins,credentials:true,allowedHeaders:['Content-Type','X-Aurie-Client','Idempotency-Key','X-Order-Token','X-Tracking-Token','X-Upload-Token'],methods:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']});
  await app.register(helmet,{contentSecurityPolicy:false,strictTransportSecurity:cfg.production ? undefined : false});
  await app.register(rateLimit,{max:240,timeWindow:'1 minute',errorResponseBuilder:()=>({error:'Too many requests. Please wait and retry.',code:'RATE_LIMITED'})});
  await app.register(multipart,{limits:{fileSize:5*1024*1024,files:1,fields:0,parts:1}});
  await app.register(swagger,{transformObject:(document)=>{
    const spec:any=('openapiObject' in document ? document.openapiObject : document.swaggerObject);
    const upload=spec.paths?.['/api/uploads']?.post;
    if(upload)upload.requestBody={required:true,content:{'multipart/form-data':{schema:{type:'object',required:['file'],properties:{file:{type:'string',format:'binary'}}}}}};
    for(const [path,item] of Object.entries<any>(spec.paths || {})){
      if(path.startsWith('/api/orders/{id}'))for(const method of ['get','post'] as const){const operation=item?.[method];if(operation)operation.parameters=[...(operation.parameters || []),{in:'header',name:'X-Order-Token',required:false,description:'Guest order private access token. Owners/admins use their session cookie.',schema:{type:'string'}}];}
      if(path==='/api/media/{id}'&&item?.get)item.get.parameters=[...(item.get.parameters||[]),...['X-Upload-Token','X-Tracking-Token'].map(name=>({in:'header' as const,name,schema:{type:'string'}}))];
    }
    return spec;
  },openapi:{info:{title:'AURIE Store API',version:'1.0.0',description:'Use Authorize and enter web for AppClient before mutations. Customer/admin login sets HttpOnly session cookies. Guest access uses private tokens in headers. Amounts are integer RWF. Payments remain unavailable until merchant credentials are configured.'},servers:[{url:cfg.publicUrl}],components:{securitySchemes:{AppClient:{type:'apiKey',in:'header',name:'X-Aurie-Client'},CustomerSession:{type:'apiKey',in:'cookie',name:'aurie_customer'},AdminSession:{type:'apiKey',in:'cookie',name:'aurie_admin'}}}}});
  for (const schema of R.schemas) app.addSchema(schema);
  if (cfg.docs) await app.register(swaggerUI,{routePrefix:'/docs',uiConfig:{docExpansion:'list',persistAuthorization:false,withCredentials:true},staticCSP:true,transformStaticCSP:header=>cfg.production ? header : header.replace(/upgrade-insecure-requests;?/g,'')});
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json',{parseAs:'string'},(req,body,done)=>{
    req.rawBody=body as string;
    try { done(null,JSON.parse(body as string)); } catch { done(new ApiError(400,'Malformed JSON.','INVALID_JSON'),undefined); }
  });
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    if (req.url.split('?')[0]==='/api/payments/flutterwave/webhook') return;
    if (req.headers.origin && !cfg.origins.includes(req.headers.origin)) throw new ApiError(403,'Origin is not allowed.','ORIGIN_FORBIDDEN');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) requireValue(req.headers['x-aurie-client']==='web',403,'Send X-Aurie-Client: web. Cross-site form submissions are not accepted.','CSRF_REJECTED');
  });
  app.setErrorHandler((error,req,reply)=>{
    const e=error as any;
    const status=e.validation ? 400 : e.statusCode || 500;
    if (status>=500 && !(e instanceof ApiError)) req.log.error({code:e.code,requestId:req.id},'Request failed');
    reply.code(status).send({error:e.validation ? `Invalid request: ${e.message}` : status>=500 && !(e instanceof ApiError) ? 'The service could not complete this request.' : e.message,code:e.code || (status>=500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED')});
  });
  const ref=(schema: any)=>T.Ref(schema);
  function route(method: HTTPMethods,url: string,tag: string,summary: string,handler:(req:Request,reply:FastifyReply)=>any,opts:{body?:any;response?:any;access?:'admin'|'customer';idem?:boolean;rate?:number;query?:any;description?:string;consumes?:string[]}={}) {
    const mutation=!['GET','HEAD'].includes(method);
    const schema:any={tags:[tag],summary,description:opts.description,body:opts.body,querystring:opts.query,params:url.includes(':id') ? S.idParams : undefined,
      headers:opts.idem ? S.idempotencyHeaders : undefined,consumes:opts.consumes,
      security:mutation ? [{AppClient:[],...(opts.access ? {[opts.access==='admin'?'AdminSession':'CustomerSession']:[]} : {})}] : opts.access ? [{[opts.access==='admin'?'AdminSession':'CustomerSession']:[]}] : [],
      response:{200:opts.response || T.Unknown(),'4xx':S.errorSchema,'5xx':S.errorSchema}};
    for(const key of Object.keys(schema))if(schema[key]===undefined)delete schema[key];
    app.route({method,url,config:opts.rate ? {rateLimit:{max:opts.rate,timeWindow:'1 minute'}} : {},schema,
      preValidation:opts.access ? async(req)=>{auth.need(req,opts.access!);} : undefined,handler:handler as any});
  }
  const key=(req:Request)=>req.headers['idempotency-key'] as string;
  const customer=(req:FastifyRequest)=>auth.current(req,'customer')?.id;
  const orderAccess=(req:Request)=>orders.authorized(req.params.id,customer(req),req.headers['x-order-token'] as string,Boolean(auth.current(req,'admin')));
  const account=(req:FastifyRequest)=>{const person=auth.need(req,'customer');return {customer:{id:person.id,name:person.name,email:person.email},...shopping.read(person.id),orders:orders.list(person.id)};};

  route('GET','/health/live','Operations','Process liveness',()=>({status:'ok'}));
  route('GET','/health/ready','Operations','Database readiness',()=>{db.one('SELECT 1');return {status:'ready',payments_configured:payments.available(),updates:'polling'};});
  route('GET','/api/products','Catalogue','All published products',()=>catalog.list(),{response:T.Array(ref(R.Product))});
  route('GET','/api/products/:id','Catalogue','Read a published product',req=>catalog.dto(catalog.get(req.params.id)),{response:ref(R.Product)});
  route('POST','/api/products','Catalogue','Create a product',req=>catalog.create(req.body,auth.need(req,'admin').id),{access:'admin',body:S.ProductInput,response:ref(R.Product)});
  route('PUT','/api/products/:id','Catalogue','Partially update a product using its current version',req=>catalog.update(req.params.id,req.body,auth.need(req,'admin').id),{access:'admin',body:S.ProductUpdate,response:ref(R.Product)});
  route('DELETE','/api/products/:id','Catalogue','Archive a product; retain order snapshots',req=>catalog.archive(req.params.id,auth.need(req,'admin').id),{access:'admin'});
  route('POST','/api/admin/inventory/:id/adjustments','Inventory','Atomically adjust available stock',req=>catalog.adjust(req.params.id,req.body.delta,req.body.reason,auth.need(req,'admin').id,key(req),req.body.expected_version),{access:'admin',idem:true,body:S.obj({delta:T.Integer({minimum:-1000000,maximum:1000000,not:{const:0}}),reason:S.str(500),expected_version:T.Optional(S.integer())}),response:ref(R.Product)});

  route('GET','/api/account/session','Accounts','Restore customer and saved shopping',req=>customer(req) ? account(req) : {customer:null},{response:T.Union([ref(R.Account),S.obj({customer:T.Null()})])});
  route('POST','/api/account/signup','Accounts','Create customer and session',async(req,reply)=>{const person=await auth.register(req.body.name,req.body.email,req.body.password);auth.establish(req,reply,person);return {customer:{id:person.id,name:person.name,email:person.email},...shopping.read(person.id),orders:[]};},{body:S.signup,rate:8,response:ref(R.Account)});
  route('POST','/api/account/login','Accounts','Sign in customer',async(req,reply)=>{const person=await auth.login(req.body.email,req.body.password,'customer');auth.establish(req,reply,person);return {customer:{id:person.id,name:person.name,email:person.email},...shopping.read(person.id),orders:orders.list(person.id)};},{body:S.credentials,rate:8,response:ref(R.Account)});
  route('POST','/api/account/logout','Accounts','Revoke current customer session',(req,reply)=>auth.logout(req,reply,'customer'));
  route('PUT','/api/account/shopping','Accounts','Save canonical bag and wishlist with optimistic concurrency',req=>shopping.save(auth.need(req,'customer').id,req.body.cart,req.body.wishlist,req.body.expected_version),{access:'customer',body:S.ShoppingInput,response:ref(R.Shopping)});
  route('POST','/api/account/shopping/merge','Accounts','Merge guest shopping exactly once',req=>shopping.merge(auth.need(req,'customer').id,req.body.cart,req.body.wishlist,key(req)),{access:'customer',body:S.MergeInput,idem:true,response:ref(R.Shopping)});
  route('GET','/api/account/orders','Orders','List own orders',req=>orders.list(auth.need(req,'customer').id),{access:'customer',response:T.Array(ref(R.Order))});
  route('GET','/api/account/orders/:id','Orders','Read own order',req=>orders.dto(orders.authorized(req.params.id,auth.need(req,'customer').id)),{access:'customer',response:ref(R.Order)});
  route('GET','/api/admin/session','Administration','Restore admin session',req=>({authenticated:Boolean(auth.current(req,'admin'))}));
  route('POST','/api/admin/login','Administration','Sign in administrator',async(req,reply)=>{const person=await auth.login(req.body.email,req.body.password,'admin');auth.establish(req,reply,person);return {authenticated:true};},{body:S.obj({email:T.Optional(S.email),password:S.str(128,12)}),rate:8});
  route('POST','/api/admin/logout','Administration','Revoke admin session',(req,reply)=>auth.logout(req,reply,'admin'));
  route('GET','/api/admin/customers','Administration','Search registered customers for individual email',req=>emails.customers(req.query.search || '',req.query.limit ? Number(req.query.limit) : 50,req.query.offset ? Number(req.query.offset) : 0),{access:'admin',query:S.obj({search:T.Optional(T.String({maxLength:100})),limit:T.Optional(T.String({pattern:'^(?:[1-9][0-9]?|100)$'})),offset:T.Optional(T.String({pattern:'^[0-9]{1,7}$'}))})});
  route('GET','/api/admin/emails/status','Administration','Read non-secret email provider readiness',()=>emails.status(),{access:'admin'});
  route('GET','/api/admin/emails','Administration','List recent individual email attempts',req=>({emails:emails.logs(req.query.limit ? Number(req.query.limit) : 50)}),{access:'admin',query:S.obj({limit:T.Optional(T.String({pattern:'^(?:[1-9][0-9]?|100)$'}))})});
  route('POST','/api/admin/emails/send','Administration','Send a plain-text email to one registered customer',req=>emails.send(auth.need(req,'admin').id,req.body,key(req)),{access:'admin',idem:true,body:S.obj({customer_id:S.str(100),subject:S.str(200),text:S.str(12000)}),rate:10});

  route('POST','/api/checkout/quote','Orders','Quote authoritative prices, delivery and availability',req=>{orders.expire();return orders.quote(req.body.items,req.body.delivery_province);},{body:S.QuoteInput,rate:60});
  route('POST','/api/orders','Orders','Create a retry-safe guest or signed-in order',req=>orders.create(req.body,customer(req),key(req)),{body:S.OrderInput,idem:true,response:ref(R.Order),rate:30});
  route('POST','/api/account/orders','Orders','Create an order owned by the session customer',req=>orders.create(req.body,auth.need(req,'customer').id,key(req)),{access:'customer',body:S.OrderInput,idem:true,response:ref(R.Order),rate:30});
  route('GET','/api/orders','Orders','List all store orders (admin)',()=>orders.list(),{access:'admin',response:T.Array(ref(R.Order))});
  route('GET','/api/orders/:id','Orders','Read order using owner session or X-Order-Token',req=>orders.dto(orderAccess(req)),{response:ref(R.Order)});
  route('PATCH','/api/orders/:id/status','Orders','Change fulfillment status; payment status is provider-owned',req=>orders.transition(req.params.id,req.body.status,req.body.note || '',auth.need(req,'admin').id,req.body.expected_version),{access:'admin',body:S.obj({status:S.fulfillment,note:S.optionalText(),expected_version:S.integer()}),response:ref(R.Order)});

  route('GET','/api/payments/config','Payments','Public enabled methods and configuration status',()=>{const {public_key,...safe}=payments.config();return safe;});
  route('POST','/api/orders/:id/payment-session','Payments','Start or resume hosted card / Rwanda mobile money payment',req=>{orderAccess(req);return payments.initiate(req.params.id,req.body,key(req));},{body:S.obj({method:S.choice('card','mobile_money'),payer_phone:T.Optional(S.phone)}),idem:true,response:ref(R.Payment),rate:20});
  route('GET','/api/orders/:id/payment-status','Payments','Read persisted payment truth',req=>{orderAccess(req);return payments.status(req.params.id);});
  route('POST','/api/orders/:id/reconcile-payment','Payments','Verify pending attempts directly with Flutterwave',async req=>{orderAccess(req);for(const row of db.all("SELECT id FROM payments WHERE order_id=? AND status<>'SUCCESSFUL'",req.params.id)) await payments.reconcile(row.id);return payments.status(req.params.id);},{rate:10});
  app.post('/api/payments/flutterwave/webhook',{schema:{tags:['Payments'],summary:'Authenticated Flutterwave v3 webhook; queued durably',body:T.Object({},{additionalProperties:true})}},async req=>{requireValue(verifyWebhook(cfg,req.rawBody || '',req.headers),401,'Invalid webhook authentication.','WEBHOOK_UNAUTHORIZED');return payments.enqueue(req.body);});
  route('GET','/api/admin/payments','Payments','Actual payment attempts and refund ledger',()=>({payments:db.all('SELECT * FROM payments ORDER BY created_at DESC').map(r=>payments.dto(r)),refunds:db.all('SELECT * FROM refunds ORDER BY created_at DESC')}),{access:'admin'});
  route('POST','/api/admin/payments/:id/reconcile','Payments','Reconcile one provider payment',req=>payments.reconcile(req.params.id),{access:'admin',rate:20});
  route('POST','/api/admin/payments/:id/refunds','Payments','Initiate an authorized provider refund',req=>payments.refund(req.params.id,req.body.amount,req.body.reason,auth.need(req,'admin').id,key(req)),{access:'admin',body:S.obj({amount:T.Integer({minimum:1,maximum:1e15}),reason:S.str(500)}),idem:true,rate:10});
  route('POST','/api/admin/refunds/:id/reconcile','Payments','Verify refund completion with the provider',req=>payments.reconcileRefund(req.params.id),{access:'admin',rate:20});
  route('POST','/api/admin/refunds/:id/recover','Payments','Recover an uncertain refund using a verified provider refund ID',req=>payments.recoverRefund(req.params.id,req.body.provider_refund_id,auth.need(req,'admin').id),{access:'admin',rate:10,body:S.obj({provider_refund_id:S.str(100)})});
  route('GET','/api/flutterwave/config','Administration','Read non-secret gateway configuration',()=>payments.config(),{access:'admin'});
  route('POST','/api/flutterwave/config','Administration','Save merchant display name; keys and mode are deployment configuration',req=>{const actor=auth.need(req,'admin');db.tx(()=>{db.run("INSERT INTO settings VALUES ('gateway',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",json(req.body));db.audit(actor.id,'gateway_settings','gateway',{fields:Object.keys(req.body)});});return payments.config();},{access:'admin',body:S.obj({merchant_name:S.str(180)})});

  route('GET','/api/custom-requests','Customs','Admin-only full request list',()=>customs.list(),{access:'admin',response:T.Array(ref(R.Custom))});
  route('POST','/api/custom-requests','Customs','Persist a made-to-measure request',req=>customs.create(req.body,customer(req),key(req)),{body:S.CustomInput,idem:true,response:ref(R.Tracking),rate:10});
  route('GET','/api/account/custom-requests','Customs','List own request summaries',req=>customs.list(auth.need(req,'customer').id),{access:'customer',response:T.Array(ref(R.Tracking))});
  route('POST','/api/custom-requests/track','Customs','Track one request with owner session or private token',req=>customs.track(req.body.request_number,customer(req),req.body.access_token),{body:S.obj({request_number:S.str(100),access_token:T.Optional(S.accessToken)}),response:ref(R.Tracking),rate:20});
  route('PATCH','/api/custom-requests/:id/status','Customs','Advance workflow and edit public/internal notes separately',req=>customs.update(req.params.id,req.body,auth.need(req,'admin').id),{access:'admin',body:S.obj({status:S.customStatus,expected_version:S.integer(),notes:S.optionalText(4000),internal_notes:S.optionalText(4000),estimated_price:T.Optional(S.integer())}),response:ref(R.Custom)});
  route('POST','/api/uploads','Media','Upload one validated image; product purpose requires admin',async req=>{
    const purpose=req.query.purpose;requireValue(['product','custom'].includes(purpose),400,'Choose purpose=product or custom.');
    const owner=purpose==='product' ? auth.need(req,'admin').id : customer(req);
    const file=await req.file();requireValue(file,400,'An image file is required.');
    const bytes=await file.toBuffer();requireValue(!file.file.truncated,413,'Image exceeds 5 MB.');return media.upload(bytes,purpose,owner);
  },{query:S.obj({purpose:S.choice('product','custom')}),consumes:['multipart/form-data'],rate:20,description:'Multipart field file. JPEG/PNG/WebP, max 5 MB, one image. For Swagger use the file picker. Retain upload_token until the request is submitted.'});
  route('GET','/api/media/:id','Media','Read public product image or authorized private reference',async(req,reply)=>{const file=media.get(req.params.id,customer(req),Boolean(auth.current(req,'admin')),req.headers['x-upload-token'] as string,req.headers['x-tracking-token'] as string);reply.type(file.mime).header('X-Content-Type-Options','nosniff').header('Cache-Control',file.public ? 'public, max-age=86400' : 'private, no-store');return reply.send(file.stream);});

  route('GET','/api/admin/overview','Administration','Committed counts and gross verified paid totals by environment',()=>{
    const rows=db.all('SELECT * FROM orders'),products=catalog.list();
    const gross=(environment:string)=>rows.filter(r=>r.environment===environment && ['SUCCESSFUL','REFUNDED'].includes(r.payment_status)).reduce((n,r)=>n+r.total,0);
    return {paid_gross:{test:gross('test'),live:gross('live')},order_count:rows.length,pending_confirmed_count:rows.filter(r=>['PENDING','CONFIRMED'].includes(r.status)).length,active_customs:db.one("SELECT COUNT(*) AS count FROM custom_requests WHERE status NOT IN ('COMPLETED','CANCELLED')")!.count,product_count:products.length,low_stock:products.filter(p=>p.stock<10).length,recent_orders:orders.list().slice(0,5),payments_configured:payments.available(),updates:'polling',review_required:rows.filter(r=>r.review_required).length};
  },{access:'admin'});
  route('GET','/api/events','Updates','Scoped polling events; refetch on reconnect, upsert by ID/version',req=>{
    const admin=Boolean(auth.current(req,'admin')),owner=customer(req),after=Number(req.query.after || 0);
    requireValue(Number.isSafeInteger(after) && after>=0,400,'Invalid event cursor.');
    const rows=db.all("SELECT * FROM events WHERE id>? AND (audience='public' OR ?=1 OR (customer_id IS NOT NULL AND customer_id=?)) ORDER BY id LIMIT 100",after,admin?1:0,owner || null);
    return {events:rows.map(event=>{let data:any;
      if (event.type.startsWith('product_')) {const row=catalog.get(event.entity_id,true);data=row.archived?{id:row.id,version:row.version}:catalog.dto(row);event.type=row.archived?'product_deleted':event.type;}
      else if (event.type.startsWith('order_')) data=orders.dto(orders.row(event.entity_id));
      else data=customs.dto(customs.row(event.entity_id),admin);
      return {id:event.id,type:event.type,data,version:data.version};}),cursor:rows.length ? rows[rows.length-1].id : Math.max(after,db.one('SELECT COALESCE(MAX(id),0) AS id FROM events')!.id),poll_after_ms:5000};
  },{query:S.obj({after:T.Optional(T.String({pattern:'^[0-9]+$'}))})});
  route('GET','/api/admin/audit','Administration','Recent administrative audit entries',()=>db.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200'),{access:'admin'});
  let timer:ReturnType<typeof setInterval>|undefined,busy=false;
  async function maintenance() {if(busy)return;busy=true;try {orders.expire();media.cleanup();await payments.processEvents();if(payments.available())await payments.reconcilePending();} finally{busy=false;}}
  if(cfg.jobs){timer=setInterval(()=>void maintenance().catch(()=>app.log.error('Maintenance failed; next cycle will retry.')),15000);timer.unref();}
  app.addHook('onClose',async()=>{if(timer)clearInterval(timer);while(busy)await new Promise(resolve=>setTimeout(resolve,25));if(!options.store)db.close();});
  await app.ready();
  return {app,services,maintenance};
}
