import type { CartItem, Order } from '../types';
import { apiRequest } from './http';
export type Quote = { items:Order['items']; subtotal:number; delivery_fee:number; total:number; quote_fingerprint:string };
export type Payment = { id:string;status:string;checkout_url?:string;method:string;reference:string };
export type Intent = { key:string; token:string; order?:Order; payload?:Record<string,unknown>; paymentKey?:string; method?:string };
export const lines = (cart: CartItem[]) => cart.map(i=>({product_id:i.product.id,size:i.selectedSize,color:i.selectedColor.name,quantity:i.quantity}));
export const privateToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export function readStored<T>(key:string,fallback:T):T {try {const value=localStorage.getItem(key);return value ? (JSON.parse(value) ?? fallback) : fallback;}catch{return fallback;}}
export function store(key:string,value:unknown) {localStorage.setItem(key,JSON.stringify(value));}
export const post = <T>(path:string,body:unknown,key?:string,access?:string) => apiRequest<T>(path,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{}),...(access?{'X-Order-Token':access}:{})},body:JSON.stringify(body)});
export const paymentStatus = (orderId:string,token?:string) => apiRequest<{order:Order;attempts:Payment[]}>(`/api/orders/${encodeURIComponent(orderId)}/payment-status`,{headers:token?{'X-Order-Token':token}:{}});
export async function uploadImage(file:File,purpose:'product'|'custom') {
  const data=new FormData();data.set('file',file);
  return apiRequest<{media_id:string;url:string;upload_token:string}>(`/api/uploads?purpose=${purpose}`,{method:'POST',body:data});
}
