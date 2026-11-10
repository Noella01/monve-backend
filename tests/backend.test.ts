import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Auth } from '../src/auth.js';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import { token } from '../src/core.js';
import { Store } from '../src/db.js';
import { Flutterwave, type Provider, type VerifiedTransaction } from '../src/services/flutterwave.js';
import { BrevoEmailProvider, type EmailProvider } from '../src/services/emails.js';
import { seedProducts } from '../src/seed-products.js';
import type { ProductInput } from '../src/schemas.js';

class TestProvider implements Provider {
  transactions=new Map<string,VerifiedTransaction>();refunds=new Map<string,any>();calls=0;refundCalls=0;uncertain=false;refundUncertain=false;
  async initiate(input:Parameters<Provider['initiate']>[0]) {this.calls++;if(this.uncertain)throw new Error('Network timeout');this.transactions.set(input.reference,{id:String(this.calls),tx_ref:input.reference,amount:input.amount,currency:'RWF',status:'pending',account_id:'123'});return {provider_id:String(this.calls),checkout_url:'https://checkout.flutterwave.com/test'};}
  async verify(reference:string) {const tx=this.transactions.get(reference);if(!tx)throw new Error('Not found');return {...tx};}
  async refund(transactionId:string,amount:number) {this.refundCalls++;if(this.refundUncertain)throw new Error('Unknown response');const row={id:String(this.refundCalls),transaction_id:transactionId,amount,status:'completed',account_id:'123'};this.refunds.set(row.id,row);return row;}
  async getRefund(refundId:string) {return {...this.refunds.get(refundId)};}
}
class TestEmailProvider implements EmailProvider {
  messages:Parameters<EmailProvider['send']>[0][]=[];
  failure?:Error;
  async send(input:Parameters<EmailProvider['send']>[0]) { this.messages.push(input);if(this.failure)throw this.failure; }
}
test('admin CLI accepts UTF-8 BOM credential files for creation and password reset',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'aurie-admin-cli-test-'));
  t.after(()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('aurie-admin-cli-test-'));rmSync(directory,{recursive:true,force:true});});
  const databasePath=join(directory,'db.sqlite'),credentialPath=join(directory,'admin.json');
  const env={...process.env,NODE_ENV:'test',DATABASE_PATH:databasePath,UPLOAD_DIR:join(directory,'uploads'),ADMIN_CREDENTIAL_FILE:credentialPath};
  const run=(command:string)=>execFileSync(process.execPath,['--experimental-sqlite','--import','tsx',resolve('scripts/manage.ts'),command],{env,encoding:'utf8'});
  const email='admin-cli@example.test',initialPassword='Initial admin test passphrase!',resetPassword='Replacement admin test passphrase!';
  writeFileSync(credentialPath,`\uFEFF${JSON.stringify({name:'CLI Operator',email,password:initialPassword})}`,'utf8');
  assert.match(run('admin'),/Admin provisioned/);
  writeFileSync(credentialPath,`\uFEFF${JSON.stringify({email,password:resetPassword})}`,'utf8');
  assert.match(run('admin-reset'),/Admin password reset/);
  const db=new Store(databasePath);
  try {
    const principal=await new Auth(db,config(env)).login(email,resetPassword,'admin');
    assert.equal(principal.email,email);
  } finally {db.close();}
});
async function fixture(t:any,overrides:Partial<ReturnType<typeof config>>={},emailProvider?:EmailProvider) {
  const directory=mkdtempSync(join(tmpdir(),'aurie-test-')),provider=new TestProvider();
  const cfg={...config(),jobs:false,databasePath:join(directory,'db.sqlite'),uploadDir:join(directory,'uploads'),flwSecret:'FLWSECK_TEST-fixture-X',flwAccountId:'123',webhookSecret:'test-webhook-secret',webhookAuth:'legacy' as const,paymentMethods:['card','mobile_money'],...overrides};
  const runtime=await buildApp({config:cfg,provider,emailProvider});
  t.after(async()=>{await runtime.app.close();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('aurie-test-'));rmSync(directory,{recursive:true,force:true});});
  const product=runtime.services.catalog.create({...seedProducts[0],price:120000,stock:5} as ProductInput,'test');
  async function call(method:string,url:string,body?:any,cookie?:string,headers:Record<string,string>={}) {
    const response=await runtime.app.inject({method:method as any,url,payload:body,headers:{'x-aurie-client':'web',...(cookie?{cookie}:{}),...headers}});
    return {status:response.statusCode,data:response.headers['content-type']?.includes('application/json')?response.json():response.body,cookie:response.cookies.map(c=>`${c.name}=${c.value}`).join('; '),raw:response};
  }
  const signup=async(email:string)=>{const r=await call('POST','/api/account/signup',{name:'Customer',email,password:'A long test password!'});assert.equal(r.status,200,r.raw.body);return r;};
  const admin=async()=>{await runtime.services.auth.register('Operator','admin@example.test','Admin testing passphrase!','admin');const r=await call('POST','/api/admin/login',{password:'Admin testing passphrase!'});assert.equal(r.status,200,r.raw.body);return r.cookie;};
  const line={product_id:product.id,size:product.sizes[0],color:product.colors[0].name,quantity:1};
  const orderInput=async(extra:any={})=>{
    const quoted=await call('POST','/api/checkout/quote',{items:[line],delivery_province:'Kigali'});assert.equal(quoted.status,200,quoted.raw.body);
    return {customer_name:'Guest',customer_email:'guest@example.test',customer_phone:'+250788123456',delivery_province:'Kigali',delivery_district:'Gasabo',delivery_sector:'Kimironko',delivery_street:'KG 12 Street',items:[line],quote_fingerprint:quoted.data.quote_fingerprint,access_token:token(),...extra};
  };
  const order=async(cookie?:string,extra:any={})=>{const input=await orderInput(extra),key=randomUUID();const r=await call('POST','/api/orders',input,cookie,{'idempotency-key':key});assert.equal(r.status,200,r.raw.body);return {...r,input,key};};
  return {...runtime,provider,cfg,directory,product,line,call,signup,admin,orderInput,order};
}

