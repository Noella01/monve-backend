export type CategoryType = 'All' | 'Men' | 'Women' | 'Unisex' | 'Culture';

export interface ProductColor {
  name: string;
  hex: string;
}

export interface Product {
  version?: number;
  id: string;
  name: string;
  tagline?: string;
  category: 'Men' | 'Women' | 'Unisex' | 'Culture';
  subcategory: string;
  price: number; // in RWF
  image_url?: string;
  description: string;
  materials?: string;
  sizes: string[];
  colors: ProductColor[];
  stock: number;
  sku: string;
  gender: 'men' | 'women' | 'unisex';
  is_featured: boolean;
  is_new_arrival: boolean;
  created_at: string;
}

export interface CartItem {
  product: Product;
  selectedSize: string;
  selectedColor: ProductColor;
  quantity: number;
}

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';

export type PaymentMethod = 'flutterwave_momo' | 'flutterwave_card' | 'airtel_money';

export interface OrderItem {
  product_id: string;
  product_name: string;
  product_image?: string;
  size: string;
  color: string;
  quantity: number;
  price: number;
}

export interface OrderTimelineEvent {
  status: OrderStatus;
  timestamp: string;
  title: string;
  description: string;
}

export interface Order {
  version?: number;
  reservation_expires_at?: string;
  reservation_state?: string;
  review_required?: boolean;
  environment?: 'test' | 'live';
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_province: string;
  delivery_district: string;
  delivery_sector: string;
  delivery_street: string;
  delivery_notes?: string;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: 'RWF';
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  transaction_reference: string;
  flutterwave_tx_id?: string;
  created_at: string;
  updated_at: string;
  timeline: OrderTimelineEvent[];
}

export type CustomRequestStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'DESIGNING'
  | 'APPROVED'
  | 'IN PRODUCTION'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';

export interface CustomClothingRequest {
  version?: number;
  media_id?: string;
  internal_notes?: string;
  id: string;
  request_number: string;
  full_name: string;
  phone: string;
  email: string;
  gender: 'Men' | 'Women' | 'Unisex';
  clothing_type: string;
  preferred_color: string;
  measurements: string;
  occasion: string;
  description: string;
  reference_image?: string;
  preferred_deadline: string;
  status: CustomRequestStatus;
  estimated_price?: number;
  notes?: string;
  created_at: string;
}

export interface FlutterwaveConfig {
  public_key: string;
  configured: boolean;
  enabled_methods: string[];
  is_test_mode: boolean;
  merchant_name: string;
  currency: string;
}
