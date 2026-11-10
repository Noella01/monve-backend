import { Product, Order, CustomClothingRequest, FlutterwaveConfig, OrderStatus, PaymentStatus, CustomRequestStatus } from '../types';
import { apiRequest, isBackendConfigured } from './http';
import { post } from './checkout';

// Sample catalogue for the standalone storefront; replace through the service below.
export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-001',
    name: 'Obsidian Minimal Blazer',
    tagline: 'Structured silhouette tailored with sharp lines and cultural drape',
    category: 'Men',
    subcategory: 'Jackets',
    price: 125000,
    image_url: '',
    description: 'An architectural single-breasted blazer cut from premium structured wool-blend. Features sharp peaked lapels, hidden interior pocket, and subtle Rwandan woven trim detailing inside the cuff.',
    materials: '80% Refined Wool, 20% Silk Twill. Lining: 100% Cupro.',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { name: 'Obsidian Black', hex: '#0D0D0D' },
      { name: 'Charcoal Slate', hex: '#1C1C1C' }
    ],
    stock: 14,
    sku: 'LEN-M-BLZ-001',
    gender: 'men',
    is_featured: true,
    is_new_arrival: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-002',
    name: 'Tailored Poplin Mandarin Shirt',
    tagline: 'Modern standing collar with clean concealed placket',
    category: 'Men',
    subcategory: 'Shirts',
    price: 58000,
    image_url: '',
    description: 'Contemporary slim-fitting shirt featuring an understated Mandarin band collar, mother-of-pearl buttons, and tailored cuffs. Ideal for formal evenings or contemporary cultural events.',
    materials: '100% Long-Staple Egyptian Cotton',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: [
      { name: 'Pitch Black', hex: '#080808' },
      { name: 'Pure Chalk', hex: '#F0F0F0' }
    ],
    stock: 22,
    sku: 'LEN-M-SHT-002',
    gender: 'men',
    is_featured: false,
    is_new_arrival: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-003',
    name: 'Sculptural Asymmetric Evening Gown',
    tagline: 'Fluid geometry with dramatic high-fashion draping',
    category: 'Women',
    subcategory: 'Dresses',
    price: 145000,
    image_url: '',
    description: 'Designed to elevate Rwandan contemporary gala attire. An asymmetric one-shoulder gown with cascading pleats, side-slit confidence, and an interior corset for effortless poise.',
    materials: 'Heavy Weight Silk Crepe de Chine',
    sizes: ['XS', 'S', 'M', 'L'],
    colors: [
      { name: 'Midnight Onyx', hex: '#0A0A0A' },
      { name: 'Deep Espresso', hex: '#1F1A17' }
    ],
    stock: 9,
    sku: 'LEN-W-DRS-003',
    gender: 'women',
    is_featured: true,
    is_new_arrival: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-004',
    name: 'Fluid Wide-Leg Tailored Trousers',
    tagline: 'Relaxed high-rise silhouette with deep double pleats',
    category: 'Women',
    subcategory: 'Trousers',
    price: 78000,
    image_url: '',
    description: 'Impeccably tailored trousers engineered for unrestricted movement. Sits high on the waist with a flowing wide leg, side slant pockets, and subtle button tab adjusters.',
    materials: 'Structured Gabardine Wool Blend',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { name: 'Obsidian', hex: '#111111' },
      { name: 'Smoked Ash', hex: '#242424' }
    ],
    stock: 18,
    sku: 'LEN-W-TRS-004',
    gender: 'women',
    is_featured: false,
    is_new_arrival: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-005',
    name: '"STYLE WITH NO LIMITS" Heavyweight Tee',
    tagline: '320 GSM luxury unisex essential with minimalist tonal branding',
    category: 'Unisex',
    subcategory: 'T-Shirts',
    price: 42000,
    image_url: '',
    description: 'The defining everyday statement of AURIE. Built with heavyweight French Terry cotton, drop shoulder boxy fit, thick ribbed collar, and high-density tonal rubberized logo print on the chest.',
    materials: '100% Combed Heavy Cotton (320 GSM)',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: [
      { name: 'Vintage Black', hex: '#141414' },
      { name: 'Anthracite', hex: '#222222' }
    ],
    stock: 35,
    sku: 'LEN-U-TEE-005',
    gender: 'unisex',
    is_featured: true,
    is_new_arrival: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-006',
    name: 'Architectural Boxy Hoodie',
    tagline: 'Sculpted double-layer hood without drawstrings for pure minimalism',
    category: 'Unisex',
    subcategory: 'Hoodies',
    price: 92000,
    image_url: '',
    description: 'Clean geometry meets supreme luxury. Features hidden side-seam pockets instead of a pouch, seamless dropped shoulders, and a heavy double-lined hood that holds its structure.',
    materials: '480 GSM Heavyweight Brushed Fleece',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { name: 'Raw Black', hex: '#0B0B0B' },
      { name: 'Graphite', hex: '#1A1A1A' }
    ],
    stock: 12,
    sku: 'LEN-U-HOD-006',
    gender: 'unisex',
    is_featured: false,
    is_new_arrival: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-007',
    name: 'Modern Umushanana Cultural Ensemble',
    tagline: 'Rwandan ceremonial heritage reinterpreted in minimalist midnight tones',
    category: 'Culture',
    subcategory: 'Complete traditional outfits',
    price: 185000,
    image_url: '',
    description: 'A contemporary evolution of the traditional Rwandan Umushanana. Features fluid silk satin sash drape, tailored wrap skirt, and metallic copper-black handcrafted embroidery inspired by sacred geometry.',
    materials: 'Hand-dyed Raw Silk & Metallic Thread Embellishments',
    sizes: ['Custom / Made-to-measure', 'S', 'M', 'L'],
    colors: [
      { name: 'Midnight & Bronze', hex: '#0F0F0F' },
      { name: 'Matte Onyx & Gold Accent', hex: '#1C1917' }
    ],
    stock: 6,
    sku: 'LEN-C-MSH-007',
    gender: 'women',
    is_featured: true,
    is_new_arrival: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-008',
    name: 'Rwandan Imigongo-Inspired Embroidered Tunic',
    tagline: 'Geometric cultural prestige woven into contemporary silhouette',
    category: 'Culture',
    subcategory: 'Traditional shirts',
    price: 110000,
    image_url: '',
    description: 'Men’s ceremonial tunic honoring Rwandan Imigongo patterns. Precise raised embroidery along the chest placket and collar, designed for weddings, cultural festivals, and dignitary occasions.',
    materials: 'Structured Linen & Cotton Blend with Silk Threading',
    sizes: ['M', 'L', 'XL', 'XXL'],
    colors: [
      { name: 'Ebony & Silver Thread', hex: '#0C0C0C' },
      { name: 'Deep Coffee & Gold', hex: '#1A1614' }
    ],
    stock: 8,
    sku: 'LEN-C-TNC-008',
    gender: 'men',
    is_featured: true,
    is_new_arrival: false,
    created_at: new Date().toISOString(),
  }
];

