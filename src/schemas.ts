import { Type as T, type Static, type TSchema } from '@sinclair/typebox';
export const obj = <P extends Record<string, TSchema>>(p: P) => T.Object(p, { additionalProperties: false });
export const str = (max = 200, min = 1) => T.String({ minLength: min, maxLength: max,...(min>0?{pattern:'\\S'}:{}) });
export const optionalText = (max = 2000) => T.Optional(str(max, 0));
export const integer = (max = 1_000_000_000) => T.Integer({ minimum: 0, maximum: max });
export const choice = <T extends string>(...values: T[]) => ({ type: 'string', enum: values }) as unknown as import('@sinclair/typebox').TLiteral<T>;
export const email = T.String({ format: 'email', maxLength: 254 });
export const phone = T.String({ pattern: '^\\+?[0-9 ()-]{7,25}$' });
export const accessToken = T.String({ pattern: '^[a-f0-9]{64}$', description: 'Generate 32 random bytes in the client and retain privately across retries. Only its hash is stored.' });
export const Color = obj({ name: str(100), hex: T.String({ pattern: '^#[0-9a-fA-F]{6}$' }) });
export const ProductInput = obj({
  name: str(180), tagline: optionalText(300), category: choice('Men', 'Women', 'Unisex', 'Culture'), subcategory: str(100),
  price: integer(), image_url: optionalText(2000), description: str(10000), materials: optionalText(),
  sizes: T.Array(str(100), { minItems: 1, maxItems: 30, uniqueItems: true }),
  colors: T.Array(Color, { minItems: 1, maxItems: 30 }), stock: integer(1_000_000), sku: T.String({pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'}),
  gender: choice('men','women','unisex'), is_featured: T.Boolean(), is_new_arrival: T.Boolean(),
});
export type ProductInput = Static<typeof ProductInput>;
export const ProductUpdate = obj({ ...T.Partial(ProductInput).properties, expected_version: T.Integer({ minimum: 1 }) });
export const Line = obj({ product_id: str(100), size: str(100), color: str(100), quantity: T.Integer({ minimum: 1, maximum: 99 }) });
export type Line = Static<typeof Line>;
export const Lines = T.Array(Line, { minItems: 1, maxItems: 100 });
export const Address = {
  customer_name: str(180), customer_email: email, customer_phone: phone,
  delivery_province: choice('Kigali','Northern','Southern','Eastern','Western'),
  delivery_district: str(100), delivery_sector: str(200), delivery_street: str(500), delivery_notes: optionalText(),
};
export const QuoteInput = obj({ items: Lines, delivery_province: Address.delivery_province });
export const OrderInput = obj({ ...Address, items: Lines, quote_fingerprint: str(64,64), access_token: T.Optional(accessToken), shopping_version: T.Optional(integer()) });
export type OrderInput = Static<typeof OrderInput>;
export const ShoppingInput = obj({ cart: T.Array(Line, { maxItems: 100 }), wishlist: T.Array(str(100), { maxItems: 200, uniqueItems: true }), expected_version: integer() });
export const MergeInput = obj({ cart: ShoppingInput.properties.cart, wishlist: ShoppingInput.properties.wishlist });
export const CustomInput = obj({
  full_name: str(180), phone, email, gender: T.Optional(choice('Men','Women','Unisex')), clothing_type: str(200),
  preferred_color: str(300), measurements: optionalText(4000), occasion: optionalText(1000), description: str(10000),
  preferred_deadline: T.String({ format: 'date' }), media_id: T.Optional(str(100)), upload_token: T.Optional(accessToken), access_token: T.Optional(accessToken),
});
export type CustomInput = Static<typeof CustomInput>;
export const fulfillment = choice('PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED');
export const customStatus = choice('NEW','CONTACTED','DESIGNING','APPROVED','IN PRODUCTION','READY','COMPLETED','CANCELLED');
export const credentials = obj({ email, password: str(128, 12) });
export const signup = obj({ name: str(180), ...credentials.properties });
export const idParams = obj({ id: str(100) });
export const errorSchema = obj({ error: str(2000), code: str(100) });
export const idempotencyHeaders = T.Object({ 'idempotency-key': T.String({ minLength: 16, maxLength: 128 }) }, { additionalProperties: true });
