import React from 'react';
import { ArrowRight, ArrowUpRight, Truck, Scissors, BadgeCheck, LockKeyhole, Image as ImageIcon } from 'lucide-react';
import { FashionHero } from '../components/FashionHero';
import { ProductCard } from '../components/ProductCard';
import type { Product, CategoryType, ProductColor } from '../types';

interface HomeViewProps {
  products: Product[];
  wishlistIds: string[];
  onToggleWishlist: (p: Product) => void;
  onQuickView: (p: Product) => void;
  onSelectProduct: (p: Product) => void;
  onAddToCart: (p: Product, size: string, color: ProductColor) => void;
  onNavigate: (view: string, cat?: CategoryType) => void;
}
const collections: { name: CategoryType; description: string }[] = [
  { name: 'Men', description: 'Everyday, elevated.' },
  { name: 'Women', description: 'Effortless by nature.' },
  { name: 'Culture', description: 'Rooted in who we are.' },
];
export const HomeView: React.FC<HomeViewProps> = ({ products, wishlistIds, onToggleWishlist, onQuickView, onSelectProduct, onAddToCart, onNavigate }) => {
  const featured = [...products.filter(product => product.is_featured), ...products.filter(product => !product.is_featured)].slice(0, 4);
  return (
    <div className="aurie-home">
      <FashionHero onNavigate={onNavigate} />
      <section className="aurie-collection-strip" aria-label="Shop the collections">
        {collections.map(collection => <button className="aurie-collection" key={collection.name} onClick={() => onNavigate('shop', collection.name)}>
          <div className="aurie-collection-image aurie-photo-placeholder" aria-hidden="true"><ImageIcon size={24} strokeWidth={1} /></div>
          <div><h2>{collection.name}</h2><p>{collection.description}</p><span>Shop {collection.name} <ArrowRight size={13} /></span></div>
          <ArrowUpRight className="aurie-collection-arrow" size={23} strokeWidth={1} />
        </button>)}
      </section>
      <section className="aurie-season" id="new-season" aria-labelledby="aurie-season-title">
        <div className="aurie-season-copy"><p className="aurie-eyebrow">A NEW SEASON. A NEW FEELING.</p><h2 id="aurie-season-title">NEW<br />ENERGY.</h2><p>Fresh silhouettes.<br />A style that's entirely yours.</p><button className="aurie-button" onClick={() => onNavigate('shop', 'All')}>Explore collection <ArrowUpRight size={15} /></button></div>
        <span className="aurie-season-caption">THE EVERYDAY, REIMAGINED.</span>
      </section>
      <section className="aurie-benefits" aria-label="The Aurie experience">
        <div><Truck size={27} strokeWidth={1.2} /><p><strong>FROM KIGALI, WITH CARE</strong><span>Our atelier to your wardrobe</span></p></div>
        <div><Scissors size={27} strokeWidth={1.2} /><p><strong>MADE FOR YOU</strong><span>Personal, made-to-measure pieces</span></p></div>
        <div><BadgeCheck size={27} strokeWidth={1.2} /><p><strong>DETAILS THAT MATTER</strong><span>Considered cuts. Beautiful fabrics.</span></p></div>
        <div><LockKeyhole size={27} strokeWidth={1.2} /><p><strong>YOUR WAY TO PAY</strong><span>Cards & mobile money</span></p></div>
      </section>
      <section className="aurie-featured" id="aurie-edit" aria-labelledby="aurie-edit-title">
        <div className="aurie-section-heading"><div><p className="aurie-eyebrow">GOOD STYLE STARTS HERE</p><h2 id="aurie-edit-title">THE AURIE EDIT</h2></div><button className="aurie-text-link" onClick={() => onNavigate('shop', 'All')}>View all <ArrowUpRight size={16} /></button></div>
        {featured.length > 0 ? <div className="aurie-product-grid">{featured.map(product => <ProductCard key={product.id} product={product} isWishlisted={wishlistIds.includes(product.id)} onToggleWishlist={onToggleWishlist} onQuickView={onQuickView} onSelectProduct={onSelectProduct} onAddToCart={onAddToCart} />)}</div> : <p className="aurie-empty-edit">A new chapter is taking shape. Explore our custom tailoring while the next collection arrives.</p>}
      </section>
      <section className="aurie-atelier" aria-labelledby="aurie-atelier-title">
        <div className="aurie-atelier-image aurie-photo-placeholder"><ImageIcon size={40} strokeWidth={1} aria-hidden="true" /><p>Photo coming soon</p></div>
        <div className="aurie-atelier-copy"><p className="aurie-eyebrow">YOUR IDEAS. OUR CRAFT.</p><h2 id="aurie-atelier-title">CUSTOMS.<br />MADE FOR YOU.</h2><p>Clothes made around you. From everyday shirts and matching sets to dresses, suits and cultural pieces, share your idea and let us create something personal. Your style, your fit, your details.</p><div><button className="aurie-button" onClick={() => onNavigate('custom')}>Explore Customs <ArrowUpRight size={15} /></button><button className="aurie-text-link" onClick={() => onNavigate('shop', 'Culture')}>Explore our roots <ArrowRight size={14} /></button></div></div>
      </section>
    </div>
  );
};