type EventCallback = (data: any) => void;
const eventListeners = new Map<string, Set<EventCallback>>();
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let cursor = 0;
let polling = false;
let disconnected = false;
const versions = new Map<string, number>();
async function pollEvents() {
  if (polling || !eventListeners.size || !isBackendConfigured) return;
  polling = true;
  try {
    const payload = await apiRequest<{events:{type:string;data:any;version:number}[];cursor:number}>('/api/events?after=' + cursor);
    for (const event of payload.events) {
      const identity = event.type.split('_')[0] + ':' + event.data.id;
      if ((versions.get(identity) || 0) > event.version) continue;
      versions.set(identity, event.version);
      triggerStoreEvent(event.type, event.data);
    }
    cursor = payload.cursor;
    if (disconnected) triggerStoreEvent('store_reconnected', {});
    disconnected = false;
  } catch { disconnected = true; }
  finally { polling = false; if (eventListeners.size) pollTimer = setTimeout(pollEvents, 5000); }
}

export function triggerStoreEvent(event: string, data: unknown) {
  eventListeners.get(event)?.forEach(callback => callback(data));
}

export function subscribeToStoreEvents(event: string, callback: EventCallback) {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set());
  eventListeners.get(event)!.add(callback);
  if (isBackendConfigured && !pollTimer && !polling) pollTimer = setTimeout(pollEvents, 5000);
  return () => {
    const callbacks = eventListeners.get(event);
    callbacks?.delete(callback);
    if (!callbacks?.size) eventListeners.delete(event);
    if (!eventListeners.size) { clearTimeout(pollTimer); pollTimer = undefined; }
  };
}

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

