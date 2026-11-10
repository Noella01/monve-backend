import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Scissors,
  Layers,
  CreditCard,
  Settings,
  ArrowUpRight,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  AlertTriangle,
  RefreshCw,
  Camera,
  MapPin,
  Phone,
  Eye,
  Menu,
  Lock,
  Unlock,
  LogOut,
  ExternalLink
} from 'lucide-react';
import { Product, Order, CustomClothingRequest, OrderStatus, PaymentStatus, CustomRequestStatus, CategoryType } from '../types';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  updateOrderStatus,
  getCustomRequests,
  updateCustomRequestStatus,
  getFlutterwaveConfig,
  updateFlutterwaveConfig,
  subscribeToStoreEvents
  ,adjustInventory, upsert
} from '../services/api';
import { ImagePlaceholder } from '../components/ImagePlaceholder';
import { PaymentsPanel } from '../components/PaymentsPanel';
import { PrivateImage } from '../components/PrivateImage';
import { uploadImage } from '../services/checkout';
import { apiFetch, isBackendConfigured } from '../services/http';

type AdminTab = 'overview' | 'products' | 'orders' | 'custom' | 'inventory' | 'payments' | 'settings';

interface AdminDashboardViewProps {
  currentTab?: AdminTab;
  onTabChange?: (tab: AdminTab) => void;
  onSwitchToCustomer: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentTab = 'overview',
  onTabChange,
  onSwitchToCustomer,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(currentTab);

  // Authentication gate for admin portal
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [adminEmail,setAdminEmail]=useState('');
  const [authError, setAuthError] = useState('');

  // Synchronize prop tab
  useEffect(() => {
    if (currentTab && currentTab !== activeTab) {
      setActiveTab(currentTab);
    }
  }, [currentTab]);

  const handleTabSelect = (tab: AdminTab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customRequests, setCustomRequests] = useState<CustomClothingRequest[]>([]);
  const [flwConfig, setFlwConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dataErrors,setDataErrors]=useState<string[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Product modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  // Selected Order for detail view
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  // Filter states
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('All');
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isBackendConfigured) { setAuthLoading(false); return; }
    apiFetch('/api/admin/session')
      .then(res => res.ok ? res.json() : { authenticated: false })
      .then(data => setIsAuthenticated(data.authenticated === true))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await apiFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passcode,...(adminEmail?{email:adminEmail}:{}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-in failed.');
      setPasscode('');
      setIsAuthenticated(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign-in failed.');
    }
  };

