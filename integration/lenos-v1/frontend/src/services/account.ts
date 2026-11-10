import type { CartItem, Product, Order } from '../types';
import { apiRequest } from './http';
export type Customer = { id: string; name: string; email: string };
export type SavedShopping = { cart: CartItem[]; wishlist: Product[]; shopping_version: number; issues: string[] };
export type Account = SavedShopping & { customer: Customer; orders: Order[] };
export async function accountRequest<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  return apiRequest<T>(`/api/account/${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