// These functions are the integration boundary for the replacement service.
// Reads of private data and all writes require a configured service. They never
// fabricate successful orders or restore data from the removed backend's cache.
export async function getProducts(): Promise<Product[]> {
  return isBackendConfigured ? apiRequest<Product[]>('/api/products') : INITIAL_PRODUCTS;
}

export async function createProduct(data: Partial<Product>): Promise<Product> {
  const { id, created_at, version, ...input } = data;
  const created = await apiRequest<Product>('/api/products', jsonBody('POST', input));
  triggerStoreEvent('product_created', created);
  return created;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
  const { id: ignored, created_at, version, ...input } = updates;
  delete (input as any).updated_at;
  const current = version === undefined ? await apiRequest<Product>(`/api/products/${encodeURIComponent(id)}`) : null;
  const updated = await apiRequest<Product>(`/api/products/${encodeURIComponent(id)}`, jsonBody('PUT', { ...input, expected_version: version ?? current?.version }));
  triggerStoreEvent('product_updated', updated);
  return updated;
}

export async function deleteProduct(id: string): Promise<boolean> {
  await apiRequest(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  triggerStoreEvent('product_deleted', { id });
  return true;
}

export function getOrders(): Promise<Order[]> {
  return apiRequest('/api/orders');
}

export async function createOrder(data: Record<string, unknown>, key?: string): Promise<Order> {
  const created = await post<Order>('/api/orders',data,key);
  triggerStoreEvent('order_created',created);
  return created;
}

export async function updateOrderStatus(id: string, status: OrderStatus, paymentStatus?: PaymentStatus, note?: string): Promise<Order> {
  if (paymentStatus) throw new Error('Payment status is controlled by the provider. Use refund or reconciliation actions.');
  const current = await apiRequest<Order>(`/api/orders/${encodeURIComponent(id)}`);
  const updated = await apiRequest<Order>(`/api/orders/${encodeURIComponent(id)}/status`, jsonBody('PATCH', { status, note, expected_version: current.version }));
  triggerStoreEvent('order_updated', updated);
  return updated;
}

export function getCustomRequests(): Promise<CustomClothingRequest[]> {
  return apiRequest('/api/custom-requests');
}

export async function createCustomRequest(data: Record<string, unknown>, key: string): Promise<CustomClothingRequest> {
  const created = await post<CustomClothingRequest>('/api/custom-requests', data, key);
  triggerStoreEvent('custom_request_created', created);
  return created;
}

export async function updateCustomRequestStatus(id: string, status: CustomRequestStatus, notes?: string): Promise<CustomClothingRequest> {
  const current = (await getCustomRequests()).find(r => r.id === id);
  const updated = await apiRequest<CustomClothingRequest>(`/api/custom-requests/${encodeURIComponent(id)}/status`, jsonBody('PATCH', { status, notes, expected_version: current?.version }));
  triggerStoreEvent('custom_request_updated', updated);
  return updated;
}

export function getFlutterwaveConfig(): Promise<FlutterwaveConfig> {
  return apiRequest('/api/flutterwave/config');
}

export async function updateFlutterwaveConfig(config: Partial<FlutterwaveConfig>): Promise<void> {
  await apiRequest('/api/flutterwave/config', jsonBody('POST', { merchant_name: config.merchant_name }));
}

export async function adjustInventory(id: string, delta: number): Promise<Product> {
  const updated = await post<Product>(`/api/admin/inventory/${encodeURIComponent(id)}/adjustments`, {delta,reason:'Admin inventory adjustment'}, crypto.randomUUID());
  triggerStoreEvent('product_updated', updated);
  return updated;
}

export function upsert<T extends {id:string;version?:number}>(items:T[], item:T):T[] {
  const old=items.find(x=>x.id===item.id);
  if(old && (old.version || 0)>(item.version || 0))return items;
  return old ? items.map(x=>x.id===item.id?item:x) : [item,...items];
}
