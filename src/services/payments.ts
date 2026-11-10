import type { Store, Row } from '../db.js';
import type { Orders } from './orders.js';
import type { Config } from '../config.js';
import type { Provider } from './flutterwave.js';
import { hash, id, now, requireValue } from '../core.js';

const finalRefundStatuses = new Set(['completed-bank-transfer','completed-momo','completed-mpgs','completed-preauth']);
export class Payments {
  constructor(public db: Store, private orders: Orders, private cfg: Config, private provider: Provider) {}
  available() { return Boolean(this.cfg.flwSecret && this.cfg.flwAccountId && this.cfg.webhookSecret); }
  config() {
    const saved = this.db.one("SELECT value FROM settings WHERE key='gateway'");
    return { public_key:this.cfg.flwPublic,is_test_mode:this.cfg.paymentEnvironment==='test',merchant_name:saved ? JSON.parse(saved.value).merchant_name : 'AURIE',currency:'RWF',configured:this.available(),enabled_methods:this.available() ? this.cfg.paymentMethods : [],environment:this.cfg.paymentEnvironment };
  }
  dto(row: Row) { return { id:row.id,order_id:row.order_id,reference:row.reference,provider_id:row.provider_id,method:row.method,environment:row.environment,amount:row.amount,currency:row.currency,status:row.status,checkout_url:row.checkout_url,verified_at:row.verified_at,failure_code:row.failure_code,created_at:row.created_at,updated_at:row.updated_at }; }
  status(orderId: string) { return { order:this.orders.dto(this.orders.row(orderId)), attempts:this.db.all('SELECT * FROM payments WHERE order_id=? ORDER BY created_at DESC',orderId).map(r=>this.dto(r)) }; }
  async initiate(orderId: string, input: { method:string; payer_phone?:string }, key: string) {
    requireValue(this.available(),503,'Payments are not configured. Your saved order remains unpaid.','PAYMENTS_UNAVAILABLE');
    requireValue(this.cfg.paymentMethods.includes(input.method),422,'This payment method is not enabled for this merchant.');
    if (input.method==='mobile_money') requireValue(input.payer_phone && /^\+?2507\d{8}$/.test(input.payer_phone.replaceAll(' ','')),400,'Enter the payer’s Rwanda mobile number.');
    this.orders.expire();
    const prepared = this.db.tx(() => {
      const scope=`payment:${orderId}`, previous=this.db.prior(scope,key,input);
      if (previous) return { row:this.db.one('SELECT * FROM payments WHERE id=?',previous)!,fresh:false };
      const order=this.orders.row(orderId);
      requireValue(order.environment===this.cfg.paymentEnvironment,409,'This order belongs to another payment environment.');
      requireValue(order.total>0,422,'A zero-value order requires merchant review.');
      const active=this.db.one("SELECT * FROM payments WHERE order_id=? AND status IN ('INITIATING','PENDING','UNKNOWN')",orderId);
      if (active) {
        requireValue(active.method===input.method,409,'A payment is already pending. Reconcile it before choosing another method.','PAYMENT_PENDING');
        this.db.remember(scope,key,input,active.id);
        return {row:active,fresh:false};
      }
      this.orders.resumeReservation(order);
      const paymentId=id(),reference=`aurie-${this.cfg.paymentEnvironment}-${paymentId}`,timestamp=now();
      this.db.run("INSERT INTO payments(id,order_id,reference,method,environment,amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'INITIATING',?,?)",paymentId,orderId,reference,input.method,this.cfg.paymentEnvironment,order.total,timestamp,timestamp);
      this.db.remember(scope,key,input,paymentId);
      return {row:this.db.one('SELECT * FROM payments WHERE id=?',paymentId)!,fresh:true};
    });
    if (!prepared.fresh) return this.dto(prepared.row);
    const row=prepared.row,order=this.orders.row(orderId),address=JSON.parse(order.data);
    try {
      const result=await this.provider.initiate({ reference:row.reference,orderId,amount:row.amount,email:address.customer_email,name:address.customer_name,phone:input.payer_phone || address.customer_phone,method:input.method,expires:order.expires_at });
      // A webhook may already have completed this attempt while the request awaited.
      this.db.run("UPDATE payments SET status=CASE WHEN status='INITIATING' THEN 'PENDING' ELSE status END,checkout_url=?,provider_id=COALESCE(provider_id,?),updated_at=? WHERE id=?",result.checkout_url || null,result.provider_id || null,now(),row.id);
    } catch {
      this.db.run("UPDATE payments SET status='UNKNOWN',failure_code='PROVIDER_UNCERTAIN',updated_at=? WHERE id=? AND status='INITIATING'",now(),row.id);
    }
    return this.dto(this.db.one('SELECT * FROM payments WHERE id=?',row.id)!);
  }
  async reconcile(paymentId: string, transactionId?: string) {
    const initial=this.db.one('SELECT * FROM payments WHERE id=?',paymentId);
    requireValue(initial,404,'Payment not found.');
    if (initial.status==='SUCCESSFUL') return this.dto(initial);
    requireValue(initial.environment===this.cfg.paymentEnvironment,409,'Use the configured environment for this payment.');
    this.db.run('UPDATE payments SET checked_at=? WHERE id=?',now(),paymentId);
    const verified=await this.provider.verify(initial.reference,transactionId || initial.provider_id || undefined);
    requireValue(verified.tx_ref===initial.reference && verified.amount===initial.amount && verified.currency==='RWF' && verified.account_id===this.cfg.flwAccountId && (!initial.provider_id || verified.id===initial.provider_id) && (!transactionId || verified.id===transactionId),409,'Provider details do not match this order. Payment remains unverified.','PAYMENT_MISMATCH');
    return this.db.tx(() => {
      const payment=this.db.one('SELECT * FROM payments WHERE id=?',paymentId)!;
      if (payment.status==='SUCCESSFUL') return this.dto(payment);
      const order=this.orders.row(payment.order_id);
      if (verified.status==='successful') {
        const alreadyPaid=order.payment_status==='SUCCESSFUL' || order.payment_status==='REFUNDED';
        const committed=!alreadyPaid && this.orders.commitPaid(order);
        this.db.run("UPDATE payments SET status='SUCCESSFUL',provider_id=?,verified_at=?,failure_code=NULL,updated_at=? WHERE id=?",verified.id,now(),now(),paymentId);
        const status=committed && order.status==='PENDING' ? 'CONFIRMED' : order.status;
        this.db.run("UPDATE orders SET payment_status='SUCCESSFUL',status=?,review_required=?,payment_method=?,transaction_reference=? WHERE id=?",status,committed ? 0 : 1,payment.method==='card' ? 'flutterwave_card' : 'flutterwave_momo',payment.reference,order.id);
        this.orders.timeline(order.id,status,committed ? 'Payment verified' : 'Payment needs review',committed ? 'Flutterwave confirmed the payment. Your order is confirmed.' : 'Payment arrived after stock release, cancellation, or another payment. The merchant must review a refund; dispatch is blocked.');
        this.db.audit(null,'provider_payment_verified',paymentId,{provider_id:verified.id,review_required:!committed});
        this.orders.changed(order.id);
      } else if (['failed','cancelled'].includes(verified.status)) {
        this.db.run("UPDATE payments SET status='FAILED',provider_id=?,failure_code='PROVIDER_FAILED',updated_at=? WHERE id=?",verified.id,now(),paymentId);
        if (!['SUCCESSFUL','REFUNDED'].includes(order.payment_status)) {
          this.orders.release(order);
          this.db.run("UPDATE orders SET payment_status='FAILED' WHERE id=?",order.id);
          this.orders.timeline(order.id,order.status,'Payment unsuccessful','Payment was not completed. You may retry after reviewing stock.');
          this.orders.changed(order.id);
        }
      } else this.db.run("UPDATE payments SET status='PENDING',provider_id=?,updated_at=? WHERE id=?",verified.id,now(),paymentId);
      return this.dto(this.db.one('SELECT * FROM payments WHERE id=?',paymentId)!);
    });
  }
  enqueue(payload: any) {
    const reference=payload.data?.tx_ref;
    const transactionId=payload.data?.id;
    if (payload.event!=='charge.completed' || typeof reference!=='string' || !['number','string'].includes(typeof transactionId)) return {accepted:true};
    const payment=this.db.one('SELECT id FROM payments WHERE reference=?',reference);
    if (!payment) return {accepted:true};
    const eventId=hash(`${payload.event}:${reference}:${transactionId}:${payload.data.status}`);
    this.db.run('INSERT OR IGNORE INTO provider_events(id,reference,transaction_id,kind,created_at) VALUES (?,?,?,?,?)',eventId,reference,String(transactionId),'charge.completed',now());
    return {accepted:true};
  }
  async processEvents() {
    for (const event of this.db.all("SELECT * FROM provider_events WHERE state='PENDING' AND attempts<100 ORDER BY created_at LIMIT 25")) {
      const payment=this.db.one('SELECT id FROM payments WHERE reference=?',event.reference);
      if (!payment) continue;
      try {
        await this.reconcile(payment.id,event.transaction_id);
        this.db.run("UPDATE provider_events SET state='PROCESSED' WHERE id=?",event.id);
      } catch { this.db.run('UPDATE provider_events SET attempts=attempts+1 WHERE id=?',event.id); }
    }
  }
  async refund(paymentId: string, amount: number, reason: string, actor: string, key: string) {
    const prepared=this.db.tx(() => {
      const scope=`refund:${paymentId}`,body={amount,reason},previous=this.db.prior(scope,key,body);
      if (previous) return {row:this.db.one('SELECT * FROM refunds WHERE id=?',previous)!,fresh:false};
      const payment=this.db.one('SELECT * FROM payments WHERE id=?',paymentId);
      requireValue(payment?.status==='SUCCESSFUL' && payment.verified_at && payment.environment===this.cfg.paymentEnvironment,409,'A verified payment in the configured environment is required.');
      const allocated=this.db.one("SELECT COALESCE(SUM(amount),0) AS amount FROM refunds WHERE payment_id=? AND status<>'FAILED'",paymentId)!.amount;
      requireValue(amount>0 && amount+allocated<=payment.amount,409,'Refund exceeds the remaining refundable amount.');
      const refundId=id();
      this.db.run("INSERT INTO refunds(id,payment_id,amount,reason,status,actor_id,created_at,updated_at) VALUES (?,?,?,?,'INITIATING',?,?,?)",refundId,paymentId,amount,reason,actor,now(),now());
      this.db.remember(scope,key,body,refundId);this.db.audit(actor,'refund_requested',refundId,{amount,reason});
      return {row:this.db.one('SELECT * FROM refunds WHERE id=?',refundId)!,fresh:true};
    });
    if (!prepared.fresh) return prepared.row;
    const payment=this.db.one('SELECT * FROM payments WHERE id=?',paymentId)!;
    try {
      const response=await this.provider.refund(payment.provider_id,amount,reason);
      this.db.run("UPDATE refunds SET provider_id=?,provider_status=?,status='PENDING',updated_at=? WHERE id=?",response.id,response.status,now(),prepared.row.id);
      await this.reconcileRefund(prepared.row.id);
    } catch {
      // A lost response is ambiguous. Never automatically submit another refund.
      this.db.run("UPDATE refunds SET status='UNKNOWN',updated_at=? WHERE id=? AND provider_id IS NULL",now(),prepared.row.id);
    }
    return this.db.one('SELECT * FROM refunds WHERE id=?',prepared.row.id)!;
  }
  async reconcileRefund(refundId: string) {
    const refund=this.db.one('SELECT * FROM refunds WHERE id=?',refundId);
    requireValue(refund?.provider_id,409,'Provider refund ID is not available. Review the provider dashboard before retrying.');
    const payment=this.db.one('SELECT * FROM payments WHERE id=?',refund.payment_id)!;
    requireValue(payment.environment===this.cfg.paymentEnvironment,409,'Refund environment mismatch.');
    const result=await this.provider.getRefund(refund.provider_id);
    requireValue(result.id===refund.provider_id && result.transaction_id===payment.provider_id && result.amount===refund.amount && result.account_id===this.cfg.flwAccountId,409,'Provider refund details do not match.');
    return this.db.tx(() => {
      const current=this.db.one('SELECT * FROM refunds WHERE id=?',refundId)!;
      if (current.status==='SUCCESSFUL') return current;
      const status=finalRefundStatuses.has(result.status) ? 'SUCCESSFUL' : result.status==='failed' ? 'FAILED' : 'PENDING';
      this.db.run('UPDATE refunds SET status=?,provider_status=?,updated_at=? WHERE id=?',status,result.status,now(),refundId);
      const refunded=this.db.one("SELECT COALESCE(SUM(amount),0) AS amount FROM refunds WHERE payment_id=? AND status='SUCCESSFUL'",payment.id)!.amount;
      if (refunded===payment.amount) {
        const order=this.orders.row(payment.order_id);
        // Do not let refunding a duplicate attempt hide another unrefunded payment.
        const paid=this.db.one("SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE order_id=? AND status='SUCCESSFUL'",order.id)!.amount;
        const allRefunded=this.db.one("SELECT COALESCE(SUM(r.amount),0) AS amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=? AND r.status='SUCCESSFUL'",order.id)!.amount;
        if (paid===allRefunded && order.payment_status!=='REFUNDED') {
          this.db.run("UPDATE orders SET payment_status='REFUNDED' WHERE id=?",order.id);
          this.orders.timeline(order.id,order.status,'Refund completed','The payment provider confirmed the refund.');
          this.orders.changed(order.id);
        }
      }
      return this.db.one('SELECT * FROM refunds WHERE id=?',refundId)!;
    });
  }
  async recoverRefund(refundId:string,providerId:string,actor:string){
    const refund=this.db.one('SELECT * FROM refunds WHERE id=?',refundId);
    requireValue(refund && ['INITIATING','UNKNOWN'].includes(refund.status) && !refund.provider_id,409,'Only an uncertain refund without a provider ID can be recovered.');
    const payment=this.db.one('SELECT * FROM payments WHERE id=?',refund.payment_id)!;
    requireValue(payment.environment===this.cfg.paymentEnvironment,409,'Refund environment mismatch.');
    const result=await this.provider.getRefund(providerId);
    requireValue(result.id===providerId && result.transaction_id===payment.provider_id && result.amount===refund.amount && result.account_id===this.cfg.flwAccountId,409,'Provider refund does not match this request.');
    this.db.tx(()=>{this.db.run("UPDATE refunds SET provider_id=?,status='PENDING',updated_at=? WHERE id=? AND provider_id IS NULL",providerId,now(),refundId);this.db.audit(actor,'refund_recovered',refundId,{provider_id:providerId});});
    return this.reconcileRefund(refundId);
  }
  async reconcilePending() {
    // Recheck failed attempts too: callbacks may arrive out of order or late.
    for (const row of this.db.all("SELECT * FROM payments WHERE status<>'SUCCESSFUL' AND (checked_at IS NULL OR checked_at<?) ORDER BY COALESCE(checked_at,created_at) LIMIT 25",new Date(Date.now()-60000).toISOString())) {
      if (row.environment!==this.cfg.paymentEnvironment) continue;
      try { await this.reconcile(row.id); } catch { /* retained for next scheduled retry */ }
    }
    for (const row of this.db.all("SELECT id FROM refunds WHERE status IN ('PENDING','UNKNOWN') AND provider_id IS NOT NULL LIMIT 25")) {
      try { await this.reconcileRefund(row.id); } catch { /* retained for retry */ }
    }
  }
}
