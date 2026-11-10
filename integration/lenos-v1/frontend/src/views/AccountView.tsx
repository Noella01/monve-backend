import { useState } from 'react';
import { accountRequest, type Account, type Customer } from '../services/account';
import type { Order } from '../types';
import { isBackendConfigured } from '../services/http';

type Props = {
  mode: string; customer: Customer | null; orders: Order[]; loading: boolean;
  cartCount: number; wishlistCount: number; error: string;
  onAuthenticated: (account: Account) => void | Promise<void>; onNavigate: (view: string) => void;
  onResumeOrder: (order:Order) => void; onRecoverShopping: () => Promise<void>;
  onCart: () => void; onWishlist: () => void; onLogout: () => Promise<void>;
};
export function AccountView(props: Props) {
  const { customer, orders, mode, onNavigate } = props;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('orders');
  const signup = mode === 'signup';
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const account = await accountRequest<Account>(signup ? 'signup' : 'login', Object.fromEntries(form));
      await props.onAuthenticated(account);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (!isBackendConfigured) return (
    <section className="account-page account-auth">
      <div><p className="account-kicker">YOUR AURIE</p><h1>Accounts are coming soon.</h1>
        <p>Sign-in and registration are temporarily unavailable. You can still browse the collection and keep your cart and favourites in this browser.</p>
        <button className="account-primary" onClick={() => onNavigate('shop')}>Continue shopping</button>
      </div>
    </section>
  );
  if (props.loading) return <div className="account-page" role="status">Loading your account…</div>;
  if (!customer) return (
    <section className="account-page account-auth">
      <div><p className="account-kicker">YOUR AURIE</p><h1>{signup ? 'Make it yours.' : 'Welcome back.'}</h1>
        <p>Keep your favourites close. Find your orders, saved cart, and next favourite piece in one place.</p>
        <button className="account-link" onClick={() => onNavigate('shop')}>Continue shopping without an account →</button>
      </div>
      <form key={mode} onSubmit={submit} className="account-panel">
        <h2>{signup ? 'Create an account' : 'Log in'}</h2>
        {signup && <label>Full name<input name="name" autoComplete="name" required maxLength={100} /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} /></label>
        {signup && <p className="account-muted">Use at least 12 characters. Never reuse a password from another site.</p>}
        {(error || props.error) && <p role="alert">{error || props.error}</p>}
        <button className="account-primary" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Sign up' : 'Log in'}</button>
        <button type="button" className="account-link" onClick={() => { setError(''); onNavigate(signup ? 'login' : 'signup'); }}>
          {signup ? 'Already a member? Log in' : 'New to AURIE? Create an account'}
        </button>
      </form>
    </section>
  );
  return (
    <section className="account-page">
      <div className="account-heading"><div><p className="account-kicker">MY ACCOUNT</p><h1>Hello, {customer.name.split(' ')[0]}.</h1><p>Your pieces. Your favourites. Your next chapter.</p></div>
        <button className="account-link" disabled={busy} onClick={async () => { setBusy(true); try { await props.onLogout(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }}>Log out</button>
      </div>
      {(error || props.error) && <p role="alert">{error || props.error}</p>}
      {props.error && <div><p className="account-muted">Recovery restores your unsaved bag over the current saved bag when a backup exists. Otherwise it merges saved guest items.</p><button className="account-link" disabled={busy} onClick={async()=>{setBusy(true);try{await props.onRecoverShopping();setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Recover saved shopping</button></div>}
      <div className="account-summary">
        <button onClick={() => setTab('orders')}><strong>{orders.length}</strong><span>My orders</span></button>
        <button onClick={props.onCart}><strong>{props.cartCount}</strong><span>Cart · continue checkout</span></button>
        <button onClick={props.onWishlist}><strong>{props.wishlistCount}</strong><span>Saved favourites</span></button>
      </div>
      <div className="account-tabs"><button aria-pressed={tab === 'orders'} onClick={() => setTab('orders')}>Order history</button><button aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>Profile</button></div>
      {tab === 'profile' ? <div className="account-panel"><h2>Your details</h2><p>{customer.name}</p><p>{customer.email}</p><p className="account-muted">Your delivery address is collected during checkout.</p></div> :
        <div className="account-panel"><h2>Your orders</h2><p className="account-muted">Items in your cart are not orders yet. Orders awaiting payment appear below separately from paid purchases.</p>
          {!orders.length ? <div className="account-empty"><h3>Your story starts here.</h3><p>You haven’t placed an order with this account yet.</p><button className="account-primary" onClick={() => onNavigate('shop')}>Explore the collection</button></div> : orders.map(order => (
            <details key={order.id} className="account-order"><summary><span>{order.order_number}<small>{new Date(order.created_at).toLocaleDateString()}</small></span><span>{order.payment_status === 'PENDING' ? 'Awaiting payment' : order.payment_status === 'FAILED' ? 'Payment failed' : order.status}<small>{order.total.toLocaleString()} RWF</small></span></summary>
              {order.items.map((item, i) => <p key={i}>{item.product_name} · {item.size} · {item.color} × {item.quantity}</p>)}
              <p>Delivery: {order.delivery_street}, {order.delivery_sector}, {order.delivery_district}</p>
              {order.timeline.map((event, i) => <p key={i}>{event.title} — {event.description}</p>)}
              {['PENDING','FAILED'].includes(order.payment_status) && order.status!=='CANCELLED' && <button className="account-link" onClick={()=>props.onResumeOrder(order)}>Resume payment / check status</button>}
            </details>
          ))}
        </div>}
    </section>
  );
}
