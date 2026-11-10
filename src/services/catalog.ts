import { id, now, json, requireValue } from '../core.js';
import type { Store, Row } from '../db.js';
import type { ProductInput, Line } from '../schemas.js';
export class Catalog {
  constructor(public db: Store) {}
  dto(row: Row) { return { ...JSON.parse(row.data), id: row.id, sku: row.sku, price: row.price, stock: row.stock - row.reserved, version: row.version, created_at: row.created_at, updated_at: row.updated_at }; }
  get(productId: string, includeArchived = false): Row {
    const row = this.db.one(`SELECT * FROM products WHERE id=?${includeArchived ? '' : ' AND archived=0'}`, productId);
    requireValue(row, 404, 'Product unavailable.', 'PRODUCT_UNAVAILABLE'); return row;
  }
  list() { return this.db.all('SELECT * FROM products WHERE archived=0 ORDER BY created_at DESC,id').map(row => this.dto(row)); }
  validateImage(url?: string) {
    if (!url) return;
    requireValue(!url.startsWith('data:'), 400, 'Upload the image first; data URLs are not accepted.');
    const internal = /\/api\/media\/([a-zA-Z0-9-]+)$/.exec(url);
    if (internal) {
      requireValue(this.db.one("SELECT id FROM media WHERE id=? AND purpose='product'", internal[1]), 400, 'Invalid product image.');
      this.db.run('UPDATE media SET attached_at=? WHERE id=?', now(), internal[1]);
    } else {
      let parsed: URL | undefined;
      try { parsed = new URL(url); } catch { /* handled below */ }
      requireValue(parsed?.protocol === 'https:' && !parsed.username && !parsed.password, 400, 'Images must be uploaded or use an HTTPS URL.');
    }
  }
  create(input: ProductInput, actor: string, seedId?: string) {
    return this.db.tx(() => {
      this.validateImage(input.image_url);
      requireValue(new Set(input.colors.map(c => c.name)).size === input.colors.length, 400, 'Color names must be unique.');
      requireValue(!this.db.one('SELECT id FROM products WHERE sku=?', input.sku.trim()), 409, 'SKU already exists.', 'SKU_EXISTS');
      const productId = seedId || id(), timestamp = now();
      this.db.run('INSERT INTO products(id,sku,price,stock,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', productId, input.sku.trim(), input.price, input.stock, json(input), timestamp, timestamp);
      this.db.audit(actor, 'product_created', productId);
      this.db.event('product_created', productId, 'public', null, 1);
      return this.dto(this.get(productId));
    });
  }
  update(productId: string, input: Partial<ProductInput> & { expected_version: number }, actor: string) {
    return this.db.tx(() => {
      const old = this.get(productId);
      requireValue(old.version === input.expected_version, 409, 'Product changed. Refresh and try again.', 'VERSION_CONFLICT');
      const { expected_version, ...updates } = input;
      // Browser stock is available stock. Absolute stock edits need the version;
      // reservations and purchases both increment it.
      const next = { ...JSON.parse(old.data), ...updates };
      requireValue(new Set(next.colors.map((c: { name: string }) => c.name)).size === next.colors.length, 400, 'Color names must be unique.');
      this.validateImage(next.image_url);
      requireValue(!this.db.one('SELECT id FROM products WHERE sku=? AND id<>?', next.sku.trim(), productId), 409, 'SKU already exists.', 'SKU_EXISTS');
      const stock = updates.stock === undefined ? old.stock : updates.stock + old.reserved;
      this.db.run('UPDATE products SET sku=?,price=?,stock=?,data=?,version=version+1,updated_at=? WHERE id=?', next.sku.trim(), next.price, stock, json(next), now(), productId);
      if (stock !== old.stock) this.movement(productId, stock-old.stock, 'Product editor stock change', actor, id());
      this.db.audit(actor, 'product_updated', productId, { fields: Object.keys(updates) });
      return this.changed(productId);
    });
  }
  archive(productId: string, actor: string) {
    return this.db.tx(() => {
      const old = this.get(productId);
      this.db.run('UPDATE products SET archived=1,version=version+1,updated_at=? WHERE id=?', now(), productId);
      this.db.audit(actor, 'product_archived', productId);
      this.db.event('product_deleted', productId, 'public', null, old.version + 1);
      return { id: productId, version: old.version + 1 };
    });
  }
  changed(productId: string) {
    const row = this.get(productId, true);
    this.db.event(row.archived ? 'product_deleted' : 'product_updated', productId, 'public', null, row.version);
    return this.dto(row);
  }
  movement(productId: string, delta: number, reason: string, actor: string | null, operation: string) {
    this.db.run('INSERT INTO stock_movements VALUES (?,?,?,?,?,?,?)', id(), productId, delta, reason, actor, operation, now());
  }
  adjust(productId: string, delta: number, reason: string, actor: string, key: string, expectedVersion?: number) {
    return this.db.tx(() => {
      const scope = `inventory:${actor}:${productId}`, body = { delta, reason, expectedVersion };
      if (this.db.prior(scope, key, body)) return this.dto(this.get(productId));
      const row = this.get(productId);
      requireValue(expectedVersion === undefined || row.version === expectedVersion, 409, 'Stock changed. Refresh and try again.', 'VERSION_CONFLICT');
      requireValue(row.stock + delta >= row.reserved, 409, 'This adjustment would consume reserved stock.', 'STOCK_CONFLICT');
      this.db.run('UPDATE products SET stock=stock+?,version=version+1,updated_at=? WHERE id=?', delta, now(), productId);
      this.movement(productId, delta, reason, actor, id());
      this.db.audit(actor, 'stock_adjusted', productId, { delta, reason });
      this.db.remember(scope, key, body, productId);
      return this.changed(productId);
    });
  }
  lines(lines: Line[], checkStock = true) {
    const byProduct = new Map<string, number>(), identities = new Set<string>();
    const items = lines.map(line => {
      const key = json([line.product_id,line.size,line.color]);
      requireValue(!identities.has(key), 400, 'Combine duplicate cart lines.'); identities.add(key);
      const row = this.get(line.product_id), product = this.dto(row);
      requireValue(product.sizes.includes(line.size) && product.colors.some((c: { name: string }) => c.name === line.color), 400, `Choose valid options for ${product.name}.`, 'INVALID_OPTION');
      byProduct.set(row.id, (byProduct.get(row.id) || 0) + line.quantity);
      return { product_id: row.id, product_name: product.name, product_image: product.image_url || '', size: line.size, color: line.color, quantity: line.quantity, price: row.price };
    });
    if (checkStock) for (const [productId, quantity] of byProduct) {
      const product = this.dto(this.get(productId));
      requireValue(product.stock >= quantity, 409, `${product.name}: only ${product.stock} available.`, 'STOCK_CONFLICT');
    }
    return { items, byProduct };
  }
}
