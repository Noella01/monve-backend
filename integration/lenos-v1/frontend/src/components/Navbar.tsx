import React, { useEffect, useState } from 'react';
import { ShoppingBag, Heart, Search, Menu, X, ArrowUpRight, UserRound, Sun, Moon } from 'lucide-react';
import type { Theme } from '../useTheme';
import type { CategoryType } from '../types';

interface NavbarProps {
  customerName?: string;
  theme: Theme;
  onToggleTheme: () => void;
  currentRole: 'customer' | 'admin';
  onSwitchRole: (role: 'customer' | 'admin') => void;
  activeView: string;
  onNavigate: (view: string, categoryFilter?: CategoryType) => void;
  cartCount: number;
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenSearch: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ customerName, theme, onToggleTheme, activeView, onNavigate, cartCount, wishlistCount, onOpenCart, onOpenWishlist, onOpenSearch }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = (view: string, category?: CategoryType) => { onNavigate(view, category); setMobileMenuOpen(false); };
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  return (
    <header className={`aurie-header ${activeView === 'home' ? 'aurie-header-home' : ''}`}>
      <div className="aurie-nav-row">
        <button className="aurie-menu-toggle aurie-icon-button" aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileMenuOpen} aria-controls="aurie-mobile-menu" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <nav className="aurie-nav-links" aria-label="Collections">
          <button onClick={() => navigate('shop', 'Men')}>Men</button><button onClick={() => navigate('shop', 'Women')}>Women</button><button onClick={() => navigate('shop', 'Unisex')}>Unisex</button><button onClick={() => navigate('shop', 'Culture')}>Culture</button>
          <button aria-current={activeView === 'custom' ? 'page' : undefined} onClick={() => navigate('custom')}>Customs</button>
        </nav>
        <button className="aurie-brand" aria-label="Aurie home" onClick={() => navigate('home')}>AURIE</button>
        <div className="aurie-nav-actions">
          <button aria-label="Search collection" onClick={onOpenSearch}><Search size={17} /><span>Search</span></button>
          <button className="aurie-desktop-action" aria-label={customerName ? 'My account' : 'Log in'} onClick={() => navigate(customerName ? 'account' : 'login')}><UserRound size={17} /><span>{customerName ? 'Account' : 'Log in'}</span></button>
          <button className="aurie-desktop-action" aria-label={`Wishlist (${wishlistCount})`} onClick={onOpenWishlist}><Heart size={17} /><span>Wishlist{wishlistCount > 0 ? ` (${wishlistCount})` : ''}</span>{wishlistCount > 0 && <small className="aurie-icon-count">{wishlistCount}</small>}</button>
          <button aria-label={`Cart (${cartCount})`} onClick={onOpenCart}><ShoppingBag size={17} /><span>Cart ({cartCount})</span>{cartCount > 0 && <small className="aurie-icon-count">{cartCount}</small>}</button>
          <button className="aurie-desktop-action aurie-theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </div>
      {mobileMenuOpen && <nav id="aurie-mobile-menu" className="aurie-mobile-menu" aria-label="Mobile navigation">
        <button onClick={() => navigate('shop', 'All')}>Shop all <ArrowUpRight size={18} /></button>
        {(['Men', 'Women', 'Unisex', 'Culture'] as CategoryType[]).map(category => <button key={category} onClick={() => navigate('shop', category)}>{category}<ArrowUpRight size={18} /></button>)}
        <button aria-current={activeView === 'custom' ? 'page' : undefined} onClick={() => navigate('custom')}>Customs <ArrowUpRight size={18} /></button>
        <div className="aurie-mobile-utilities">
          <button onClick={() => navigate(customerName ? 'account' : 'login')}><UserRound size={17} />{customerName ? 'My account' : 'Log in / Sign up'}</button>
          <button onClick={() => { onOpenWishlist(); setMobileMenuOpen(false); }}><Heart size={17} />Wishlist ({wishlistCount})</button>
          <button onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}{theme === 'dark' ? 'Light' : 'Dark'} mode</button>
        </div>
      </nav>}
    </header>
  );
};
