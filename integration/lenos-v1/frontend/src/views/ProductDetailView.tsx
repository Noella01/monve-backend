import React, { useState } from 'react';
import { ArrowLeft, Heart, ShoppingBag, Shield, Check, Ruler, Truck, RotateCcw } from 'lucide-react';
import { Product, ProductColor } from '../types';
import { ImagePlaceholder } from '../components/ImagePlaceholder';

interface ProductDetailViewProps {
  product: Product;
  onBack: () => void;
  isWishlisted: boolean;
  onToggleWishlist: (p: Product) => void;
  onAddToCart: (p: Product, size: string, color: ProductColor, quantity: number) => void;
  onBuyNow: (p: Product, size: string, color: ProductColor, quantity: number) => void;
  onSelectRelated: (p: Product) => void;
  relatedProducts: Product[];
}

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  onBack,
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  onBuyNow,
  onSelectRelated,
  relatedProducts,
}) => {
  const [selectedSize, setSelectedSize] = useState<string>(product.sizes[0] || 'M');
  const [selectedColor, setSelectedColor] = useState<ProductColor>(
    product.colors[0] || { name: 'Black', hex: '#000' }
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [addedNotice, setAddedNotice] = useState(false);

  const formattedPrice = new Intl.NumberFormat('en-RW', {
    style: 'currency',
    currency: 'RWF',
    maximumFractionDigits: 0
  }).format(product.price);

  const handleAdd = () => {
    onAddToCart(product, selectedSize, selectedColor, quantity);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 1800);
  };

  const handleBuy = () => {
    onBuyNow(product, selectedSize, selectedColor, quantity);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-16">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="text-xs uppercase tracking-widest text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] flex items-center gap-2 transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Back to Collection</span>
      </button>

      {/* Main Product Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
        {/* Left: Product Gallery Placeholder (supports upload) */}
        <div className="space-y-4">
          <div className="bg-[var(--tone-151515)] border border-[var(--tone-262626)] p-4 sm:p-6 overflow-hidden">
            <ImagePlaceholder
              imageUrl={product.image_url}
              alt={product.name}
              category={product.category}
              aspectRatio="portrait"
              allowEdit={false}
              className="w-full max-w-lg mx-auto"
            />
          </div>
        </div>

        {/* Right: Product Details & Purchase Form */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-[var(--tone-888888)] mb-1">
              <span>{product.category} · {product.subcategory}</span>
              <span className="font-mono text-[var(--tone-737373)]">SKU: {product.sku}</span>
            </div>

            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[var(--tone-ffffff)] tracking-wide">
              {product.name}
            </h1>

            <div className="font-heading text-xl sm:text-2xl font-bold text-[var(--tone-ffffff)] mt-3">
              {formattedPrice}
            </div>

            {product.tagline && (
              <p className="text-xs text-[var(--tone-a3a3a3)] mt-2 font-light italic">
                {product.tagline}
              </p>
            )}
          </div>

          <div className="border-t border-[var(--tone-222222)] pt-6 space-y-6">
            {/* Color Swatches */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="uppercase tracking-wider text-[var(--tone-a3a3a3)]">
                  Color: <strong className="text-[var(--tone-ffffff)]">{selectedColor.name}</strong>
                </span>
              </div>
              <div className="flex items-center gap-3">
                {product.colors.map((color) => (
                  <button
                    key={color.name}
                    onClick={() => setSelectedColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      selectedColor.name === color.name
                        ? 'border-[var(--tone-ffffff)] scale-110'
                        : 'border-[var(--tone-333333)] hover:border-[var(--tone-737373)]'
                    }`}
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            {/* Size Selector & Size Guide */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="uppercase tracking-wider text-[var(--tone-a3a3a3)]">
                  Size: <strong className="text-[var(--tone-ffffff)]">{selectedSize}</strong>
                </span>
                <button
                  onClick={() => setShowSizeGuide(true)}
                  className="text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] flex items-center gap-1 text-[11px] underline underline-offset-4"
                >
                  <Ruler size={12} />
                  <span>Size Guide</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className={`text-xs px-4 py-2 border transition-all ${
                      selectedSize === size
                        ? 'border-[var(--tone-ffffff)] bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-bold'
                        : 'border-[var(--tone-2e2e2e)] text-[var(--tone-d4d4d4)] hover:border-[var(--tone-a3a3a3)]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity & Stock Status */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="uppercase tracking-wider text-[var(--tone-a3a3a3)]">Quantity</span>
                <span className={`text-[11px] ${product.stock > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {product.stock > 0 ? `✓ Available (${product.stock} in atelier)` : 'Sold Out'}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center border border-[var(--tone-2e2e2e)] bg-[var(--tone-141414)]">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-3.5 py-2 text-xs text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]"
                  >
                    -
                  </button>
                  <span className="px-4 text-xs font-semibold text-[var(--tone-ffffff)]">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                    className="px-3.5 py-2 text-xs text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]"
                  >
                    +
                  </button>
                </div>

                {/* Wishlist Button */}
                <button
                  onClick={() => onToggleWishlist(product)}
                  className={`p-2.5 border rounded-none flex items-center gap-2 text-xs uppercase tracking-wider transition-colors ${
                    isWishlisted
                      ? 'border-red-500/50 bg-red-950/20 text-red-400'
                      : 'border-[var(--tone-2e2e2e)] text-[var(--tone-d4d4d4)] hover:border-[var(--tone-a3a3a3)]'
                  }`}
                >
                  <Heart size={16} className={isWishlisted ? 'fill-red-400' : ''} />
                  <span>{isWishlisted ? 'Saved' : 'Wishlist'}</span>
                </button>
              </div>
            </div>

            {/* Actions: Add to Cart & Buy Now */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handleAdd}
                disabled={product.stock <= 0}
                className={`w-full py-4 px-6 text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 transition-all ${
                  addedNotice
                    ? 'bg-emerald-600 text-[var(--tone-ffffff)]'
                    : 'bg-[var(--tone-ffffff)] hover:bg-[var(--tone-e5e5e5)] text-[var(--tone-000000)]'
                }`}
              >
                {addedNotice ? (
                  <>
                    <Check size={16} />
                    <span>Added to Bag</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={16} />
                    <span>Add to Shopping Bag</span>
                  </>
                )}
              </button>

              <button
                onClick={handleBuy}
                disabled={product.stock <= 0}
                className="w-full py-3.5 px-6 text-xs uppercase tracking-[0.2em] font-semibold border border-[var(--tone-333333)] hover:border-[var(--tone-ffffff)] text-[var(--tone-e5e5e5)] hover:text-[var(--tone-ffffff)] transition-colors"
              >
                Buy Now (Instant Checkout)
              </button>
            </div>
          </div>

          {/* Accordion / Garment Details */}
          <div className="border-t border-[var(--tone-222222)] pt-6 space-y-4 text-xs text-[var(--tone-d4d4d4)]">
            <div>
              <h4 className="font-heading uppercase tracking-wider font-semibold text-[var(--tone-ffffff)] mb-2">
                Garment Description & Fit
              </h4>
              <p className="leading-relaxed text-[var(--tone-a3a3a3)] font-light">
                {product.description}
              </p>
            </div>

            {product.materials && (
              <div>
                <h4 className="font-heading uppercase tracking-wider font-semibold text-[var(--tone-ffffff)] mb-1">
                  Textiles & Composition
                </h4>
                <p className="text-[var(--tone-a3a3a3)] font-light">
                  {product.materials}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-[var(--tone-141414)] border border-[var(--tone-222222)] flex items-center gap-2.5">
                <Truck size={16} className="text-[var(--tone-a3a3a3)]" />
                <div>
                  <div className="font-semibold text-[var(--tone-ffffff)] text-[11px]">Rwanda Dispatch</div>
                  <div className="text-[10px] text-[var(--tone-a3a3a3)]">Same-day / 24hr delivery in Kigali</div>
                </div>
              </div>
              <div className="p-3 bg-[var(--tone-141414)] border border-[var(--tone-222222)] flex items-center gap-2.5">
                <Shield size={16} className="text-[var(--tone-a3a3a3)]" />
                <div>
                  <div className="font-semibold text-[var(--tone-ffffff)] text-[11px]">Flutterwave Protected</div>
                  <div className="text-[10px] text-[var(--tone-a3a3a3)]">Card & Mobile Money RWF</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Size Guide Modal */}
      {showSizeGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--tone-121212)] border border-[var(--tone-2a2a2a)] max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-[var(--tone-222222)]">
              <h3 className="font-heading text-sm font-bold text-[var(--tone-ffffff)] uppercase tracking-wider">
                AURIE Tailoring Size Guide
              </h3>
              <button onClick={() => setShowSizeGuide(false)} className="text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]">
                ✕
              </button>
            </div>

            <p className="text-[var(--tone-a3a3a3)]">
              Garments are cut to a tailored unisex silhouette. For relaxed fitting, select your true size.
            </p>

            <table className="w-full text-left border-collapse border border-[var(--tone-262626)]">
              <thead>
                <tr className="bg-[var(--tone-1a1a1a)] text-[var(--tone-d4d4d4)] text-[11px]">
                  <th className="p-2 border border-[var(--tone-262626)]">Size</th>
                  <th className="p-2 border border-[var(--tone-262626)]">Chest (in)</th>
                  <th className="p-2 border border-[var(--tone-262626)]">Waist (in)</th>
                  <th className="p-2 border border-[var(--tone-262626)]">Length (cm)</th>
                </tr>
              </thead>
              <tbody className="text-[var(--tone-a3a3a3)]">
                <tr><td className="p-2 border border-[var(--tone-262626)] font-semibold text-[var(--tone-ffffff)]">S</td><td className="p-2 border border-[var(--tone-262626)]">36 - 38</td><td className="p-2 border border-[var(--tone-262626)]">29 - 31</td><td className="p-2 border border-[var(--tone-262626)]">70</td></tr>
                <tr><td className="p-2 border border-[var(--tone-262626)] font-semibold text-[var(--tone-ffffff)]">M</td><td className="p-2 border border-[var(--tone-262626)]">39 - 41</td><td className="p-2 border border-[var(--tone-262626)]">32 - 34</td><td className="p-2 border border-[var(--tone-262626)]">72</td></tr>
                <tr><td className="p-2 border border-[var(--tone-262626)] font-semibold text-[var(--tone-ffffff)]">L</td><td className="p-2 border border-[var(--tone-262626)]">42 - 44</td><td className="p-2 border border-[var(--tone-262626)]">35 - 37</td><td className="p-2 border border-[var(--tone-262626)]">74</td></tr>
                <tr><td className="p-2 border border-[var(--tone-262626)] font-semibold text-[var(--tone-ffffff)]">XL</td><td className="p-2 border border-[var(--tone-262626)]">45 - 47</td><td className="p-2 border border-[var(--tone-262626)]">38 - 40</td><td className="p-2 border border-[var(--tone-262626)]">76</td></tr>
              </tbody>
            </table>

            <button
              onClick={() => setShowSizeGuide(false)}
              className="w-full bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-semibold py-2 uppercase tracking-wider text-xs hover:bg-[var(--tone-e5e5e5)]"
            >
              Close Guide
            </button>
          </div>
        </div>
      )}

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div className="border-t border-[var(--tone-222222)] pt-12">
          <div className="mb-6">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tone-888888)] font-semibold">
              COMPLETE THE SARTORIAL SILHOUETTE
            </span>
            <h3 className="font-heading text-xl font-bold text-[var(--tone-ffffff)] mt-1">
              RELATED PIECES
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatedProducts.slice(0, 3).map((rel) => (
              <div
                key={rel.id}
                onClick={() => onSelectRelated(rel)}
                className="bg-[var(--tone-141414)] border border-[var(--tone-222222)] p-4 cursor-pointer hover:border-[var(--tone-737373)] transition-colors"
              >
                <ImagePlaceholder
                  imageUrl={rel.image_url}
                  alt={rel.name}
                  category={rel.category}
                  aspectRatio="portrait"
                  allowEdit={false}
                />
                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-[var(--tone-ffffff)] line-clamp-1">{rel.name}</h4>
                  <div className="text-xs font-bold text-[var(--tone-d4d4d4)] mt-1">
                    {new Intl.NumberFormat('en-RW', {
                      style: 'currency',
                      currency: 'RWF',
                      maximumFractionDigits: 0
                    }).format(rel.price)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
