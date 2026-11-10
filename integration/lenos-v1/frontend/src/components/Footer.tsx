import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { CategoryType } from '../types';
interface FooterProps {
  onNavigate: (view: string, cat?: CategoryType) => void;
  onSwitchRole: (role: 'customer' | 'admin') => void;
  currentRole: 'customer' | 'admin';
}
export const Footer: React.FC<FooterProps> = ({ onNavigate, onSwitchRole, currentRole }) => (
  <footer className="aurie-footer">
    <div className="aurie-footer-top"><div className="aurie-footer-manifesto"><p className="aurie-eyebrow">STYLE WITH NO LIMITS.</p><h2>Wear what<br />moves you.</h2><p>Contemporary form. Cultural soul.<br />From Kigali, Rwanda.</p></div>
      <div><h3>Explore</h3>{(['Men', 'Women', 'Unisex', 'Culture'] as CategoryType[]).map(category => <button key={category} onClick={() => onNavigate('shop', category)}>{category}<ArrowUpRight size={12} /></button>)}</div>
      <div><h3>Made personal</h3><button onClick={() => onNavigate('custom')}>Customs<ArrowUpRight size={12} /></button><button onClick={() => onNavigate('account')}>My account<ArrowUpRight size={12} /></button><button onClick={() => onNavigate('account')}>My orders<ArrowUpRight size={12} /></button><button onClick={() => onNavigate('signup')}>Join Aurie<ArrowUpRight size={12} /></button></div>
    </div>
    <div className="aurie-footer-bottom"><span>© {new Date().getFullYear()} AURIE. ALL RIGHTS RESERVED.</span><span>KIGALI, RWANDA</span><button onClick={() => onSwitchRole(currentRole === 'customer' ? 'admin' : 'customer')}>{currentRole === 'customer' ? 'Admin portal' : 'Storefront'}<ArrowUpRight size={12} /></button></div>
  </footer>
);