test('admin can search registered customers and send one idempotent plain-text email',async t=>{
  const mailer=new TestEmailProvider(),f=await fixture(t,{brevoApiKey:'test-key',emailSenderEmail:'hello@example.test'},mailer);
  const admin=await f.admin();
  await f.signup('alice@example.test');
  await f.signup('bob@example.test');
  assert.equal((await f.call('GET','/api/admin/customers')).status,401);
  const listed=await f.call('GET','/api/admin/customers?search=ALICE&limit=1&offset=0',undefined,admin);
  assert.equal(listed.status,200);
  assert.equal(listed.data.total,1);
  assert.deepEqual(Object.keys(listed.data.customers[0]).sort(),['created_at','email','id','name']);
  const customer=listed.data.customers[0];
  assert.deepEqual((await f.call('GET','/api/admin/emails/status',undefined,admin)).data,{configured:true,sender_email:'hello@example.test'});

  const payload={customer_id:customer.id,subject:'Your AURIE account',text:'Thanks for signing up.'};
  const key='admin-email-attempt-0001';
  const sent=await f.call('POST','/api/admin/emails/send',payload,admin,{'idempotency-key':key});
  assert.equal(sent.status,200,sent.raw.body);
  assert.equal(sent.data.status,'SENT');
  assert.equal(sent.data.recipient_email,'alice@example.test');
  assert.ok(!('text' in sent.data));
  assert.deepEqual(mailer.messages,[{email:'alice@example.test',name:'Customer',subject:payload.subject,text:payload.text}]);
  const retry=await f.call('POST','/api/admin/emails/send',payload,admin,{'idempotency-key':key});
  assert.equal(retry.data.id,sent.data.id);
  assert.equal(mailer.messages.length,1);
  assert.equal((await f.call('POST','/api/admin/emails/send',{...payload,subject:'Changed'},admin,{'idempotency-key':key})).status,409);
  const history=await f.call('GET','/api/admin/emails?limit=10',undefined,admin);
  assert.equal(history.data.emails.length,1);
  assert.equal(history.data.emails[0].status,'SENT');
  assert.ok(!history.raw.body.includes(payload.text));
});

