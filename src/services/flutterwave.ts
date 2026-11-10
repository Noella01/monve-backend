import { createHmac } from 'node:crypto';
import type { Config } from '../config.js';
import { ApiError, equal, requireValue } from '../core.js';

export interface VerifiedTransaction {
  id: string; tx_ref: string; amount: number; currency: string; status: string; account_id: string;
}
export interface Provider {
  initiate(input: { reference:string; orderId:string; amount:number; email:string; name:string; phone:string; method:string; expires:string }): Promise<{ checkout_url?:string; provider_id?:string }>;
  verify(reference: string, transactionId?: string): Promise<VerifiedTransaction>;
  refund(transactionId: string, amount: number, reason: string): Promise<{ id:string; status:string }>;
  getRefund(refundId: string): Promise<{ id:string; transaction_id:string; amount:number; status:string; account_id:string }>;
}
// This production adapter has no success simulation. Tests inject a provider.
export class Flutterwave implements Provider {
  constructor(private cfg: Config, private transport: typeof fetch = fetch) {}
  async request(path: string, body?: unknown): Promise<any> {
    requireValue(this.cfg.flwSecret && this.cfg.flwAccountId && this.cfg.webhookSecret,503,'Payments are not configured. Your order remains unpaid.','PAYMENTS_UNAVAILABLE');
    let response: Response;
    try {
      response = await this.transport(`https://api.flutterwave.com/v3${path}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization:`Bearer ${this.cfg.flwSecret}`, 'Content-Type':'application/json' },
        body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(15000), redirect:'error',
      });
    } catch { throw new ApiError(503,'Payment provider could not be reached. Check the existing payment status before retrying.','PROVIDER_UNCERTAIN'); }
    const result = await response.json().catch(()=>null) as any;
    if (!response.ok || result?.status !== 'success' || !result?.data) throw new ApiError(503,'The payment provider has not confirmed this operation.','PROVIDER_UNCERTAIN');
    return result.data;
  }
  async initiate(input: Parameters<Provider['initiate']>[0]) {
    if (input.method === 'mobile_money') {
      const data = await this.request('/charges?type=mobile_money_rwanda',{
        tx_ref:input.reference,order_id:input.orderId,amount:input.amount,currency:'RWF',email:input.email,
        fullname:input.name,phone_number:input.phone,meta:{order_id:input.orderId,environment:this.cfg.paymentEnvironment},
      });
      return { provider_id: data.id ? String(data.id) : undefined };
    }
    const data = await this.request('/payments',{
      tx_ref:input.reference,amount:input.amount,currency:'RWF',redirect_url:this.cfg.redirectUrl,payment_options:'card',link_expiration:input.expires,
      customer:{email:input.email,name:input.name,phonenumber:input.phone},customizations:{title:'AURIE'},
      meta:{order_id:input.orderId,environment:this.cfg.paymentEnvironment},
    });
    const url = new URL(data.link);
    requireValue(url.protocol==='https:' && (url.hostname==='checkout.flutterwave.com' || url.hostname==='flutterwave.com' || url.hostname.endsWith('.flutterwave.com')),503,'Unexpected provider checkout URL.','PROVIDER_UNCERTAIN');
    return { checkout_url:url.href };
  }
  async verify(reference: string, transactionId?: string): Promise<VerifiedTransaction> {
    const data = await this.request(transactionId ? `/transactions/${encodeURIComponent(transactionId)}/verify` : `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);
    return { id:String(data.id),tx_ref:data.tx_ref,amount:Number(data.amount),currency:data.currency,status:data.status,account_id:String(data.account_id) };
  }
  async refund(transactionId: string, amount: number, reason: string) {
    const data = await this.request(`/transactions/${encodeURIComponent(transactionId)}/refund`,{amount,comments:reason});
    return {id:String(data.id),status:String(data.status)};
  }
  async getRefund(refundId: string) {
    const data = await this.request(`/refunds/${encodeURIComponent(refundId)}`);
    return { id:String(data.id),transaction_id:String(data.tx_id ?? data.TransactionId),amount:Number(data.amount_refunded ?? data.AmountRefunded),status:String(data.status),account_id:String(data.account_id ?? data.AccountId) };
  }
}
export function verifyWebhook(cfg: Config, raw: string, headers: Record<string, unknown>) {
  if (!cfg.webhookSecret) return false;
  // Configure one scheme for the merchant/version; never silently downgrade.
  const supplied = headers[cfg.webhookAuth==='hmac' ? 'flutterwave-signature' : 'verif-hash'];
  const expected = cfg.webhookAuth==='hmac' ? createHmac('sha256',cfg.webhookSecret).update(raw).digest('base64') : cfg.webhookSecret;
  return typeof supplied==='string' && equal(supplied,expected);
}