  const handleLogout = async () => {
    try {const response=await apiFetch('/api/admin/logout', { method: 'POST' });if(!response.ok)throw new Error('Logout failed. Retry to revoke the session.');setIsAuthenticated(false);setOrders([]);setCustomRequests([]);}catch(e){setDataErrors([(e as Error).message]);}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        getProducts(),
        getOrders(),
        getCustomRequests(),
        getFlutterwaveConfig(),
      ]);
      const setters=[setProducts,setOrders,setCustomRequests,setFlwConfig];
      const names=['Catalogue','Orders','Customs','Gateway'];
      const errors:string[]=[];
      results.forEach((result,index)=>{if(result.status==='fulfilled')(setters[index] as (value:any)=>void)(result.value);else errors.push(names[index]+': '+result.reason.message);});
      setDataErrors(errors);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadData();
    const refreshTimer=setInterval(()=>void loadData(),15000);

    // Listen to real-time events from server or customer actions
    const unsubOrder = subscribeToStoreEvents('order_created', (newOrder: Order) => {
      setOrders((prev) => upsert(prev,newOrder));
    });
    const unsubOrderUpd = subscribeToStoreEvents('order_updated', (updOrder: Order) => {
      setOrders((prev) => upsert(prev,updOrder));
      if (viewingOrder?.id === updOrder.id) {
        setViewingOrder(updOrder);
      }
    });
    const unsubCustom = subscribeToStoreEvents('custom_request_created', (req: CustomClothingRequest) => {
      setCustomRequests((prev) => upsert(prev,req));
    });
    const unsubCustomUpd = subscribeToStoreEvents('custom_request_updated', (updReq: CustomClothingRequest) => {
      setCustomRequests((prev) => upsert(prev,updReq));
    });

    return () => {
      clearInterval(refreshTimer);
      unsubOrder();
      unsubOrderUpd();
      unsubCustom();
      unsubCustomUpd();
    };
  }, [viewingOrder?.id, isAuthenticated]);

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, status);
      // Data will also be updated via store event
    } catch {
      alert('Failed to update order status');
    }
  };

  const handleUpdatePaymentStatus = async (orderId: string, paymentStatus: PaymentStatus) => {
    try {
      const order = orders.find((o) => o.id === orderId);
      if (order) {
        await updateOrderStatus(orderId, order.status, paymentStatus);
      }
    } catch {
      alert('Failed to update payment status');
    }
  };

  const handleUpdateCustomStatus = async (id: string, status: CustomRequestStatus, notes?: string) => {
    try {
      await updateCustomRequestStatus(id, status, notes);
    } catch {
      alert('Failed to update bespoke request status');
    }
  };

  const handleAdjustStock = async (product: Product, delta: number) => {
    try {
      const updated=await adjustInventory(product.id,delta);
      setProducts(prev=>upsert(prev,updated));
    } catch(error) {
      alert((error as Error).message);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Are you sure you want to remove this garment from the store?')) {
      try {
        await deleteProduct(id);
        setProducts((prev) => prev.filter((p) => p.id !== id));
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to remove garment.');
      }
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: 'RWF',
      maximumFractionDigits: 0,
    }).format(val);

  // Metrics
  const totalSales = orders
    .filter((o) => ['SUCCESSFUL','REFUNDED'].includes(o.payment_status) && o.environment===(flwConfig?.is_test_mode===false?'live':'test'))
    .reduce((sum, o) => sum + o.total, 0);
  const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').length;
  const inProductionCustomCount = customRequests.filter((r) => r.status !== 'COMPLETED' && r.status !== 'CANCELLED').length;
  const lowStockProducts = products.filter((p) => p.stock < 10);

  if (!isBackendConfigured) return (
    <div className="min-h-screen bg-[var(--tone-070707)] text-[var(--tone-f5f5f5)] flex items-center justify-center p-6">
      <section className="max-w-md border border-[var(--tone-2a2a2a)] p-8 space-y-5">
        <p className="text-xs uppercase tracking-widest">AURIE · Admin</p>
        <h1 className="text-2xl font-semibold">Admin access is temporarily unavailable.</h1>
        <p className="text-sm text-[var(--tone-a3a3a3)]">Store management will be available once the new service is connected.</p>
        <button className="aurie-button" onClick={onSwitchToCustomer}>Back to storefront</button>
      </section>
    </div>
  );
  if (authLoading) return <div className="min-h-screen bg-[var(--tone-070707)]" />;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--tone-070707)] flex flex-col justify-center items-center p-4 selection:bg-[var(--tone-ffffff)] selection:text-[var(--tone-000000)]">
        <div className="absolute inset-0 bg-[radial-gradient(#1c1c1c_1px,transparent_1px)] [background-size:24px_24px] opacity-50 pointer-events-none" />

        <div className="w-full max-w-md bg-[var(--tone-121212)] border border-[var(--tone-2a2a2a)] p-8 shadow-2xl relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full border border-amber-500/40 bg-amber-950/20 text-amber-400 flex items-center justify-center mx-auto mb-2">
              <Lock size={22} />
            </div>
            <span className="font-heading text-xl font-bold tracking-[0.2em] text-[var(--tone-ffffff)] block">
              AURIE
            </span>
            <span className="text-[10px] tracking-[0.3em] uppercase text-amber-400 font-semibold block">
              Store Admin Portal
            </span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--tone-1c1c1c)] border border-[var(--tone-2e2e2e)] text-[10px] font-mono text-[var(--tone-a3a3a3)] mt-1">
              <span>/admin</span>
            </div>
            <p className="text-xs text-[var(--tone-a3a3a3)] pt-2 font-light">
              Restricted portal for store operations, Kigali atelier inventory, bespoke tailoring, and Flutterwave payment settings.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block text-xs">Admin email (optional with one administrator)<input type="email" autoComplete="username" className="block w-full bg-transparent border border-[var(--tone-333333)] px-3 py-2 mt-2" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)}/></label>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1.5 font-semibold">
                Admin Password
              </label>
              <input
                type="password"
                autoFocus
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter admin password"
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-333333)] px-3.5 py-2.5 text-sm text-[var(--tone-ffffff)] rounded focus:outline-none focus:border-[var(--tone-ffffff)] font-mono"
              />
            </div>

            {authError && (
              <div className="p-3 bg-red-950/40 border border-red-800/50 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle size={14} />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-[var(--tone-ffffff)] hover:bg-[var(--tone-e5e5e5)] text-[var(--tone-000000)] py-3 text-xs uppercase tracking-[0.2em] font-bold transition-colors flex items-center justify-center gap-2"
            >
              <Unlock size={14} />
              <span>Unlock Admin Dashboard</span>
            </button>
          </form>

          <div className="pt-4 border-t border-[var(--tone-222222)] flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onSwitchToCustomer}
              className="w-full py-2 text-[var(--tone-737373)] hover:text-[var(--tone-d4d4d4)] text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>← Back to Customer Storefront</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--tone-0a0a0a)] text-[var(--tone-f5f5f5)] flex flex-col md:flex-row">
      {/* Sidebar for Desktop & Collapsible Mobile */}
      <aside className="w-full md:w-64 bg-[var(--tone-0f0f0f)] border-b md:border-b-0 md:border-r border-[var(--tone-222222)] flex-shrink-0 flex flex-col justify-between">
        <div>
          {/* Top Brand Tag */}
          <div className="p-5 border-b border-[var(--tone-222222)] flex items-center justify-between">
            <div>
              <span className="font-heading text-lg font-bold tracking-[0.2em] text-[var(--tone-ffffff)]">
                AURIE
              </span>
              <span className="block text-[9px] uppercase tracking-[0.3em] text-amber-400 font-semibold">
                Store Management
              </span>
              <span className="block text-[9px] font-mono text-[var(--tone-737373)] mt-0.5">
                /admin
              </span>
            </div>

            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="md:hidden p-2 text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]"
            >
              <Menu size={20} />
            </button>
          </div>

          {/* Navigation Links */}
          <nav
            className={`p-3 space-y-1.5 text-xs font-medium uppercase tracking-wider ${
              mobileNavOpen ? 'block' : 'hidden md:block'
            }`}
          >
            <button
              onClick={() => {
                handleTabSelect('overview');
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded transition-colors ${
                activeTab === 'overview'
                  ? 'bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-bold'
                  : 'text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-1a1a1a)]'
              }`}
            >
              <LayoutDashboard size={16} />
              <span>Overview</span>
            </button>

            <button
              onClick={() => {
                handleTabSelect('products');
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded transition-colors ${
                activeTab === 'products'
                  ? 'bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-bold'
                  : 'text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-1a1a1a)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Package size={16} />
                <span>Products</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--tone-222222)] text-[var(--tone-d4d4d4)]">
                {products.length}
              </span>
            </button>

            <button
              onClick={() => {
                handleTabSelect('orders');
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded transition-colors ${
                activeTab === 'orders'
                  ? 'bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-bold'
                  : 'text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-1a1a1a)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShoppingBag size={16} />
                <span>Orders</span>
              </div>
              {pendingOrdersCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-[var(--tone-000000)] font-bold">
                  {pendingOrdersCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                handleTabSelect('custom');
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded transition-colors ${
                activeTab === 'custom'
                  ? 'bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-bold'
                  : 'text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-1a1a1a)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Scissors size={16} />
                <span>Customs</span>
              </div>
              {inProductionCustomCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500 text-[var(--tone-ffffff)] font-bold">
                  {inProductionCustomCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                handleTabSelect('inventory');
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded transition-colors ${
                activeTab === 'inventory'
                  ? 'bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-bold'
                  : 'text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-1a1a1a)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Layers size={16} />
                <span>Inventory & Stock</span>
              </div>
              {lowStockProducts.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-bold">
                  {lowStockProducts.length} low
                </span>
              )}
            </button>

            <button
              onClick={() => {
                handleTabSelect('payments');
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded transition-colors ${
                activeTab === 'payments'
                  ? 'bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-bold'
                  : 'text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-1a1a1a)]'
              }`}
            >
              <CreditCard size={16} />
              <span>Flutterwave & MoMo</span>
            </button>
          </nav>
        </div>

        {/* Bottom Switch back to Storefront Button & Sign Out */}
        <div className="p-4 border-t border-[var(--tone-222222)] space-y-2">
          <button
            onClick={onSwitchToCustomer}
            className="w-full py-2.5 px-3 bg-[var(--tone-1c1c1c)] hover:bg-[var(--tone-252525)] border border-[var(--tone-2e2e2e)] text-[var(--tone-d4d4d4)] hover:text-[var(--tone-ffffff)] text-xs font-semibold rounded flex items-center justify-center gap-2 transition-colors uppercase tracking-wider"
          >
            <span>Customer Portal (/)</span>
            <ArrowUpRight size={14} />
          </button>

          <button
            onClick={handleLogout}
            className="w-full py-1.5 px-3 text-[var(--tone-737373)] hover:text-red-400 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogOut size={12} />
            <span>Lock Admin Portal</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {dataErrors.map(message=><p key={message} role="alert" className="mb-3 text-sm text-red-300">{message} Previously loaded data may be stale.</p>)}
        {/* Top bar info */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-[var(--tone-222222)] mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
                {loading?'Refreshing store data':'Store data refreshes every 15 seconds'}
              </span>
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[var(--tone-ffffff)] mt-1 uppercase tracking-wide">
              {activeTab === 'overview' && 'STORE OVERVIEW'}
              {activeTab === 'products' && 'GARMENT CATALOG'}
              {activeTab === 'orders' && 'CUSTOMER ORDERS & DISPATCH'}
              {activeTab === 'custom' && 'CUSTOMS'}
              {activeTab === 'inventory' && 'INVENTORY & ATELIER STOCK'}
              {activeTab === 'payments' && 'FLUTTERWAVE GATEWAY SETTINGS'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 border border-[var(--tone-2e2e2e)] bg-[var(--tone-141414)] hover:bg-[var(--tone-202020)] text-[var(--tone-d4d4d4)] rounded transition-colors"
              title="Refresh store data"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>

            {activeTab === 'products' && (
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setIsProductModalOpen(true);
                }}
                className="bg-[var(--tone-ffffff)] hover:bg-[var(--tone-e5e5e5)] text-[var(--tone-000000)] px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
              >
                <Plus size={15} />
                <span>Add New Piece</span>
              </button>
            )}
          </div>
        </div>

        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-fade-in">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] p-5">
                <span className="text-[10px] uppercase tracking-widest text-[var(--tone-a3a3a3)] block mb-1">
                  Total Revenue (RWF)
                </span>
                <div className="font-heading text-2xl font-bold text-[var(--tone-ffffff)]">
                  {formatCurrency(totalSales)}
                </div>
                <span className="text-[10px] text-emerald-400 mt-1 block">
                  Gross verified paid totals including delivery · {flwConfig?.is_test_mode===false?'Live':'Test'}
                </span>
              </div>

              <div className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] p-5">
                <span className="text-[10px] uppercase tracking-widest text-[var(--tone-a3a3a3)] block mb-1">
                  Total Orders
                </span>
                <div className="font-heading text-2xl font-bold text-[var(--tone-ffffff)]">
                  {orders.length}
                </div>
                <span className="text-[10px] text-[var(--tone-a3a3a3)] mt-1 block">
                  {pendingOrdersCount} orders currently in dispatch pipeline
                </span>
              </div>

              <div className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] p-5">
                <span className="text-[10px] uppercase tracking-widest text-[var(--tone-a3a3a3)] block mb-1">
                  Active Bespoke Requests
                </span>
                <div className="font-heading text-2xl font-bold text-amber-300">
                  {inProductionCustomCount}
                </div>
                <span className="text-[10px] text-[var(--tone-a3a3a3)] mt-1 block">
                  Custom clothing requests
                </span>
              </div>

              <div className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] p-5">
                <span className="text-[10px] uppercase tracking-widest text-[var(--tone-a3a3a3)] block mb-1">
                  Garment Stock Status
                </span>
                <div className="font-heading text-2xl font-bold text-[var(--tone-ffffff)]">
                  {products.length} Designs
                </div>
                <span className="text-[10px] text-red-400 mt-1 block">
                  {lowStockProducts.length} low stock pieces
                </span>
              </div>
            </div>

            {/* Quick Status Adjuster on Recent Orders */}
            <div className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-heading text-base font-bold text-[var(--tone-ffffff)] uppercase tracking-wider">
                    Recent Orders & Live Status Control
                  </h3>
                  <p className="text-xs text-[var(--tone-a3a3a3)] mt-0.5">
                    Changing status here instantly updates the customer's live tracking view in real time!
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('orders')}
                  className="text-xs text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] uppercase tracking-wider underline underline-offset-4"
                >
                  View All ({orders.length})
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--tone-222222)] text-[var(--tone-a3a3a3)] text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-2">Order #</th>
                      <th className="py-3 px-2">Customer & Rwanda Address</th>
                      <th className="py-3 px-2">Amount</th>
                      <th className="py-3 px-2">Payment</th>
                      <th className="py-3 px-2">Live Order Status (1-Click Change)</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--tone-1f1f1f)]">
                    {orders.slice(0, 5).map((order) => (
                      <tr key={order.id} className="hover:bg-[var(--tone-1a1a1a)] transition-colors">
                        <td className="py-3.5 px-2 font-mono font-bold text-[var(--tone-ffffff)]">
                          #{order.order_number}
                        </td>
                        <td className="py-3.5 px-2">
                          <div className="font-medium text-[var(--tone-ffffff)]">{order.customer_name}</div>
                          <div className="text-[11px] text-[var(--tone-a3a3a3)] line-clamp-1">
                            {order.delivery_sector}, {order.delivery_district} · {order.customer_phone}
                          </div>
                        </td>
                        <td className="py-3.5 px-2 font-semibold text-[var(--tone-ffffff)]">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="py-3.5 px-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              order.payment_status === 'SUCCESSFUL'
                                ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-950/70 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {order.payment_status}
                          </span>
                        </td>
                        <td className="py-3.5 px-2">
                          <select
                            value={order.status}
                            onChange={(e) =>
                              handleUpdateOrderStatus(order.id, e.target.value as OrderStatus)
                            }
                            className="bg-[var(--tone-202020)] border border-[var(--tone-333333)] text-xs font-semibold px-2 py-1 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                          >
                            <option value="PENDING">PENDING</option>
                            <option value="CONFIRMED">CONFIRMED</option>
                            <option value="PROCESSING">PROCESSING (Atelier)</option>
                            <option value="SHIPPED">SHIPPED (In Transit)</option>
                            <option value="DELIVERED">DELIVERED</option>
                            <option value="CANCELLED">CANCELLED</option>
                          </select>
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setViewingOrder(order)}
                              className="p-1.5 text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] rounded hover:bg-[var(--tone-252525)]"
                              title="View Order Details"
                            >
                              <Eye size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 2. PRODUCTS TAB */}
        {activeTab === 'products' && (
          <div className="space-y-6 animate-fade-in">
            {/* Filter and search */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-[var(--tone-141414)] p-4 border border-[var(--tone-242424)]">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)]">Category:</span>
                <select
                  value={productCategoryFilter}
                  onChange={(e) => setProductCategoryFilter(e.target.value)}
                  className="bg-[var(--tone-1f1f1f)] border border-[var(--tone-2f2f2f)] text-xs px-3 py-1.5 text-[var(--tone-ffffff)] rounded"
                >
                  <option value="All">All Categories</option>
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                  <option value="Unisex">Unisex</option>
                  <option value="Culture">Traditional / Culture</option>
                </select>
              </div>

              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tone-a3a3a3)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search garments..."
                  className="w-full bg-[var(--tone-1f1f1f)] border border-[var(--tone-2f2f2f)] pl-9 pr-3 py-1.5 text-xs text-[var(--tone-ffffff)] rounded focus:outline-none focus:border-[var(--tone-ffffff)]"
                />
              </div>
            </div>

            {/* Products Table */}
            <div className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--tone-222222)] text-[var(--tone-a3a3a3)] text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-3">Garment Photo / Silhouette</th>
                    <th className="py-3 px-3">Name & SKU</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Price (RWF)</th>
                    <th className="py-3 px-3">Sizes</th>
                    <th className="py-3 px-3">Stock in Atelier</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--tone-1f1f1f)]">
                  {products
                    .filter((p) => {
                      if (productCategoryFilter !== 'All' && p.category !== productCategoryFilter) return false;
                      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                      return true;
                    })
                    .map((p) => (
                      <tr key={p.id} className="hover:bg-[var(--tone-1a1a1a)] transition-colors">
                        <td className="py-3 px-3">
                          <div className="w-14 h-16 bg-[var(--tone-171717)] border border-[var(--tone-2a2a2a)] overflow-hidden">
                            <ImagePlaceholder
                              imageUrl={p.image_url}
                              alt={p.name}
                              category={p.category}
                              aspectRatio="portrait"
                              allowEdit={true}
                              onImageChange={async (newUrl) => {
                                await updateProduct(p.id, { image_url: newUrl });
                                setProducts((prev) =>
                                  prev.map((item) => (item.id === p.id ? { ...item, image_url: newUrl } : item))
                                );
                              }}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[var(--tone-ffffff)]">{p.name}</div>
                          <div className="text-[10px] text-[var(--tone-a3a3a3)] font-mono">SKU: {p.sku}</div>
                          {p.is_featured && (
                            <span className="text-[9px] text-amber-400 uppercase tracking-widest font-bold">
                              ★ Featured
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-[var(--tone-1f1f1f)] text-[var(--tone-d4d4d4)] text-[10px] uppercase font-semibold">
                            {p.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold text-[var(--tone-ffffff)]">
                          {formatCurrency(p.price)}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-[var(--tone-d4d4d4)]">
                          {p.sizes.join(', ')}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              p.stock >= 10
                                ? 'text-emerald-400 bg-emerald-950/40'
                                : p.stock > 0
                                ? 'text-amber-400 bg-amber-950/40'
                                : 'text-red-400 bg-red-950/40'
                            }`}
                          >
                            {p.stock} units
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingProduct(p);
                                setIsProductModalOpen(true);
                              }}
                              className="p-1.5 text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] rounded hover:bg-[var(--tone-252525)]"
                              title="Edit product"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="p-1.5 text-[var(--tone-a3a3a3)] hover:text-red-400 rounded hover:bg-[var(--tone-252525)]"
                              title="Delete product"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="space-y-6 animate-fade-in">
            {/* Filter by status */}
            <div className="flex flex-wrap items-center gap-2 bg-[var(--tone-141414)] p-4 border border-[var(--tone-242424)] text-xs">
              <span className="text-[var(--tone-a3a3a3)] uppercase tracking-wider text-[11px] mr-2">Filter Status:</span>
              {['All', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setOrderStatusFilter(st)}
                  className={`px-2.5 py-1 uppercase text-[10px] font-semibold transition-colors ${
                    orderStatusFilter === st
                      ? 'bg-[var(--tone-ffffff)] text-[var(--tone-000000)]'
                      : 'bg-[var(--tone-1f1f1f)] text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] border border-[var(--tone-2e2e2e)]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--tone-222222)] text-[var(--tone-a3a3a3)] text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-3">Order Number</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Customer & Contact</th>
                    <th className="py-3 px-3">Rwanda Destination</th>
                    <th className="py-3 px-3">Total (RWF)</th>
                    <th className="py-3 px-3">Payment Status</th>
                    <th className="py-3 px-3">Order Status (Live Sync)</th>
                    <th className="py-3 px-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--tone-1f1f1f)]">
                  {orders
                    .filter((o) => orderStatusFilter === 'All' || o.status === orderStatusFilter)
                    .map((ord) => (
                      <tr key={ord.id} className="hover:bg-[var(--tone-1a1a1a)] transition-colors">
                        <td className="py-3.5 px-3 font-mono font-bold text-[var(--tone-ffffff)]">
                          #{ord.order_number}
                        </td>
                        <td className="py-3.5 px-3 text-[var(--tone-a3a3a3)] text-[11px]">
                          {new Date(ord.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-semibold text-[var(--tone-ffffff)]">{ord.customer_name}</div>
                          <div className="text-[11px] text-[var(--tone-a3a3a3)] font-mono">{ord.customer_phone}</div>
                        </td>
                        <td className="py-3.5 px-3 text-[var(--tone-d4d4d4)]">
                          <div>{ord.delivery_sector}, {ord.delivery_district}</div>
                          <div className="text-[10px] text-[var(--tone-737373)] line-clamp-1">{ord.delivery_street}</div>
                        </td>
                        <td className="py-3.5 px-3 font-bold text-[var(--tone-ffffff)]">
                          {formatCurrency(ord.total)}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="text-xs font-semibold">{ord.payment_status}{ord.review_required?' · REVIEW REQUIRED':''}</span>
                        </td>
                        <td className="py-3.5 px-3">
                          <select
                            value={ord.status}
                            onChange={(e) =>
                              handleUpdateOrderStatus(ord.id, e.target.value as OrderStatus)
                            }
                            className="bg-[var(--tone-202020)] border border-[var(--tone-333333)] text-xs font-semibold px-2 py-1 text-[var(--tone-ffffff)] rounded"
                          >
                            <option value="PENDING">PENDING</option>
                            <option value="CONFIRMED">CONFIRMED</option>
                            <option value="PROCESSING">PROCESSING</option>
                            <option value="SHIPPED">SHIPPED</option>
                            <option value="DELIVERED">DELIVERED</option>
                            <option value="CANCELLED">CANCELLED</option>
                          </select>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <button
                            onClick={() => setViewingOrder(ord)}
                            className="px-2.5 py-1 text-[11px] uppercase tracking-wider bg-[var(--tone-222222)] hover:bg-[var(--tone-333333)] text-[var(--tone-e5e5e5)] border border-[var(--tone-333333)] rounded"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. CUSTOM TAILORING TAB */}
        {activeTab === 'custom' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] p-6">
              <h3 className="font-heading text-base font-bold text-[var(--tone-ffffff)] uppercase tracking-wider mb-1">
                Customs Requests ({customRequests.length})
              </h3>
              <p className="text-xs text-[var(--tone-a3a3a3)]">
                Review customers’ clothing ideas, measurements and reference images, and manage each request from NEW to COMPLETED.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {customRequests.map((req) => (
                <div key={req.id} className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] p-5 space-y-4">
                  <div className="flex justify-between items-start border-b border-[var(--tone-222222)] pb-3">
                    <div>
                      <span className="font-mono text-[10px] text-[var(--tone-737373)] font-bold block">
                        #{req.request_number}
                      </span>
                      <h4 className="font-heading text-sm font-bold text-[var(--tone-ffffff)] mt-0.5">
                        {req.clothing_type}
                      </h4>
                      <div className="text-[11px] text-[var(--tone-a3a3a3)]">
                        Client: <strong className="text-[var(--tone-ffffff)]">{req.full_name}</strong> ({req.phone})
                      </div>
                    </div>
                    <select
                      value={req.status}
                      onChange={(e) =>
                        handleUpdateCustomStatus(req.id, e.target.value as CustomRequestStatus)
                      }
                      className="bg-[var(--tone-202020)] border border-[var(--tone-333333)] text-[10px] font-bold text-amber-400 px-2 py-1 rounded"
                    >
                      <option value="NEW">NEW</option>
                      <option value="CONTACTED">CONTACTED</option>
                      <option value="DESIGNING">DESIGNING</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="IN PRODUCTION">IN PRODUCTION</option>
                      <option value="READY">READY</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-[var(--tone-737373)] block text-[10px] uppercase">Occasion & Deadline:</span>
                      <span className="text-[var(--tone-d4d4d4)] font-medium">
                        {req.occasion || 'General Bespoke'} · Deadline: {req.preferred_deadline}
                      </span>
                    </div>

                    <div>
                      <span className="text-[var(--tone-737373)] block text-[10px] uppercase">Preferred Color:</span>
                      <span className="text-[var(--tone-d4d4d4)] font-medium">{req.preferred_color}</span>
                    </div>

                    <div>
                      <span className="text-[var(--tone-737373)] block text-[10px] uppercase">Measurements:</span>
                      <p className="text-[var(--tone-d4d4d4)] bg-[var(--tone-0f0f0f)] p-2 border border-[var(--tone-222222)] rounded text-[11px] font-mono">
                        {req.measurements || 'Client will visit Kigali atelier for fitting'}
                      </p>
                    </div>

                    <div>
                      <span className="text-[var(--tone-737373)] block text-[10px] uppercase">Design Brief:</span>
                      <p className="text-[var(--tone-a3a3a3)] text-xs italic leading-relaxed">
                        &ldquo;{req.description}&rdquo;
                      </p>
                    </div>

                    {req.media_id && (
                      <div>
                        <span className="text-[var(--tone-737373)] block text-[10px] uppercase mb-2">Reference image:</span>
                        <PrivateImage id={req.media_id} alt={`Design inspiration for ${req.clothing_type}`} />
                      </div>
                    )}

                    {req.notes && (
                      <div className="pt-2 border-t border-[var(--tone-1c1c1c)]">
                        <span className="text-amber-400 font-semibold block text-[10px] uppercase">Tailor Note:</span>
                        <span className="text-[var(--tone-d4d4d4)] text-xs">{req.notes}</span>
                      </div>
                    )}
                    <CustomNotes request={req} onSave={notes=>handleUpdateCustomStatus(req.id,req.status,notes)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. INVENTORY & STOCK TAB */}
        {activeTab === 'inventory' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] p-5 flex justify-between items-center">
              <div>
                <h3 className="font-heading text-base font-bold text-[var(--tone-ffffff)] uppercase tracking-wider">
                  Atelier Inventory & Stock Controls
                </h3>
                <p className="text-xs text-[var(--tone-a3a3a3)] mt-0.5">
                  Adjust available inventory units across all garment designs.
                </p>
              </div>
              <span className="text-xs text-[var(--tone-a3a3a3)]">
                Low threshold: &lt; 10 units
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p) => (
                <div key={p.id} className="bg-[var(--tone-141414)] border border-[var(--tone-242424)] p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <h4 className="text-xs font-semibold text-[var(--tone-ffffff)] line-clamp-1">{p.name}</h4>
                      <span className="text-[10px] font-mono text-[var(--tone-737373)]">{p.sku}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-[var(--tone-a3a3a3)] block mt-0.5">
                      {p.category} · {formatCurrency(p.price)}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--tone-222222)] flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase text-[var(--tone-737373)] block">Available</span>
                      <span
                        className={`text-sm font-bold ${
                          p.stock >= 10 ? 'text-[var(--tone-ffffff)]' : 'text-red-400'
                        }`}
                      >
                        {p.stock} units
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-[var(--tone-1c1c1c)] border border-[var(--tone-2a2a2a)] p-1 rounded">
                      <button
                        onClick={() => handleAdjustStock(p, -1)}
                        aria-label={`Remove 1 unit from ${p.name}`}
                        className="px-2 py-0.5 text-xs text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-252525)]"
                      >
                        -
                      </button>
                      <button
                        onClick={() => handleAdjustStock(p, 1)}
                        aria-label={`Add 1 unit to ${p.name}`}
                        className="px-2 py-0.5 text-xs text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-252525)]"
                      >
                        +
                      </button>
                      <button
                        onClick={() => handleAdjustStock(p, 5)}
                        aria-label={`Add 5 units to ${p.name}`}
                        className="px-2 py-0.5 text-[10px] text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-252525)]"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {['payments','settings'].includes(activeTab) && <PaymentsPanel />}
      </main>

      {/* Product Add / Edit Modal */}
      {isProductModalOpen && (
        <ProductEditModal
          product={editingProduct}
          onClose={() => setIsProductModalOpen(false)}
          onSave={async (saved) => {
            if (editingProduct) {
              const updated=await updateProduct(editingProduct.id,{...saved,version:editingProduct.version});
              setProducts(prev=>upsert(prev,updated));
            } else {
              const created = await createProduct(saved);
              setProducts((prev) => upsert(prev,created));
            }
            setIsProductModalOpen(false);
          }}
        />
      )}

      {/* Order Detail Modal */}
      {viewingOrder && (
        <OrderDetailModal
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
          onUpdateStatus={handleUpdateOrderStatus}
        />
      )}
    </div>
  );
};

function CustomNotes({request,onSave}:{request:CustomClothingRequest;onSave:(notes:string)=>Promise<void>}){
  const [notes,setNotes]=useState(request.notes || ''),[busy,setBusy]=useState(false);
  return <div className="space-y-2 text-xs"><label>Customer-visible tailor note<textarea className="block w-full bg-transparent border border-[var(--tone-333333)] p-2 mt-1" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={4000}/></label><button disabled={busy} className="underline" onClick={async()=>{setBusy(true);try{await onSave(notes);}finally{setBusy(false);}}}>Save tailor note</button></div>;
}

// Sub-component: Product Edit Modal
function ProductEditModal({
  product,
  onClose,
  onSave
}: {
  product: Product | null;
  onClose: () => void;
  onSave: (data: Partial<Product>) => Promise<void>;
}) {
  const [name, setName] = useState(product?.name || '');
  const [tagline, setTagline] = useState(product?.tagline || '');
  const [category, setCategory] = useState<CategoryType>(product?.category || 'Men');
  const [subcategory, setSubcategory] = useState(product?.subcategory || 'Jackets');
  const [price, setPrice] = useState(product?.price ?? 85000);
  const [stock, setStock] = useState(product?.stock ?? 15);
  const [gender,setGender]=useState<Product['gender']>(product?.gender || 'men');
  const [colors,setColors]=useState((product?.colors || [{name:'Obsidian Black',hex:'#0D0D0D'},{name:'Pure Chalk',hex:'#F0F0F0'}]).map(c=>c.name+' | '+c.hex).join('\n'));
  const [sku, setSku] = useState(product?.sku || `LEN-${category[0]}-${Date.now().toString().slice(-4)}`);
  const [description, setDescription] = useState(product?.description || '');
  const [materials, setMaterials] = useState(product?.materials || '');
  const [sizesInput, setSizesInput] = useState(product?.sizes.join(', ') || 'S, M, L, XL');
  const [imageUrl, setImageUrl] = useState(product?.image_url || '');
  const [isFeatured, setIsFeatured] = useState(product?.is_featured ?? true);
  const [isNewArrival, setIsNewArrival] = useState(product?.is_new_arrival ?? true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const sizes = sizesInput.split(',').map((s) => s.trim()).filter(Boolean);
      await onSave({
        name,
        tagline,
        category: category === 'All' ? 'Men' : category,
        subcategory,
        price: Number(price),
        stock: Number(stock),
        sku,
        description,
        materials,
        sizes,
        image_url: imageUrl,
        is_featured: isFeatured,
        is_new_arrival: isNewArrival,
        colors:colors.split('\n').filter(Boolean).map(line=>{const [name,hex]=line.split('|').map(s=>s.trim());return {name,hex};}),
        gender
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save garment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[var(--tone-121212)] border border-[var(--tone-2b2b2b)] w-full max-w-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative text-[var(--tone-f5f5f5)] animate-fade-in">
        <div className="flex justify-between items-center border-b border-[var(--tone-222222)] pb-4">
          <h3 className="font-heading text-lg font-bold text-[var(--tone-ffffff)] uppercase tracking-wider">
            {product ? 'Edit Garment' : 'Create New Garment'}
          </h3>
          <button onClick={onClose} className="text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {saveError && <p role="alert" className="text-red-300">{saveError}</p>}
          <label className="block">Tagline<input className="block w-full bg-transparent border border-[var(--tone-333333)] p-2" value={tagline} onChange={e=>setTagline(e.target.value)}/></label>
          <label className="block">Gender<select className="block w-full bg-[var(--tone-181818)] border border-[var(--tone-333333)] p-2" value={gender} onChange={e=>setGender(e.target.value as Product['gender'])}>{['men','women','unisex'].map(g=><option key={g}>{g}</option>)}</select></label>
          <label className="block">Colors: one name | #hex per line<textarea className="block w-full bg-transparent border border-[var(--tone-333333)] p-2" value={colors} onChange={e=>setColors(e.target.value)} rows={3}/></label>
          <div className="flex gap-5"><label><input type="checkbox" checked={isFeatured} onChange={e=>setIsFeatured(e.target.checked)}/> Featured</label><label><input type="checkbox" checked={isNewArrival} onChange={e=>setIsNewArrival(e.target.checked)}/> New arrival</label></div>
          <label className="block">Upload product photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setSaving(true);try{const uploaded=await uploadImage(file,'product');setImageUrl(uploaded.url);}catch(error){setSaveError((error as Error).message);}finally{setSaving(false);}}}/></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                Garment Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Minimalist Peak Blazer"
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded focus:outline-none focus:border-[var(--tone-ffffff)]"
              />
            </div>

            <div>
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                SKU *
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded font-mono"
              />
            </div>

            <div>
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryType)}
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded"
              >
                <option value="Men">Men</option>
                <option value="Women">Women</option>
                <option value="Unisex">Unisex</option>
                <option value="Culture">Traditional / Culture</option>
              </select>
            </div>

            <div>
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                Subcategory *
              </label>
              <input
                type="text"
                required
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g. Shirts, Jackets, Umushanana"
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded"
              />
            </div>

            <div>
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                Price in RWF *
              </label>
              <input
                type="number"
                required
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                placeholder="e.g. 85000"
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded font-mono"
              />
            </div>

            <div>
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                Stock in Atelier *
              </label>
              <input
                type="number"
                required
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                Sizes (Comma separated)
              </label>
              <input
                type="text"
                value={sizesInput}
                onChange={(e) => setSizesInput(e.target.value)}
                placeholder="e.g. S, M, L, XL, XXL"
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                Image Link or Upload (Leave empty to keep minimalist placeholder ready for user)
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... or upload below"
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                Garment Description & Fit
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                Textile & Composition
              </label>
              <input
                type="text"
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                placeholder="e.g. 100% Egyptian Cotton, Raw Silk"
                className="w-full bg-[var(--tone-181818)] border border-[var(--tone-2e2e2e)] px-3 py-2 text-[var(--tone-ffffff)] rounded"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-3 border-t border-[var(--tone-222222)]">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[var(--tone-ffffff)] hover:bg-[var(--tone-e5e5e5)] text-[var(--tone-000000)] py-2.5 font-bold uppercase tracking-wider rounded"
            >
              {saving ? 'Saving...' : 'Save Garment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-[var(--tone-333333)] text-[var(--tone-d4d4d4)] hover:text-[var(--tone-ffffff)] rounded"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Sub-component: Order Detail Modal
function OrderDetailModal({
  order,
  onClose,
  onUpdateStatus,
}: {
  order: Order;
  onClose: () => void;
  onUpdateStatus: (id: string, st: OrderStatus) => void;
}) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: 'RWF',
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[var(--tone-121212)] border border-[var(--tone-2b2b2b)] w-full max-w-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative text-[var(--tone-f5f5f5)] animate-fade-in">
        <div className="flex justify-between items-start border-b border-[var(--tone-222222)] pb-4">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[var(--tone-a3a3a3)]">Order Management</span>
            <h3 className="font-heading text-xl font-bold text-[var(--tone-ffffff)]">
              #{order.order_number}
            </h3>
            <span className="text-xs text-[var(--tone-a3a3a3)] font-mono">
              Placed {new Date(order.created_at).toLocaleString()}
            </span>
          </div>
          <button onClick={onClose} className="text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]">
            <X size={20} />
          </button>
        </div>

        {/* Status quick control */}
        <div className="bg-[var(--tone-181818)] p-4 border border-[var(--tone-262626)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
          <div>
            <span className="text-[var(--tone-a3a3a3)] block text-[10px] uppercase">Advance Order Status</span>
            <span className="text-[var(--tone-ffffff)] font-semibold">Instant Real-Time Sync</span>
          </div>
          <select
            value={order.status}
            onChange={(e) => onUpdateStatus(order.id, e.target.value as OrderStatus)}
            className="bg-[var(--tone-000000)] border border-[var(--tone-333333)] text-xs font-bold px-3 py-1.5 text-[var(--tone-ffffff)] rounded"
          >
            <option value="PENDING">PENDING</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="SHIPPED">SHIPPED</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {/* Customer & Rwanda Address */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="bg-[var(--tone-161616)] p-4 border border-[var(--tone-242424)] space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[var(--tone-a3a3a3)] font-semibold block mb-1">
              Customer Details
            </span>
            <div className="text-[var(--tone-ffffff)] font-medium">{order.customer_name}</div>
            <div className="text-[var(--tone-a3a3a3)]">{order.customer_email}</div>
            <div className="text-[var(--tone-d4d4d4)] font-mono">{order.customer_phone}</div>
          </div>

          <div className="bg-[var(--tone-161616)] p-4 border border-[var(--tone-242424)] space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[var(--tone-a3a3a3)] font-semibold block mb-1">
              Rwanda Delivery Location
            </span>
            <div className="text-[var(--tone-ffffff)]">
              {order.delivery_sector}, {order.delivery_district}
            </div>
            <div className="text-[var(--tone-a3a3a3)]">{order.delivery_province}</div>
            <div className="text-[var(--tone-d4d4d4)]">{order.delivery_street}</div>
            {order.delivery_notes && (
              <div className="text-[var(--tone-737373)] italic mt-1">&ldquo;{order.delivery_notes}&rdquo;</div>
            )}
          </div>
        </div>

        {/* Items List */}
        <div>
          <span className="text-xs uppercase tracking-wider text-[var(--tone-a3a3a3)] font-semibold block mb-2">
            Items in Order ({order.items.length})
          </span>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {order.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 bg-[var(--tone-161616)] border border-[var(--tone-242424)] text-xs"
              >
                <div>
                  <div className="font-semibold text-[var(--tone-ffffff)]">{item.product_name}</div>
                  <div className="text-[10px] text-[var(--tone-a3a3a3)]">
                    Size: {item.size} · Color: {item.color} · Qty: {item.quantity}
                  </div>
                </div>
                <div className="text-right font-semibold text-[var(--tone-ffffff)]">
                  {formatCurrency(item.price * item.quantity)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer information */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-[var(--tone-222222)] gap-3">
          <div className="text-xs">
            <span className="text-[var(--tone-a3a3a3)]">Order Total: </span>
            <span className="font-bold text-base text-[var(--tone-ffffff)] ml-1">{formatCurrency(order.total)}</span>
          </div>

        </div>
      </div>
    </div>
  );
}