test('email configuration and uncertain provider outcomes are reported without blind resend',async t=>{
  const unavailableMailer=new TestEmailProvider(),unavailable=await fixture(t,{},unavailableMailer),admin=await unavailable.admin(),customer=await unavailable.signup('a@example.test');
  const record=unavailable.services.db.one("SELECT id FROM principals WHERE role='customer' AND email='a@example.test'")!;
  const unavailableResponse=await unavailable.call('POST','/api/admin/emails/send',{customer_id:record.id,subject:'Hello',text:'Message'},admin,{'idempotency-key':'admin-email-not-configured'});
  assert.equal(unavailableResponse.status,503);
  assert.equal(unavailableMailer.messages.length,0);
  assert.equal((await unavailable.call('GET','/api/admin/emails/status',undefined,admin)).data.configured,false);
  assert.ok(customer.cookie);

  const mailer=new TestEmailProvider(),f=await fixture(t,{brevoApiKey:'test-key',emailSenderEmail:'hello@example.test'},mailer),operator=await f.admin();
  await f.signup('a@example.test');
  const target=f.services.db.one("SELECT id FROM principals WHERE role='customer' AND email='a@example.test'")!;
  mailer.failure=new Error('network timeout');
  const body={customer_id:target.id,subject:'Hello',text:'Message'},key='admin-email-uncertain-01';
  const uncertain=await f.call('POST','/api/admin/emails/send',body,operator,{'idempotency-key':key});
  assert.equal(uncertain.status,502);
  assert.equal(uncertain.data.code,'EMAIL_STATUS_UNKNOWN');
  const retry=await f.call('POST','/api/admin/emails/send',body,operator,{'idempotency-key':key});
  assert.equal(retry.status,200);
  assert.equal(retry.data.status,'UNKNOWN');
  assert.equal(mailer.messages.length,1);
});

test('Brevo adapter keeps credentials server-side and sends plain text through the transactional API',async t=>{
  const cfg={...config(),brevoApiKey:'private-brevo-key',emailSenderEmail:'sender@example.test',emailSenderName:'AURIE'};
  const network=t.mock.method(globalThis,'fetch',async()=>new Response('',{status:201}));
  await new BrevoEmailProvider(cfg).send({email:'customer@example.test',name:'Customer',subject:'Hello',text:'Plain text body'});
  const [url,options]=network.mock.calls[0].arguments;
  assert.ok(options);
  assert.equal(url,'https://api.brevo.com/v3/smtp/email');
  assert.equal(new Headers(options.headers).get('api-key'),'private-brevo-key');
  assert.deepEqual(JSON.parse(String(options.body)),{
    sender:{email:'sender@example.test',name:'AURIE'},
    to:[{email:'customer@example.test',name:'Customer'}],
    subject:'Hello',
    textContent:'Plain text body',
  });
});

