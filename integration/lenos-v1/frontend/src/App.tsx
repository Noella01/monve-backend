import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from './useTheme';
import { AccountView } from './views/AccountView';
import { accountRequest, type Account, type Customer, type SavedShopping } from './services/account';
import { lines, post, readStored, store } from './services/checkout';
import { isBackendConfigured } from './services/http';
import {
  Product,
  CartItem,
  CategoryType,
  ProductColor,
  Order,
} from './types';
import {
  getProducts,
  subscribeToStoreEvents,
  INITIAL_PRODUCTS,
  upsert,
} from './services/api';

// Components
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { QuickViewModal } from './components/QuickViewModal';
import { SearchModal } from './components/SearchModal';
import { WishlistDrawer } from './components/WishlistDrawer';

// Views
import { HomeView } from './views/HomeView';
import { ShopView } from './views/ShopView';
import { ProductDetailView } from './views/ProductDetailView';
import { CustomClothingView } from './views/CustomClothingView';
import { AdminDashboardView } from './views/AdminDashboardView';

type AdminTab = 'overview' | 'products' | 'orders' | 'custom' | 'inventory' | 'payments' | 'settings';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [accountOrders, setAccountOrders] = useState<Order[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountError, setAccountError] = useState('');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  // Products state
  const [products, setProducts] = useState<Product[]>(isBackendConfigured ? [] : INITIAL_PRODUCTS);
  const [catalogueError, setCatalogueError] = useState('');

  // Parse initial route from URL
  const parseRoute = useCallback(() => {
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    if (pathname.startsWith('/admin')) {
      const sub = pathname.replace('/admin', '').replace(/^\//, '').split('/')[0];
      const validTabs: AdminTab[] = ['overview', 'products', 'orders', 'custom', 'inventory', 'payments', 'settings'];
      const adminTab: AdminTab = validTabs.includes(sub as any) ? (sub as AdminTab) : 'overview';
      return {
        role: 'admin' as const,
        adminTab,
        customerView: 'home',
        category: 'All' as CategoryType,
      };
    }

    let customerView = 'home';
    if (['/login', '/signup', '/account'].includes(pathname)) {
      customerView = pathname.slice(1);
    } else if (pathname.startsWith('/shop')) {
      customerView = 'shop';
    } else if (['/custom', '/customs'].includes(pathname.replace(/\/+$/, ''))) {
      customerView = 'custom';
    }

    const catParam = searchParams.get('category');
    const validCats: CategoryType[] = ['All', 'Men', 'Women', 'Unisex', 'Culture'];
    const category = catParam && validCats.includes(catParam as any) ? (catParam as CategoryType) : 'All';

    return {
      role: 'customer' as const,
      adminTab: 'overview' as AdminTab,
      customerView,
      category,
    };
  }, []);

  const [currentRole, setCurrentRole] = useState<'customer' | 'admin'>(() => parseRoute().role);
  useEffect(() => {
    document.documentElement.dataset.theme = currentRole === 'admin' ? 'dark' : theme;
  }, [theme, currentRole]);
  const [activeView, setActiveView] = useState<string>(() => parseRoute().customerView);
  const [adminTab, setAdminTab] = useState<AdminTab>(() => parseRoute().adminTab);
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>(() => parseRoute().category);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Cart & Wishlist state
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    const saved = readStored<unknown>('lenos_cart', []);
    return Array.isArray(saved) ? saved.filter(i=>i?.product?.id && i?.selectedSize && i?.selectedColor?.name && Number.isInteger(i?.quantity) && i.quantity>0) : [];
  });
  const [wishlist, setWishlist] = useState<Product[]>(() => {
    const saved = readStored<unknown>('lenos_wishlist', []);
    return Array.isArray(saved) ? saved.filter(i=>i?.id) : [];
  });

  const shoppingVersion = useRef(0);
  const savedSignature = useRef('');
  const saving = useRef<Promise<void> | null>(null);
  const shoppingState = useRef({customer,cartItems,wishlist});
  shoppingState.current = {customer,cartItems,wishlist};
  const signature = (cart:CartItem[], wishes:Product[]) => JSON.stringify({cart:lines(cart),wishlist:wishes.map(p=>p.id)});
  const applyShopping = (state:SavedShopping) => {
    shoppingVersion.current=state.shopping_version;
    savedSignature.current=signature(state.cart,state.wishlist);
    setCartItems(state.cart);setWishlist(state.wishlist);
  };
  const flushShopping = async ():Promise<number|undefined> => {
    if(saving.current) await saving.current;
    const state=shoppingState.current;
    if(!state.customer)return;
    const snapshot=signature(state.cartItems,state.wishlist);
    if(snapshot===savedSignature.current)return shoppingVersion.current;
    const operation=async()=>{
      try {
        const result=await accountRequest<SavedShopping>('shopping',{cart:lines(state.cartItems),wishlist:state.wishlist.map(p=>p.id),expected_version:shoppingVersion.current},'PUT');
        shoppingVersion.current=result.shopping_version;savedSignature.current=snapshot;localStorage.removeItem(`aurie_unsaved_${state.customer!.id}`);setAccountError('');
      } catch(e) {
        store(`aurie_unsaved_${state.customer!.id}`,{cart:state.cartItems,wishlist:state.wishlist});
        if((e as any).code==='SHOPPING_CONFLICT'){
          const latest=await accountRequest<Account>('session');
          if(latest.customer){applyShopping(latest);setAccountOrders(latest.orders);}
        }
        setAccountError((e as Error).message+' Your unsaved bag has been kept in this browser for recovery.');throw e;
      }
    };
    const pending=operation();saving.current=pending;
    try {await pending;}finally {if(saving.current===pending)saving.current=null;}
    return shoppingVersion.current;
  };
  const mergeGuest = async (account:Account) => {
    const guestCart=readStored<CartItem[]>('lenos_cart',[]),guestWishlist=readStored<Product[]>('lenos_wishlist',[]);
    if(!Array.isArray(guestCart)||!Array.isArray(guestWishlist))return account;
    const body={cart:lines(guestCart),wishlist:guestWishlist.map(p=>p.id)};
    if(!body.cart.length&&!body.wishlist.length)return account;
    const merge=async()=>{
      const latestCart=readStored<CartItem[]>('lenos_cart',[]),latestWishlist=readStored<Product[]>('lenos_wishlist',[]);
      if(!latestCart.length&&!latestWishlist.length)return accountRequest<Account>('session');
      body.cart=lines(latestCart);body.wishlist=latestWishlist.map(p=>p.id);
      const stored=readStored<{key:string;signature:string}|null>('aurie_guest_merge',null),snapshot=JSON.stringify(body);
      const key=stored?.signature===snapshot?stored.key:crypto.randomUUID();store('aurie_guest_merge',{key,signature:snapshot});
      const result=await post<SavedShopping>('/api/account/shopping/merge',body,key);
      if(JSON.stringify({cart:lines(readStored<CartItem[]>('lenos_cart',[])),wishlist:readStored<Product[]>('lenos_wishlist',[]).map(p=>p.id)})===snapshot){localStorage.removeItem('lenos_cart');localStorage.removeItem('lenos_wishlist');localStorage.removeItem('aurie_guest_merge');}
      return {...account,...result};
    };
    return navigator.locks ? navigator.locks.request('aurie-guest-merge',merge) : merge();
  };

  useEffect(() => {
    if (!isBackendConfigured) { setAccountLoading(false); return; }
    accountRequest<Account | { customer: null }>('session').then(async data => {
      if (data.customer) {
        const account = data as Account;
        setCustomer(account.customer);applyShopping(account);setAccountOrders(account.orders);
        try {applyShopping(await mergeGuest(account));}catch(e){setAccountError((e as Error).message+' Guest items remain saved in this browser.');}
        if(readStored(`aurie_unsaved_${account.customer.id}`,null))setAccountError('An unsaved shopping backup is available in this browser.');
      }
    }).catch(() => { /* Guest shopping remains available if accounts are offline. */ })
      .finally(() => setAccountLoading(false));
  }, []);

  useEffect(() => {
    if (!customer || accountLoading || isCheckoutOpen) return;
    const timer = setTimeout(() => {
      void flushShopping().catch(()=>undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [customer, cartItems, wishlist, accountLoading, isCheckoutOpen]);

  // Modals
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  // Live Toast Notification
  const [liveToast, setLiveToast] = useState<{ message: string; sub?: string } | null>(null);

  // Synchronize route when user clicks back/forward or enters URL
  const applyRoute = useCallback(() => {
    const route = parseRoute();
    setCurrentRole(route.role);
    setAdminTab(route.adminTab);
    setActiveView(route.customerView);
    setSelectedCategory(route.category);
  }, [parseRoute]);

  // URL Navigation helper
  const navigateTo = (url: string) => {
    if (window.location.pathname + window.location.search + window.location.hash !== url) {
      window.history.pushState({}, '', url);
    }
    applyRoute();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    window.addEventListener('popstate', applyRoute);
    return () => {
      window.removeEventListener('popstate', applyRoute);
    };
  }, [applyRoute]);

  // Load products on mount
  useEffect(() => {
    getProducts().then((data) => {setProducts(data);setCatalogueError('');}).catch(() => {setCatalogueError('The catalogue is temporarily unavailable. Please refresh to retry.');});

    const unsubOrder = subscribeToStoreEvents('order_updated', (order: Order) => {
      setAccountOrders(prev=>prev.some(p=>p.id===order.id)?upsert(prev,order):prev);
      setLiveToast({
        message: `Order #${order.order_number} Status Updated`,
        sub: `New status: ${order.status} (${new Date().toLocaleTimeString()})`,
      });
      setTimeout(() => setLiveToast(null), 4000);
    });

    const unsubProductCreated = subscribeToStoreEvents('product_created', (newProd: Product) => {
      setProducts((prev) => upsert(prev,newProd));
    });

    const unsubProductUpdated = subscribeToStoreEvents('product_updated', (updProd: Product) => {
      setProducts((prev) => upsert(prev,updProd));
      setSelectedProduct(prev=>prev?.id===updProd.id?updProd:prev);
    });

    const unsubProductDeleted = subscribeToStoreEvents('product_deleted', ({ id }: { id: string }) => {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    });

    return () => {
      unsubOrder();
      unsubProductCreated();
      unsubProductUpdated();
      unsubProductDeleted();
    };
  }, []);

  useEffect(()=>{
    if(!customer)return;
    const refresh=()=>accountRequest<Order[]>('orders').then(setAccountOrders).catch(()=>undefined);
    const timer=setInterval(refresh,10000);
    return()=>clearInterval(timer);
  },[customer?.id]);

  // Save cart & wishlist to localStorage
  useEffect(() => {
    if (!customer && !accountLoading) {try{localStorage.setItem('lenos_cart', JSON.stringify(cartItems));}catch{setAccountError('This browser could not save your bag.');}}
  }, [cartItems, customer, accountLoading]);

  useEffect(() => {
    if (!customer && !accountLoading) {try{localStorage.setItem('lenos_wishlist', JSON.stringify(wishlist));}catch{setAccountError('This browser could not save your favourites.');}}
  }, [wishlist, customer, accountLoading]);

  // Cart operations
  const handleAddToCart = (
    product: Product,
    size: string,
    color: ProductColor,
    quantity: number = 1
  ) => {
    setCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (item) =>
          item.product.id === product.id &&
          item.selectedSize === size &&
          item.selectedColor.name === color.name
      );

      if (existingIdx > -1) {
        const next = [...prev];
        next[existingIdx] = {...next[existingIdx],quantity:Math.min(99,product.stock,next[existingIdx].quantity+quantity)};
        return next;
      }
      return [...prev, { product, selectedSize: size, selectedColor: color, quantity }];
    });
    setIsCartOpen(true);
  };

  const handleBuyNow = (
    product: Product,
    size: string,
    color: ProductColor,
    quantity: number = 1
  ) => {
    handleAddToCart(product, size, color, quantity);
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleUpdateQuantity = (idx: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(idx);
      return;
    }
    setCartItems((prev) => {
      const next = [...prev];
      next[idx] = {...next[idx],quantity:Math.min(99,next[idx].product.stock,newQty)};
      return next;
    });
  };

  const handleRemoveCartItem = (idx: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Wishlist toggle
  const handleToggleWishlist = (product: Product) => {
    setWishlist((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        return prev.filter((p) => p.id !== product.id);
      }
      return [...prev, product];
    });
  };

  // Customer navigation handlers
  const handleNavigate = (view: string, categoryFilter?: CategoryType) => {
    if (['login', 'signup', 'account'].includes(view)) {
      navigateTo(`/${view}`);
    } else if (view === 'home') {
      navigateTo('/');
    } else if (view === 'shop') {
      if (categoryFilter && categoryFilter !== 'All') {
        navigateTo(`/shop?category=${categoryFilter}`);
      } else {
        navigateTo('/shop');
      }
    } else if (view === 'custom') {
      navigateTo('/customs');
    } else {
      setActiveView(view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setActiveView('product-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const wishlistIds = wishlist.map((w) => w.id);

  // Dedicated Admin Portal (URL: /admin)
  if (currentRole === 'admin') {
    return (
      <div className="min-h-screen bg-[var(--tone-0a0a0a)] text-[var(--tone-f5f5f5)]">
        <AdminDashboardView
          currentTab={adminTab}
          onTabChange={(tab) => {
            setAdminTab(tab);
            window.history.pushState({}, '', tab === 'overview' ? '/admin' : `/admin/${tab}`);
          }}
          onSwitchToCustomer={() => {
            navigateTo('/');
          }}
        />
      </div>
    );
  }

  // Dedicated Customer Portal (URL: /)
  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[var(--tone-0a0a0a)] text-[var(--tone-f5f5f5)]">
      {/* Real-Time Status Toast */}
      {liveToast && (
        <div className="fixed top-20 right-4 z-50 bg-[var(--tone-161616)] border border-emerald-500/50 text-[var(--tone-ffffff)] p-3.5 shadow-2xl rounded-none max-w-sm animate-fade-in flex items-start gap-3 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mt-1"></span>
          <div>
            <div className="text-xs font-bold text-[var(--tone-ffffff)] uppercase tracking-wider">
              {liveToast.message}
            </div>
            {liveToast.sub && (
              <div className="text-[11px] text-[var(--tone-a3a3a3)] mt-0.5">{liveToast.sub}</div>
            )}
          </div>
        </div>
      )}

      {/* Main Navbar */}
      <Navbar
        customerName={customer?.name}
        theme={theme}
        onToggleTheme={toggleTheme}
        currentRole={currentRole}
        onSwitchRole={(role) => {
          if (role === 'admin') {
            navigateTo('/admin');
          } else {
            navigateTo('/');
          }
        }}
        activeView={activeView}
        onNavigate={handleNavigate}
        cartCount={cartCount}
        wishlistCount={wishlist.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {catalogueError && <p role="alert" className="p-4 text-center">{catalogueError}</p>}
        {readStored<any>(`aurie_checkout_${customer?.id || 'guest'}`,null)?.order && <div className="p-3 text-center text-sm"><button className="underline" onClick={()=>setIsCheckoutOpen(true)}>Resume saved order / check payment</button></div>}
        {['login', 'signup', 'account'].includes(activeView) && <AccountView
          key={customer?.id || activeView}
          mode={activeView} customer={customer} orders={accountOrders} loading={accountLoading}
          cartCount={cartCount} wishlistCount={wishlist.length} error={accountError}
          onNavigate={handleNavigate} onCart={() => setIsCartOpen(true)} onWishlist={() => setIsWishlistOpen(true)}
          onResumeOrder={order=>{store(`aurie_checkout_${customer!.id}`,{key:crypto.randomUUID(),token:'',order});setIsCheckoutOpen(true);}}
          onRecoverShopping={async()=>{
            const current=await accountRequest<Account>('session');
            const unsaved=readStored<{cart:CartItem[];wishlist:Product[]}|null>(`aurie_unsaved_${customer!.id}`,null);
            if(unsaved){const recovered=await accountRequest<SavedShopping>('shopping',{cart:lines(unsaved.cart),wishlist:unsaved.wishlist.map(p=>p.id),expected_version:current.shopping_version},'PUT');applyShopping(recovered);localStorage.removeItem(`aurie_unsaved_${customer!.id}`);}
            else applyShopping(await mergeGuest(current));
            setAccountError('');
          }}
          onAuthenticated={async(account) => {
            setCustomer(account.customer);applyShopping(account);setAccountOrders(account.orders);setAccountError('');
            try{applyShopping(await mergeGuest(account));}catch(e){setAccountError((e as Error).message+' Guest items remain saved.');}
            if(readStored(`aurie_unsaved_${account.customer.id}`,null))setAccountError('An unsaved shopping backup is available in this browser.');
            navigateTo('/account');
          }}
          onLogout={async () => {
            if(signature(cartItems,wishlist)!==savedSignature.current)store(`aurie_unsaved_${customer!.id}`,{cart:cartItems,wishlist});
            await accountRequest('logout', {});
            setCustomer(null);setAccountOrders([]);
            const guestCart=readStored<unknown>('lenos_cart',[]),guestWishlist=readStored<unknown>('lenos_wishlist',[]);
            setCartItems(Array.isArray(guestCart)?guestCart.filter(i=>i?.product?.id&&i?.selectedSize&&i?.selectedColor?.name&&Number.isInteger(i?.quantity)&&i.quantity>0):[]);
            setWishlist(Array.isArray(guestWishlist)?guestWishlist.filter(i=>i?.id):[]);
            setIsCheckoutOpen(false); setAccountError(''); navigateTo('/');
          }}
        />}
        {activeView === 'home' && (
          <HomeView
            products={products}
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onQuickView={(p) => setQuickViewProduct(p)}
            onSelectProduct={handleSelectProduct}
            onAddToCart={(p, size, col) => handleAddToCart(p, size, col, 1)}
            onNavigate={handleNavigate}
          />
        )}

        {activeView === 'shop' && (
          <ShopView
            key={selectedCategory}
            products={products}
            initialCategory={selectedCategory}
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onQuickView={(p) => setQuickViewProduct(p)}
            onSelectProduct={handleSelectProduct}
            onAddToCart={(p, size, col) => handleAddToCart(p, size, col, 1)}
          />
        )}

        {activeView === 'product-detail' && selectedProduct && (
          <ProductDetailView
            key={selectedProduct.id}
            product={selectedProduct}
            onBack={() => navigateTo('/shop')}
            isWishlisted={wishlistIds.includes(selectedProduct.id)}
            onToggleWishlist={handleToggleWishlist}
            onAddToCart={(p, sz, col, qty) => handleAddToCart(p, sz, col, qty)}
            onBuyNow={(p, sz, col, qty) => handleBuyNow(p, sz, col, qty)}
            onSelectRelated={handleSelectProduct}
            relatedProducts={products.filter(
              (p) => p.category === selectedProduct.category && p.id !== selectedProduct.id
            )}
          />
        )}

        {activeView === 'custom' && (
          <CustomClothingView onNavigateHome={() => navigateTo('/')} />
        )}

      </main>

      {/* Footer */}
      <Footer
        onNavigate={handleNavigate}
        onSwitchRole={(role) => {
          if (role === 'admin') {
            navigateTo('/admin');
          } else {
            navigateTo('/');
          }
        }}
        currentRole={currentRole}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Checkout Modal with Flutterwave & Rwanda Address */}
      <CheckoutModal
        key={customer?.id || 'guest'}
        customer={customer}
        onLogin={() => { setIsCheckoutOpen(false); navigateTo('/login'); }}
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cartItems}
        prepareCheckout={flushShopping}
        onOrderSuccess={(order) => {
          if (customer) {setAccountOrders(prev => upsert(prev,order));shoppingVersion.current+=1;savedSignature.current=signature([],wishlist);}
          setCartItems([]);
        }}
        onViewOrders={() => {
          setIsCheckoutOpen(false);
          navigateTo('/account');
        }}
      />

      {/* Quick View Modal */}
      <QuickViewModal
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        onAddToCart={(p, sz, col) => handleAddToCart(p, sz, col, 1)}
        onViewDetails={handleSelectProduct}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigateHome={() => navigateTo('/')}
        products={products}
        onSelectProduct={handleSelectProduct}
      />

      {/* Wishlist Drawer */}
      <WishlistDrawer
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        wishlist={wishlist}
        onRemoveFromWishlist={(id) => setWishlist((prev) => prev.filter((p) => p.id !== id))}
        onSelectProduct={handleSelectProduct}
      />
    </div>
  );
}
