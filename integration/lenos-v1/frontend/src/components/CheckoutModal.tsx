import React, { useEffect, useState } from 'react';
import { X, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { CartItem, Order } from '../types';
import type { Customer } from '../services/account';
import { apiRequest, isBackendConfigured, ApiError } from '../services/http';
import { lines, post, privateToken, readStored, store, paymentStatus, type Intent, type Quote, type Payment } from '../services/checkout';

interface Props { customer?:Customer|null;onLogin?:()=>void;isOpen:boolean;onClose:()=>void;cartItems:CartItem[];onOrderSuccess:(order:Order)=>void;onViewOrders:()=>void;prepareCheckout?:()=>Promise<number|undefined> }
const money=(value:number)=>new Intl.NumberFormat('en-RW',{style:'currency',currency:'RWF',maximumFractionDigits:0}).format(value);
export const CheckoutModal:React.FC<Props>=({customer,onLogin,isOpen,onClose,cartItems,onOrderSuccess,onViewOrders,prepareCheckout})=>{
  const storageKey=`aurie_checkout_${customer?.id || 'guest'}`;
  const fresh=():Intent=>({key:crypto.randomUUID(),token:privateToken()});
  const [intent,setIntent]=useState<Intent>(()=>readStored(storageKey,fresh()));
  const [details,setDetails]=useState({customer_name:customer?.name || '',customer_email:customer?.email || '',customer_phone:'+250',delivery_province:'Kigali',delivery_district:'',delivery_sector:'',delivery_street:'',delivery_notes:''});
  const [quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [methods,setMethods]=useState<string[]>([]),[method,setMethod]=useState(''),[payer,setPayer]=useState('');
  const [attempt,setAttempt]=useState<Payment|null>(null);
  const persist=(next:Intent)=>{store(storageKey,next);setIntent(next);};
  useEffect(()=>{
    if(!isOpen || !isBackendConfigured)return;
    const saved=readStored(storageKey,fresh());setIntent(saved);
    if(saved.payload)setDetails(previous=>Object.fromEntries(Object.keys(previous).map(key=>[key,typeof saved.payload?.[key]==='string'?saved.payload[key]:(previous as any)[key]])) as typeof previous);
    apiRequest<{enabled_methods:string[]}>('/api/payments/config').then(data=>{setMethods(data.enabled_methods);setMethod(current=>current || data.enabled_methods[0] || '');}).catch(e=>setError(e.message));
  },[isOpen]);
  useEffect(()=>{
    if(!isOpen || !intent.order)return;
    let active=true;
    const refresh=()=>paymentStatus(intent.order!.id,intent.token).then(data=>{if(!active)return;setIntent(previous=>{const next={...previous,order:data.order};store(storageKey,next);return next;});setAttempt(data.attempts[0] || null);}).catch(e=>{if(active)setError(e.message);});
    void refresh();const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer);};
  },[isOpen,intent.order?.id,storageKey]);
  if(!isOpen)return null;
  const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Please try again.');if(!intent.order && e instanceof ApiError && ['QUOTE_CHANGED','SHOPPING_CONFLICT','STOCK_CONFLICT'].includes(e.code || '')){persist(fresh());setQuote(null);}}finally{setBusy(false);}};
  const review=(event:React.FormEvent)=>{event.preventDefault();void run(async()=>{
    if(intent.payload){const saved=await post<Order>(customer?'/api/account/orders':'/api/orders',intent.payload,intent.key);persist({...intent,order:saved});onOrderSuccess(saved);return;}
    const next=await post<Quote>('/api/checkout/quote',{items:lines(cartItems),delivery_province:details.delivery_province});setQuote(next);
  });};
  const save=()=>void run(async()=>{
    if(!quote)return;
    if(intent.payload){const saved=await post<Order>(customer?'/api/account/orders':'/api/orders',intent.payload,intent.key);persist({...intent,order:saved});onOrderSuccess(saved);return;}
    const version=await prepareCheckout?.();
    const payload={...details,items:lines(cartItems),quote_fingerprint:quote.quote_fingerprint,...(customer?{shopping_version:version}:{access_token:intent.token})};
    const pending={...intent,payload};persist(pending);
    const order=await post<Order>(customer?'/api/account/orders':'/api/orders',payload,intent.key);
    persist({...pending,order});onOrderSuccess(order);
  });
  const pay=()=>void run(async()=>{
    if(!intent.order)return;
    const paymentKey=intent.paymentKey && intent.method===method && attempt?.status!=='FAILED' ? intent.paymentKey : crypto.randomUUID();
    persist({...intent,paymentKey,method});
    const result=await post<Payment>(`/api/orders/${intent.order.id}/payment-session`,{method,...(method==='mobile_money'?{payer_phone:payer}:{})},paymentKey,intent.token);setAttempt(result);
    if(result.checkout_url)window.location.assign(result.checkout_url);
  });
  const order=intent.order,paid=order?.payment_status==='SUCCESSFUL';
  return <div className="fixed inset-0 z-50 bg-black/85 overflow-y-auto flex items-start justify-center p-4 py-12" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
    <div className="bg-[var(--tone-121212)] text-[var(--tone-f5f5f5)] border border-[var(--tone-2a2a2a)] w-full max-w-2xl p-6 sm:p-8 space-y-6">
      <div className="flex justify-between items-center"><h2 id="checkout-title" className="text-2xl font-heading uppercase">{order?'Your order':'Checkout'}</h2><button disabled={busy} onClick={onClose} aria-label="Close checkout"><X/></button></div>
      {!isBackendConfigured?<p>Checkout is temporarily unavailable. Your bag remains saved.</p>:<>
        {error&&<p role="alert" className="border border-red-500/50 p-3 text-sm">{error}</p>}
        {!customer&&!order&&<button onClick={onLogin} className="underline text-sm">Sign in to save orders to your account</button>}
        {!order&&!quote&&<form onSubmit={review} className="grid sm:grid-cols-2 gap-4">
          {([['customer_name','Full name'],['customer_email','Email'],['customer_phone','Phone / WhatsApp'],['delivery_district','District'],['delivery_sector','Sector / cell'],['delivery_street','Street / house / landmark']] as const).map(([key,label])=><label className="text-sm space-y-2" key={key}><span>{label}</span><input required type={key==='customer_email'?'email':'text'} value={details[key]} onChange={e=>setDetails({...details,[key]:e.target.value})} className="w-full border border-[var(--tone-333333)] bg-transparent p-3"/></label>)}
          <label className="text-sm">Province<select className="w-full bg-[var(--tone-121212)] border border-[var(--tone-333333)] p-3 mt-2" value={details.delivery_province} onChange={e=>setDetails({...details,delivery_province:e.target.value})}>{['Kigali','Northern','Southern','Eastern','Western'].map(p=><option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">Delivery instructions (optional)<input className="w-full border border-[var(--tone-333333)] bg-transparent p-3 mt-2" value={details.delivery_notes} onChange={e=>setDetails({...details,delivery_notes:e.target.value})}/></label>
          <button disabled={busy || (!cartItems.length&&!intent.payload)} className="aurie-button sm:col-span-2">{busy?<Loader2 className="animate-spin"/>:intent.payload?'Recover submitted order':'Review current price & availability'}</button>
        </form>}
        {!order&&quote&&<div className="space-y-4"><h3 className="font-semibold">Review your order</h3>{quote.items.map((i,n)=><p key={n} className="text-sm">{i.product_name} · {i.size} · {i.color} × {i.quantity}<span className="float-right">{money(i.price*i.quantity)}</span></p>)}<p>Delivery <span className="float-right">{money(quote.delivery_fee)}</span></p><p className="text-lg font-semibold">Total <span className="float-right">{money(quote.total)}</span></p><p className="text-xs">Saving creates an unpaid order and temporarily reserves stock. You can pay on the next step.</p><button disabled={busy} className="aurie-button" onClick={save}>Save order & continue <ArrowRight size={16}/></button><button disabled={busy} onClick={()=>{setQuote(null);persist(fresh());}} className="ml-4 underline">Edit details</button></div>}
        {order&&<div className="space-y-4"><CheckCircle2 size={32}/><h3 className="text-xl">{paid?'Payment received':order.payment_status==='REFUNDED'?'Payment refunded':'Order saved — payment pending'}</h3><p>{order.order_number} · {money(order.total)}</p><p className="text-sm">Fulfillment: {order.status}. Payment: {order.payment_status}.</p>{order.review_required&&<p role="status">Your payment needs merchant review before dispatch. Please retain your order number.</p>}
          {!paid&&order.payment_status!=='REFUNDED'&&order.status!=='CANCELLED'&&<>{methods.length?<><label className="block text-sm">Payment method<select value={method} onChange={e=>setMethod(e.target.value)} className="block w-full p-3 bg-[var(--tone-121212)] border border-[var(--tone-333333)] mt-2">{methods.map(m=><option key={m} value={m}>{m==='card'?'Card — secure Flutterwave checkout':'Rwanda mobile money'}</option>)}</select></label>{method==='mobile_money'&&<label className="block text-sm">Payer mobile number<input value={payer} onChange={e=>setPayer(e.target.value)} placeholder="+250788123456" className="block w-full bg-transparent border border-[var(--tone-333333)] p-3 mt-2"/></label>}<button disabled={busy} className="aurie-button" onClick={pay}>{attempt?.status==='FAILED'?'Retry payment':'Continue payment'}</button></>:<p>Online payments are currently unavailable. This order is unpaid and will not be dispatched.</p>}{attempt&&<p role="status" className="text-sm">Payment attempt: {attempt.status}. {attempt.status==='UNKNOWN'?'The provider response was uncertain. Check status before retrying.':method==='mobile_money'?'Authorize the payment on the payer’s phone.':''}</p>}<button disabled={busy} className="underline text-sm" onClick={()=>void run(async()=>{const data=await post<{order:Order;attempts:Payment[]}>(`/api/orders/${order.id}/reconcile-payment`,{},undefined,intent.token);persist({...intent,order:data.order});setAttempt(data.attempts[0]||null);})}>Check payment status</button></>}
          <p className="text-xs">Reserved until {order.reservation_expires_at ? new Date(order.reservation_expires_at).toLocaleString() : 'the displayed server deadline'}. This browser retains private access to your order.</p>{!customer&&<details><summary className="text-sm cursor-pointer">Show private order access token</summary><code className="text-xs break-all">{intent.token}</code></details>}
          <div className="flex flex-wrap gap-4">{customer&&<button className="underline" onClick={onViewOrders}>View my orders</button>}<button className="underline" onClick={onClose}>Continue shopping</button><button className="underline" onClick={()=>{const history=readStored<Intent[]>('aurie_order_access',[]);store('aurie_order_access',[...history.filter(i=>i.order?.id!==order.id),intent]);persist(fresh());setQuote(null);setAttempt(null);}}>Start a new order</button></div>
        </div>}
      </>}
    </div>
  </div>;
};