test('catalogue, admin authorization, SKU validation, archive and secret-free settings',async t=>{
  const f=await fixture(t);assert.equal((await f.call('GET','/api/products')).data.length,1);
  assert.equal((await f.call('POST','/api/products',seedProducts[0])).status,401);
  const admin=await f.admin();
  assert.equal((await f.call('POST','/api/products',{...seedProducts[0],id:undefined,created_at:undefined},admin)).status,409);
  const updated=await f.call('PUT',`/api/products/${f.product.id}`,{price:0,stock:0,expected_version:1},admin);assert.equal(updated.status,200);assert.equal(updated.data.stock,0);assert.equal(updated.data.price,0);
  assert.equal((await f.call('PUT',`/api/products/${f.product.id}`,{stock:3,expected_version:1},admin)).status,409);
  const settings=await f.call('GET','/api/flutterwave/config',undefined,admin);assert.ok(!('secret_key' in settings.data));assert.ok(!settings.raw.body.includes(f.cfg.flwSecret));
  assert.equal((await f.call('POST','/api/flutterwave/config',{secret_key:'forged'},admin)).status,400);
  assert.equal((await f.call('DELETE',`/api/products/${f.product.id}`,undefined,admin)).status,200);
  assert.equal((await f.call('GET','/api/products')).data.length,0);
});
test('sessions, password hashing, ownership, CSRF, CORS and logout invalidation',async t=>{
  const f=await fixture(t),a=await f.signup('a@example.test');
  assert.ok(!a.raw.body.includes('password'));assert.ok(f.services.db.one('SELECT password_hash FROM principals WHERE email=?','a@example.test')!.password_hash.startsWith('scrypt$'));
  assert.equal((await f.call('GET','/api/account/session',undefined,a.cookie)).data.customer.email,'a@example.test');
  assert.equal((await f.call('GET','/api/orders',undefined,a.cookie)).status,401);
  assert.equal((await f.call('GET','/api/custom-requests',undefined,a.cookie)).status,401);
  assert.equal((await f.app.inject({method:'POST',url:'/api/account/logout',headers:{cookie:a.cookie},payload:{}})).statusCode,403);
  assert.equal((await f.call('POST','/api/account/logout',{},a.cookie,{origin:'https://evil.example'})).status,403);
  assert.equal((await f.call('POST','/api/account/logout',{},a.cookie)).status,200);
  assert.equal((await f.call('GET','/api/account/session',undefined,a.cookie)).data.customer,null);
});
test('guest merge is retry-safe; shopping detects stale saves and checkout clears version',async t=>{
  const f=await fixture(t),a=await f.signup('a@example.test'),key=randomUUID(),payload={cart:[f.line],wishlist:[f.product.id]};
  const first=await f.call('POST','/api/account/shopping/merge',payload,a.cookie,{'idempotency-key':key});assert.equal(first.status,200,first.raw.body);
  const second=await f.call('POST','/api/account/shopping/merge',payload,a.cookie,{'idempotency-key':key});assert.equal(second.data.cart[0].quantity,1);assert.equal(second.data.shopping_version,first.data.shopping_version);
  assert.equal((await f.call('PUT','/api/account/shopping',{...payload,expected_version:0},a.cookie)).status,409);
  const order=await f.order(a.cookie,{shopping_version:first.data.shopping_version});
  assert.equal(order.data.payment_status,'PENDING');
  assert.equal((await f.call('PUT','/api/account/shopping',{...payload,expected_version:first.data.shopping_version},a.cookie)).status,409);
  assert.equal((await f.call('GET','/api/account/session',undefined,a.cookie)).data.cart.length,0);
  const b=await f.signup('b@example.test');assert.equal((await f.call('GET',`/api/orders/${order.data.id}`,undefined,b.cookie,{'x-order-token':order.input.access_token})).status,404);
});
test('authoritative quote threshold, forged fields, immutable snapshots and idempotency conflicts',async t=>{
  const f=await fixture(t),input=await f.orderInput(),key=randomUUID();
  const quote=await f.call('POST','/api/checkout/quote',{items:[f.line],delivery_province:'Kigali'});assert.equal(quote.data.delivery_fee,2500);
  const above=await f.call('POST','/api/checkout/quote',{items:[{...f.line,quantity:2}],delivery_province:'Kigali'});assert.equal(above.data.delivery_fee,0);
  for(const forged of [{payment_status:'SUCCESSFUL'},{status:'CONFIRMED'},{total:1},{flutterwave_tx_id:'fake'}])assert.equal((await f.call('POST','/api/orders',{...input,...forged},undefined,{'idempotency-key':key})).status,400);
  const created=await f.call('POST','/api/orders',input,undefined,{'idempotency-key':key});assert.equal(created.status,200,created.raw.body);assert.equal(created.data.total,122500);
  const repeated=await f.call('POST','/api/orders',input,undefined,{'idempotency-key':key});assert.equal(repeated.data.id,created.data.id);assert.equal(f.services.catalog.dto(f.services.catalog.get(f.product.id)).stock,4);
  assert.equal((await f.call('POST','/api/orders',{...input,delivery_street:'Different street'},undefined,{'idempotency-key':key})).status,409);
  const row=f.services.catalog.get(f.product.id);f.services.catalog.update(f.product.id,{price:999,name:'New name',expected_version:row.version},'test');
  const saved=await f.call('GET',`/api/orders/${created.data.id}`,undefined,undefined,{'x-order-token':input.access_token});assert.equal(saved.data.items[0].price,120000);assert.equal(saved.data.items[0].product_name,f.product.name);
  assert.equal((await f.call('GET',`/api/orders/${created.data.id}`)).status,404);
});
test('concurrent buyers cannot reserve the last unit; stock adjustments do not overwrite reservations',async t=>{
  const f=await fixture(t);f.services.catalog.update(f.product.id,{stock:1,expected_version:1},'test');
  const inputs=await Promise.all([f.orderInput(),f.orderInput()]);
  const results=await Promise.all(inputs.map(input=>f.call('POST','/api/orders',input,undefined,{'idempotency-key':randomUUID()})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const admin=await f.admin(),key=randomUUID();
  assert.equal((await f.call('POST',`/api/admin/inventory/${f.product.id}/adjustments`,{delta:-1,reason:'Count correction'},admin,{'idempotency-key':key})).status,409);
  const input={delta:5,reason:'Restock'},first=await f.call('POST',`/api/admin/inventory/${f.product.id}/adjustments`,input,admin,{'idempotency-key':key});assert.equal(first.data.stock,5);
  const retry=await f.call('POST',`/api/admin/inventory/${f.product.id}/adjustments`,input,admin,{'idempotency-key':key});assert.equal(retry.data.stock,5);
});
test('verified payment, duplicate and forged webhooks, transitions, stock committed exactly once',async t=>{
  const f=await fixture(t),order=await f.order(),headers={'x-order-token':order.input.access_token,'idempotency-key':randomUUID()};
  const session=await f.call('POST',`/api/orders/${order.data.id}/payment-session`,{method:'card'},undefined,headers);assert.equal(session.status,200,session.raw.body);
  await f.call('POST',`/api/orders/${order.data.id}/payment-session`,{method:'card'},undefined,headers);assert.equal(f.provider.calls,1);
  const tx=f.provider.transactions.get(session.data.reference)!;tx.status='successful';
  const payload={event:'charge.completed',data:{id:tx.id,tx_ref:tx.tx_ref,status:'successful'}};
  assert.equal((await f.call('POST','/api/payments/flutterwave/webhook',payload)).status,401);
  for(let i=0;i<2;i++)assert.equal((await f.call('POST','/api/payments/flutterwave/webhook',payload,undefined,{'verif-hash':f.cfg.webhookSecret})).status,200);
  await f.services.payments.processEvents();await f.services.payments.processEvents();
  const paid=f.services.orders.row(order.data.id);assert.equal(paid.payment_status,'SUCCESSFUL');assert.equal(paid.status,'CONFIRMED');
  assert.equal(f.services.catalog.get(f.product.id).stock,4);assert.equal(f.services.catalog.get(f.product.id).reserved,0);
  assert.equal(f.services.db.one('SELECT COUNT(*) AS n FROM stock_movements')!.n,1);
  const admin=await f.admin();assert.equal((await f.call('PATCH',`/api/orders/${paid.id}/status`,{status:'DELIVERED',expected_version:paid.version},admin)).status,409);
  assert.equal((await f.call('PATCH',`/api/orders/${paid.id}/status`,{status:'PROCESSING',expected_version:paid.version},admin)).status,200);
});
test('mismatched provider verification never marks paid; authentic failure releases and retry reserves',async t=>{
  const f=await fixture(t),order=await f.order();
  const session=await f.services.payments.initiate(order.data.id,{method:'mobile_money',payer_phone:'+250788123456'},randomUUID());
  const tx=f.provider.transactions.get(session.reference)!;tx.status='successful';tx.amount=1;
  await assert.rejects(()=>f.services.payments.reconcile(session.id),/do not match/);assert.equal(f.services.orders.row(order.data.id).payment_status,'PENDING');
  tx.amount=order.data.total;tx.account_id='wrong';await assert.rejects(()=>f.services.payments.reconcile(session.id),/do not match/);
  tx.account_id='123';tx.currency='USD';await assert.rejects(()=>f.services.payments.reconcile(session.id),/do not match/);
  tx.currency='RWF';tx.status='failed';await f.services.payments.reconcile(session.id);assert.equal(f.services.catalog.get(f.product.id).reserved,0);
  await f.services.payments.initiate(order.data.id,{method:'card'},randomUUID());assert.equal(f.services.catalog.get(f.product.id).reserved,1);
});
test('expiry releases stock once; late payment reacquires or blocks dispatch for review',async t=>{
  const f=await fixture(t),order=await f.order(),session=await f.services.payments.initiate(order.data.id,{method:'card'},randomUUID());
  f.services.db.run('UPDATE orders SET expires_at=? WHERE id=?','2000-01-01T00:00:00.000Z',order.data.id);f.services.orders.expire();f.services.orders.expire();assert.equal(f.services.catalog.get(f.product.id).reserved,0);
  const product=f.services.catalog.get(f.product.id);f.services.catalog.update(product.id,{stock:0,expected_version:product.version},'test');
  f.provider.transactions.get(session.reference)!.status='successful';await f.services.payments.reconcile(session.id);
  const late=f.services.orders.row(order.data.id);assert.equal(late.payment_status,'SUCCESSFUL');assert.equal(late.review_required,1);assert.equal(late.status,'PENDING');assert.equal(f.services.catalog.get(product.id).stock,0);
});
test('refund initiation is idempotent; completed is pending until verified final refund; cancellation restocks once',async t=>{
  const f=await fixture(t),order=await f.order(),session=await f.services.payments.initiate(order.data.id,{method:'card'},randomUUID());
  f.provider.transactions.get(session.reference)!.status='successful';await f.services.payments.reconcile(session.id);
  const paid=f.services.orders.row(order.data.id);f.services.orders.transition(paid.id,'CANCELLED','Cancelled before dispatch','test',paid.version);assert.equal(f.services.catalog.get(f.product.id).stock,5);
  const key=randomUUID(),refund=await f.services.payments.refund(session.id,order.data.total,'Customer cancellation','test',key);assert.equal(refund.status,'PENDING');assert.equal(f.services.orders.row(order.data.id).payment_status,'SUCCESSFUL');
  await f.services.payments.refund(session.id,order.data.total,'Customer cancellation','test',key);assert.equal(f.provider.refundCalls,1);
  f.provider.refunds.get(refund.provider_id).status='completed-mpgs';await f.services.payments.reconcileRefund(refund.id);assert.equal(f.services.orders.row(order.data.id).payment_status,'REFUNDED');
  await f.services.payments.reconcileRefund(refund.id);assert.equal(f.services.catalog.get(f.product.id).stock,5);
});
test('uncertain payment and refund responses are persisted and never blindly resubmitted',async t=>{
  const f=await fixture(t),order=await f.order();f.provider.uncertain=true;
  const first=await f.services.payments.initiate(order.data.id,{method:'card'},randomUUID());assert.equal(first.status,'UNKNOWN');
  await f.services.payments.initiate(order.data.id,{method:'card'},randomUUID());assert.equal(f.provider.calls,1);
  assert.equal(f.services.orders.row(order.data.id).payment_status,'PENDING');
});
test('Customs persistence, private tracking/media, status history and scoped events',async t=>{
  const f=await fixture(t),owner=await f.signup('owner@example.test'),other=await f.signup('other@example.test');
  const image=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();
  const uploaded=await f.services.media.upload(image,'custom',owner.data.customer.id);
  const body={full_name:'Tailor Client',phone:'+250788123456',email:'owner@example.test',clothing_type:'Experimental free-form garment',preferred_color:'Gold',description:'Made to measure with personal detail',preferred_deadline:'2099-01-01',media_id:uploaded.media_id};
  const key=randomUUID(),created=await f.call('POST','/api/custom-requests',body,owner.cookie,{'idempotency-key':key});assert.equal(created.status,200,created.raw.body);
  assert.equal((await f.call('POST','/api/custom-requests',body,owner.cookie,{'idempotency-key':key})).data.id,created.data.id);
  assert.equal((await f.call('POST','/api/custom-requests/track',{request_number:created.data.request_number},other.cookie)).status,404);
  assert.equal((await f.call('GET',`/api/media/${uploaded.media_id}`,undefined,other.cookie)).status,404);
  assert.equal((await f.call('GET',`/api/media/${uploaded.media_id}`,undefined,owner.cookie)).status,200);
  const admin=await f.admin();const changed=await f.call('PATCH',`/api/custom-requests/${created.data.id}/status`,{status:'CONTACTED',expected_version:1,notes:'We will discuss the fit.',internal_notes:'Internal workshop note'},admin);assert.equal(changed.status,200,changed.raw.body);
  const tracked=await f.call('POST','/api/custom-requests/track',{request_number:created.data.request_number},owner.cookie);assert.equal(tracked.data.status,'CONTACTED');assert.ok(!tracked.raw.body.includes('Internal workshop note'));assert.ok(!tracked.raw.body.includes('email'));
  assert.ok((await f.call('GET','/api/events',undefined,owner.cookie)).data.events.some((e:any)=>e.type.startsWith('custom_')));
  assert.ok(!(await f.call('GET','/api/events',undefined,other.cookie)).data.events.some((e:any)=>e.type.startsWith('custom_')));
  assert.ok(!(await f.call('GET','/api/events')).data.events.some((e:any)=>e.type.startsWith('custom_')));
  await f.call('POST','/api/account/logout',{},owner.cookie);assert.ok(!(await f.call('GET','/api/events',undefined,owner.cookie)).data.events.some((e:any)=>e.type.startsWith('custom_')));
  await assert.rejects(()=>f.services.media.upload(Buffer.from('<svg></svg>'),'custom'),/invalid|JPEG/);
});
test('database survives service restart; Swagger and readiness are usable',async t=>{
  const f=await fixture(t),order=await f.order();
  const second=await buildApp({config:f.cfg,provider:f.provider});
  const response=await second.app.inject({url:`/api/orders/${order.data.id}`,headers:{'x-order-token':order.input.access_token}});assert.equal(response.statusCode,200);assert.equal(response.json().id,order.data.id);
  const docs=await f.app.inject('/docs/');assert.equal(docs.statusCode,200);
  assert.ok(!String(docs.headers['content-security-policy']).includes('upgrade-insecure-requests'));
  assert.equal(docs.headers['strict-transport-security'],undefined);
  assert.equal((await f.app.inject('/health/ready')).statusCode,200);
  const schema=await f.app.inject('/docs/json');assert.equal(schema.statusCode,200);assert.ok(schema.json().paths['/api/orders']);
  await second.app.close();
});
test('production Flutterwave adapter uses RWF, actual payer number, verification endpoint and server secret only',async()=>{
  const requests:{url:string;init:any}[]=[];
  const cfg={...config(),flwSecret:'FLWSECK_TEST-fixture-X',flwAccountId:'123',webhookSecret:'secret'};
  const transport=(async(url:any,init:any)=>{requests.push({url:String(url),init});return new Response(JSON.stringify({status:'success',data:String(url).includes('verify') ? {id:1,tx_ref:'reference',amount:100,currency:'RWF',status:'successful',account_id:123} : {id:1,link:'https://checkout.flutterwave.com/test'}}),{headers:{'content-type':'application/json'}});}) as typeof fetch;
  const adapter=new Flutterwave(cfg,transport);await adapter.initiate({reference:'reference',orderId:'order',amount:100,email:'payer@example.test',name:'Payer',phone:'+250788123456',method:'mobile_money',expires:'2099-01-01T00:00:00.000Z'});
  assert.ok(requests[0].url.endsWith('/charges?type=mobile_money_rwanda'));assert.equal(JSON.parse(requests[0].init.body).phone_number,'+250788123456');assert.equal(JSON.parse(requests[0].init.body).currency,'RWF');
  const verified=await adapter.verify('reference');assert.equal(verified.account_id,'123');assert.ok(requests[1].url.includes('verify_by_reference'));
});
test('HMAC webhook scheme rejects altered raw bytes and does not downgrade to legacy',async t=>{
  const f=await fixture(t,{webhookAuth:'hmac'}),body=JSON.stringify({event:'ignored',data:{id:1}}),signature=createHmac('sha256',f.cfg.webhookSecret).update(body).digest('base64');
  assert.equal((await f.app.inject({method:'POST',url:'/api/payments/flutterwave/webhook',headers:{'content-type':'application/json','flutterwave-signature':signature},payload:body})).statusCode,200);
  assert.equal((await f.app.inject({method:'POST',url:'/api/payments/flutterwave/webhook',headers:{'content-type':'application/json','flutterwave-signature':signature,'verif-hash':f.cfg.webhookSecret},payload:body+' '})).statusCode,401);
});
test('missing credentials cannot create a provider attempt or a paid order',async t=>{
  const f=await fixture(t,{flwSecret:'',flwAccountId:'',webhookSecret:''}),order=await f.order();
  const result=await f.call('POST',`/api/orders/${order.data.id}/payment-session`,{method:'card'},undefined,{'x-order-token':order.input.access_token,'idempotency-key':randomUUID()});
  assert.equal(result.status,503);assert.equal(f.provider.calls,0);assert.equal(f.services.orders.row(order.data.id).payment_status,'PENDING');
  assert.deepEqual((await f.call('GET','/api/payments/config')).data.enabled_methods,[]);
});
test('guest Customs token controls tracking and bound image; status cancellation and invalid dates',async t=>{
  const f=await fixture(t),access=token(),image=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer(),media=await f.services.media.upload(image,'custom');
  const body={full_name:'Guest Designer',phone:'+250788123456',email:'guest@example.test',clothing_type:'A free-form style',preferred_color:'Blue',description:'A custom garment idea.',preferred_deadline:'2099-01-01',media_id:media.media_id,upload_token:media.upload_token,access_token:access};
  assert.equal((await f.call('POST','/api/custom-requests',{...body,preferred_deadline:'2027-02-30'},undefined,{'idempotency-key':randomUUID()})).status,400);
  const created=await f.call('POST','/api/custom-requests',body,undefined,{'idempotency-key':randomUUID()});assert.equal(created.status,200,created.raw.body);
  assert.equal((await f.call('POST','/api/custom-requests/track',{request_number:created.data.request_number,access_token:token()})).status,404);
  assert.equal((await f.call('POST','/api/custom-requests/track',{request_number:created.data.request_number,access_token:access})).status,200);
  assert.equal((await f.call('GET',`/api/media/${media.media_id}`,undefined,undefined,{'x-upload-token':media.upload_token})).status,404);
  assert.equal((await f.call('GET',`/api/media/${media.media_id}`,undefined,undefined,{'x-tracking-token':access})).status,200);
  const admin=await f.admin();assert.equal((await f.call('PATCH',`/api/custom-requests/${created.data.id}/status`,{status:'READY',expected_version:1},admin)).status,409);
  const cancelled=await f.call('PATCH',`/api/custom-requests/${created.data.id}/status`,{status:'CANCELLED',expected_version:1,notes:'Cancelled by agreement'},admin);assert.equal(cancelled.data.status,'CANCELLED');
});
test('HTTP multipart enforces actual image content, permissions, size and private delivery',async t=>{
  const f=await fixture(t),boundary='aurie-test-boundary';
  const upload=async(bytes:Buffer,purpose:string)=>f.app.inject({method:'POST',url:`/api/uploads?purpose=${purpose}`,headers:{'x-aurie-client':'web','content-type':`multipart/form-data; boundary=${boundary}`},payload:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)])});
  assert.equal((await upload(Buffer.from('not an image'),'custom')).statusCode,400);
  assert.equal((await upload(Buffer.from('not an image'),'product')).statusCode,401);
  assert.equal((await upload(Buffer.alloc(5*1024*1024+1),'custom')).statusCode,413);
  const image=await sharp({create:{width:2,height:2,channels:3,background:'blue'}}).png().toBuffer(),response=await upload(image,'custom');assert.equal(response.statusCode,200,response.body);
  const saved=response.json();assert.equal((await f.call('GET',`/api/media/${saved.media_id}`)).status,404);assert.equal((await f.call('GET',`/api/media/${saved.media_id}`,undefined,undefined,{'x-upload-token':saved.upload_token})).status,200);
});
test('late successful payment with available stock commits once; duplicate paid attempt is held for review',async t=>{
  const f=await fixture(t),order=await f.order(),first=await f.services.payments.initiate(order.data.id,{method:'card'},randomUUID());
  f.provider.transactions.get(first.reference)!.status='failed';await f.services.payments.reconcile(first.id);
  const second=await f.services.payments.initiate(order.data.id,{method:'card'},randomUUID());
  f.services.db.run('UPDATE orders SET expires_at=? WHERE id=?','2000-01-01T00:00:00.000Z',order.data.id);f.services.orders.expire();
  f.provider.transactions.get(first.reference)!.status='successful';await f.services.payments.reconcile(first.id);assert.equal(f.services.catalog.get(f.product.id).stock,4);
  f.provider.transactions.get(second.reference)!.status='successful';await f.services.payments.reconcile(second.id);assert.equal(f.services.catalog.get(f.product.id).stock,4);assert.equal(f.services.orders.row(order.data.id).review_required,1);
});
test('uncertain refund can be recovered only after provider identity/amount verification',async t=>{
  const f=await fixture(t),order=await f.order(),payment=await f.services.payments.initiate(order.data.id,{method:'card'},randomUUID());f.provider.transactions.get(payment.reference)!.status='successful';await f.services.payments.reconcile(payment.id);
  f.provider.refundUncertain=true;const key=randomUUID(),refund=await f.services.payments.refund(payment.id,order.data.total,'Return','test',key);assert.equal(refund.status,'UNKNOWN');
  await f.services.payments.refund(payment.id,order.data.total,'Return','test',key);assert.equal(f.provider.refundCalls,1);
  f.provider.refunds.set('recovered',{id:'recovered',transaction_id:'wrong',amount:order.data.total,status:'completed-mpgs',account_id:'123'});
  await assert.rejects(()=>f.services.payments.recoverRefund(refund.id,'recovered','test'),/does not match/);
  f.provider.refunds.get('recovered').transaction_id=f.provider.transactions.get(payment.reference)!.id;
  const recovered=await f.services.payments.recoverRefund(refund.id,'recovered','test');assert.equal(recovered.status,'SUCCESSFUL');assert.equal(f.services.orders.row(order.data.id).payment_status,'REFUNDED');
});
test('separate service connections enforce last-unit stock; backed-up database passes integrity check',async t=>{
  const f=await fixture(t);f.services.catalog.update(f.product.id,{stock:1,expected_version:1},'test');
  const other=await buildApp({config:f.cfg,provider:f.provider});
  try {
    const [one,two]=await Promise.all([f.orderInput(),f.orderInput()]);
    const results=await Promise.all([f.app.inject({method:'POST',url:'/api/orders',headers:{'x-aurie-client':'web','idempotency-key':randomUUID()},payload:one}),other.app.inject({method:'POST',url:'/api/orders',headers:{'x-aurie-client':'web','idempotency-key':randomUUID()},payload:two})]);
    assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
    const backup=join(f.directory,'backup.sqlite');f.services.db.run('VACUUM INTO ?',backup);
    const restored=new (await import('../src/db.js')).Store(backup);assert.equal(restored.one('PRAGMA integrity_check')!.integrity_check,'ok');assert.equal(restored.one('SELECT COUNT(*) AS n FROM orders')!.n,1);restored.close();
  }finally{await other.app.close();}
});
