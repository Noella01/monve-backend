import React, { useState } from 'react';
import { Heart, Eye, Plus, Check } from 'lucide-react';
import type { Product, ProductColor } from '../types';
import { ImagePlaceholder } from './ImagePlaceholder';
interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, size: string, color: ProductColor) => void;
}
export const ProductCard: React.FC<ProductCardProps> = ({ product, isWishlisted, onToggleWishlist, onQuickView, onSelectProduct, onAddToCart }) => {
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] || 'M');
  const [selectedColor, setSelectedColor] = useState<ProductColor>(product.colors[0] || { name: 'Black', hex: '#000000' });
  const [added, setAdded] = useState(false);
  const price = new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(product.price);
  return (
    <article className="aurie-product">
      <div className="aurie-product-image">
        <button onClick={() => onSelectProduct(product)} aria-label={`View ${product.name}`}><ImagePlaceholder imageUrl={product.image_url} alt={product.name} category={product.category} aspectRatio="portrait" allowEdit={false} /></button>
        {(product.is_new_arrival || product.category === 'Culture') && <span className="aurie-product-badge">{product.category === 'Culture' ? 'Heritage' : 'New arrival'}</span>}
        <button className="aurie-product-heart" aria-label={`${isWishlisted ? 'Remove from' : 'Add to'} wishlist: ${product.name}`} aria-pressed={isWishlisted} onClick={() => onToggleWishlist(product)}><Heart size={15} fill={isWishlisted ? 'currentColor' : 'none'} strokeWidth={1.5} /></button>
        <button className="aurie-product-quick" onClick={() => onQuickView(product)}><Eye size={13} />Quick view</button>
      </div>
      <div className="aurie-product-info">
        <p className="aurie-product-category">{product.category} / {product.subcategory}</p>
        <button className="aurie-product-title" onClick={() => onSelectProduct(product)}>{product.name}</button>
        <div className="aurie-product-options">
          <div className="aurie-product-sizes" aria-label={`Size for ${product.name}`}>{product.sizes.map(size => <button key={size} aria-pressed={selectedSize === size} onClick={() => setSelectedSize(size)} title={size}>{size === 'Custom / Made-to-measure' ? 'Custom' : size}</button>)}</div>
          <div className="aurie-product-colors" aria-label={`Color for ${product.name}`}>{product.colors.map(color => <button key={color.name} style={{ backgroundColor: color.hex }} aria-label={color.name} aria-pressed={selectedColor.name === color.name} title={color.name} onClick={() => setSelectedColor(color)} />)}</div>
        </div>
        <div className="aurie-product-price-row"><strong>{price}</strong><button aria-label={`Add ${product.name} to cart`} disabled={product.stock <= 0} onClick={() => { onAddToCart(product, selectedSize, selectedColor); setAdded(true); setTimeout(() => setAdded(false), 1200); }}>{added ? <Check size={15} /> : <Plus size={15} />}{product.stock <= 0 ? 'Sold out' : added ? 'Added' : 'Add'}</button></div>
      </div>
    </article>
  );
};
