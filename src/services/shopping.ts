import type { Store } from '../db.js';
import type { Catalog } from './catalog.js';
import type { Line } from '../schemas.js';
import { json, requireValue } from '../core.js';
export class Shopping {
  constructor(private db: Store, private catalog: Catalog) {}
  read(customer: string) {
    const row = this.db.one('SELECT * FROM shopping WHERE customer_id=?', customer)!;
    const issues: string[] = [];
    const cart = (JSON.parse(row.cart) as Line[]).flatMap(line => {
      try {
        this.catalog.lines([line], false);
        const product = this.catalog.dto(this.catalog.get(line.product_id));
        if (line.quantity > product.stock) issues.push(`${product.name} has only ${product.stock} available.`);
        return [{ product, selectedSize: line.size, selectedColor: product.colors.find((c: { name: string }) => c.name === line.color), quantity: line.quantity }];
      } catch { issues.push(`Unavailable item ${line.product_id} was omitted.`); return []; }
    });
    const wishlist = (JSON.parse(row.wishlist) as string[]).flatMap(productId => {
      try { return [this.catalog.dto(this.catalog.get(productId))]; } catch { issues.push(`Wishlist item ${productId} is unavailable.`); return []; }
    });
    return { cart, wishlist, shopping_version: row.version as number, issues };
  }
  validate(cart: Line[], wishlist: string[]) {
    this.catalog.lines(cart);
    wishlist.forEach(productId => this.catalog.get(productId));
  }
  save(customer: string, cart: Line[], wishlist: string[], version: number) {
    return this.db.tx(() => {
      this.validate(cart, wishlist);
      const result = this.db.run('UPDATE shopping SET cart=?,wishlist=?,version=version+1 WHERE customer_id=? AND version=?', json(cart), json(wishlist), customer, version);
      requireValue(result.changes === 1, 409, 'Your bag changed in another tab. Reload the saved bag before editing.', 'SHOPPING_CONFLICT');
      return this.read(customer);
    });
  }
  merge(customer: string, incoming: Line[], wishlist: string[], key: string) {
    return this.db.tx(() => {
      const scope = `merge:${customer}`, body = { cart: incoming, wishlist };
      if (this.db.prior(scope,key,body)) return this.read(customer);
      const saved = this.read(customer);
      const lines = new Map<string, Line>();
      const existing=saved.cart.map(item=>({product_id:item.product.id,size:item.selectedSize,color:item.selectedColor.name,quantity:item.quantity}));
      for (const line of [...existing, ...incoming] as Line[]) {
        const identity = json([line.product_id,line.size,line.color]);
        lines.set(identity, { ...line, quantity: Math.min(99, line.quantity + (lines.get(identity)?.quantity || 0)) });
      }
      const merged = [...lines.values()], wanted = [...new Set<string>([...saved.wishlist.map(p=>p.id),...wishlist])];
      requireValue(merged.length <= 100 && wanted.length <= 200, 400, 'Saved shopping is too large.');
      this.validate(merged, wanted);
      this.db.run('UPDATE shopping SET cart=?,wishlist=?,version=version+1 WHERE customer_id=?', json(merged),json(wanted),customer);
      this.db.remember(scope,key,body,customer);
      return this.read(customer);
    });
  }
}
