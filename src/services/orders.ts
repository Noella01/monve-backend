import type { Store, Row } from '../db.js';
import type { Catalog } from './catalog.js';
import type { Config } from '../config.js';
import type { Line, OrderInput } from '../schemas.js';
import { fingerprint, hash, id, json, now, requireValue } from '../core.js';

const transitions: Record<string, string[]> = {
  PENDING: ['CONFIRMED','CANCELLED'], CONFIRMED: ['PROCESSING','CANCELLED'],
  PROCESSING: ['SHIPPED','CANCELLED'], SHIPPED: ['DELIVERED'], DELIVERED: [], CANCELLED: [],
};
export class Orders {
  constructor(public db: Store, private catalog: Catalog, private cfg: Config) {}
  row(orderId: string) {
    const row = this.db.one('SELECT * FROM orders WHERE id=?', orderId);
    requireValue(row, 404, 'Order not found.', 'NOT_FOUND'); return row;
  }
  dto(row: Row) {
    return { ...JSON.parse(row.data), id: row.id, order_number: row.order_number, items: JSON.parse(row.items),
      subtotal: row.subtotal, delivery_fee: row.delivery_fee, total: row.total, currency: 'RWF',
      status: row.status, payment_status: row.payment_status, payment_method: row.payment_method, transaction_reference: row.transaction_reference,
      created_at: row.created_at, updated_at: row.updated_at, version: row.version,
      reservation_expires_at: row.expires_at, reservation_state: row.reservation_state, review_required: Boolean(row.review_required), environment: row.environment,
      timeline: this.db.all('SELECT status,timestamp,title,description FROM order_timeline WHERE order_id=? ORDER BY id', row.id),
    };
  }
  list(customer?: string) { return this.db.all(`SELECT * FROM orders${customer ? ' WHERE customer_id=?' : ''} ORDER BY created_at DESC,id DESC`, ...(customer ? [customer] : [])).map(row => this.dto(row)); }
  authorized(orderId: string, customer?: string, guestToken?: string, admin = false) {
    const row = this.db.one('SELECT * FROM orders WHERE id=?', orderId);
    requireValue(row && (admin || (customer && row.customer_id === customer) || (!row.customer_id && guestToken && row.access_hash === hash(guestToken))), 404, 'Order not found.', 'NOT_FOUND');
    return row;
  }
  quote(lines: Line[], province: string) {
    requireValue(!this.cfg.provinces.length || this.cfg.provinces.includes(province), 422, 'Delivery to this province is not currently available.', 'DELIVERY_UNAVAILABLE');
    const { items } = this.catalog.lines(lines);
    const subtotal = items.reduce((sum, line) => sum + line.quantity * line.price, 0);
    requireValue(Number.isSafeInteger(subtotal), 400, 'Order amount is too large.');
    const delivery_fee = subtotal > this.cfg.freeAbove ? 0 : this.cfg.deliveryFee;
    const result = { items, subtotal, delivery_fee, total: subtotal + delivery_fee, currency: 'RWF' as const };
    return { ...result, quote_fingerprint: fingerprint({ ...result, province }), expires_at: new Date(Date.now() + 5 * 60000).toISOString(), delivery_policy: 'Rwanda compatibility fee; destination coverage must be confirmed by the merchant.' };
  }
  create(input: OrderInput, customer: string | undefined, key: string) {
    this.expire();
    return this.db.tx(() => {
      requireValue(customer || input.access_token, 400, 'A private access token is required for guest checkout.');
      const scope = `checkout:${customer || hash(input.access_token!)}`;
      const previous = this.db.prior(scope,key,input);
      if (previous) return this.dto(this.row(previous));
      const quote = this.quote(input.items,input.delivery_province);
      requireValue(input.quote_fingerprint === quote.quote_fingerprint, 409, 'Your quote changed. Review current prices before placing the order.', 'QUOTE_CHANGED');
      if (customer) {
        const state = this.db.one('SELECT version FROM shopping WHERE customer_id=?',customer)!;
        requireValue(input.shopping_version === state.version, 409, 'Your bag changed. Refresh before checking out.', 'SHOPPING_CONFLICT');
      }
      const orderId = id(), timestamp = now();
      const { items, access_token, quote_fingerprint, shopping_version, ...address } = input;
      const expires = new Date(Date.now() + this.cfg.reservationMinutes * 60000).toISOString();
      this.db.run(`INSERT INTO orders(id,order_number,customer_id,access_hash,data,items,subtotal,delivery_fee,total,status,payment_status,environment,reservation_state,expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'PENDING','PENDING',?,'ACTIVE',?,?,?)`, orderId, `AUR-${timestamp.slice(0,10).replaceAll('-','')}-${orderId.slice(0,8).toUpperCase()}`, customer || null, customer ? null : hash(access_token!), json(address), json(quote.items), quote.subtotal, quote.delivery_fee, quote.total, this.cfg.paymentEnvironment, expires, timestamp, timestamp);
      const { byProduct } = this.catalog.lines(items);
      for (const [productId, quantity] of byProduct) {
        const reserved = this.db.run('UPDATE products SET reserved=reserved+?,version=version+1,updated_at=? WHERE id=? AND stock-reserved>=? AND archived=0', quantity,timestamp,productId,quantity);
        requireValue(reserved.changes === 1, 409, 'Stock changed. Please review your bag.', 'STOCK_CONFLICT');
        this.db.run('INSERT INTO reservations VALUES (?,?,?)', orderId, productId, quantity);
        this.catalog.changed(productId);
      }
      if (customer) this.db.run("UPDATE shopping SET cart='[]',version=version+1 WHERE customer_id=?", customer);
      this.timeline(orderId,'PENDING','Order saved','Payment is pending. Stock is reserved temporarily.');
      this.db.remember(scope,key,input,orderId);
      this.db.event('order_created',orderId,'private',customer || null,1);
      return this.dto(this.row(orderId));
    });
  }
  timeline(orderId: string, status: string, title: string, description: string) {
    this.db.run('INSERT INTO order_timeline(order_id,status,timestamp,title,description) VALUES (?,?,?,?,?)',orderId,status,now(),title,description);
  }
  changed(orderId: string) {
    this.db.run('UPDATE orders SET version=version+1,updated_at=? WHERE id=?',now(),orderId);
    const row = this.row(orderId);
    this.db.event('order_updated',orderId,'private',row.customer_id,row.version);
    return this.dto(row);
  }
  release(row: Row, restock = false) {
    if (row.reservation_state === 'RELEASED') return;
    for (const reservation of this.db.all('SELECT * FROM reservations WHERE order_id=?',row.id)) {
      if (row.reservation_state === 'ACTIVE') this.db.run('UPDATE products SET reserved=reserved-?,version=version+1,updated_at=? WHERE id=?',reservation.quantity,now(),reservation.product_id);
      else if (restock) {
        this.db.run('UPDATE products SET stock=stock+?,version=version+1,updated_at=? WHERE id=?',reservation.quantity,now(),reservation.product_id);
        this.catalog.movement(reservation.product_id,reservation.quantity,'Cancelled before dispatch',null,`restock:${row.id}:${reservation.product_id}`);
      } else continue;
      this.catalog.changed(reservation.product_id);
    }
    this.db.run("UPDATE orders SET reservation_state='RELEASED' WHERE id=?",row.id);
  }
  expire() {
    return this.db.tx(() => {
      const rows = this.db.all("SELECT * FROM orders WHERE reservation_state='ACTIVE' AND expires_at<=?",now());
      for (const row of rows) {
        this.release(row);
        this.timeline(row.id,row.status,'Reservation expired','Stock was released. Review availability before resuming payment.');
        this.changed(row.id);
      }
      return rows.length;
    });
  }
  // Must run inside the payment transaction. Late success either reacquires
  // every line atomically or records a paid order requiring refund review.
  commitPaid(row: Row) {
    if (row.reservation_state === 'COMMITTED') return true;
    const reservations = this.db.all('SELECT * FROM reservations WHERE order_id=?',row.id);
    if (row.status === 'CANCELLED') { this.release(row); return false; }
    if (row.reservation_state === 'RELEASED') {
      const available = reservations.every(r => {
        const product = this.catalog.get(r.product_id,true);
        return !product.archived && product.stock-product.reserved >= r.quantity;
      });
      if (!available) return false;
    }
    for (const r of reservations) {
      this.db.run('UPDATE products SET stock=stock-?,reserved=reserved-?,version=version+1,updated_at=? WHERE id=?',r.quantity,row.reservation_state === 'ACTIVE' ? r.quantity : 0,now(),r.product_id);
      this.catalog.movement(r.product_id,-r.quantity,'Verified payment',null,`paid:${row.id}:${r.product_id}`);
      this.catalog.changed(r.product_id);
    }
    this.db.run("UPDATE orders SET reservation_state='COMMITTED' WHERE id=?",row.id);
    return true;
  }
  resumeReservation(row: Row) {
    requireValue(row.status !== 'CANCELLED' && row.payment_status !== 'SUCCESSFUL' && row.payment_status !== 'REFUNDED',409,'This order cannot start another payment.');
    if (row.reservation_state === 'ACTIVE') return;
    for (const r of this.db.all('SELECT * FROM reservations WHERE order_id=?',row.id)) {
      const update = this.db.run('UPDATE products SET reserved=reserved+?,version=version+1,updated_at=? WHERE id=? AND archived=0 AND stock-reserved>=?',r.quantity,now(),r.product_id,r.quantity);
      requireValue(update.changes === 1,409,'Some items are no longer available.', 'STOCK_CONFLICT');
      this.catalog.changed(r.product_id);
    }
    this.db.run("UPDATE orders SET reservation_state='ACTIVE',expires_at=?,payment_status='PENDING' WHERE id=?",new Date(Date.now()+this.cfg.reservationMinutes*60000).toISOString(),row.id);
    this.changed(row.id);
  }
  transition(orderId: string, status: string, note: string, actor: string, version: number) {
    return this.db.tx(() => {
      const row = this.row(orderId);
      requireValue(row.version === version,409,'Order changed. Refresh and try again.', 'VERSION_CONFLICT');
      if (status === row.status) return this.dto(row);
      requireValue(transitions[row.status].includes(status),409,`Cannot change ${row.status} to ${status}.`, 'INVALID_TRANSITION');
      if (status !== 'CANCELLED') requireValue(row.payment_status === 'SUCCESSFUL' && !row.review_required,409,'Verified payment and resolved review are required before fulfillment.', 'PAYMENT_REQUIRED');
      if (status === 'CANCELLED') this.release(row,true);
      this.db.run('UPDATE orders SET status=? WHERE id=?',status,orderId);
      this.timeline(orderId,status,status[0]+status.slice(1).toLowerCase(),note || (status === 'CANCELLED' ? 'Order cancelled. Any paid amount requires a separate refund.' : 'The atelier updated your order.'));
      this.db.audit(actor,'order_status',orderId,{ from:row.status,to:status,note });
      return this.changed(orderId);
    });
  }
}
