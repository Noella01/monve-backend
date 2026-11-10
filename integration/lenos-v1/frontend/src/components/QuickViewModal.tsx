import React, { useEffect, useState } from 'react';
import { X, Check, ShoppingBag, ArrowRight } from 'lucide-react';
import { Product, ProductColor } from '../types';
import { ImagePlaceholder } from './ImagePlaceholder';

interface QuickViewModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, size: string, color: ProductColor) => void;
  onViewDetails: (product: Product) => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = (props) => (
  props.product ? <QuickViewContent key={props.product.id} {...props} product={props.product} /> : null
);

const QuickViewContent: React.FC<QuickViewModalProps & { product: Product }> = ({
  product,
  onClose,
  onAddToCart,
  onViewDetails,
}) => {
  const [selectedSize, setSelectedSize] = useState<string>(product.sizes[0] || 'M');
  const [selectedColor, setSelectedColor] = useState<ProductColor>(product.colors[0] || { name: 'Black', hex: '#000' });
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const formattedPrice = new Intl.NumberFormat('en-RW', {
    style: 'currency',
    currency: 'RWF',
    maximumFractionDigits: 0
  }).format(product.price);

  const handleAdd = () => {
    onAddToCart(product, selectedSize, selectedColor);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label={`Quick view: ${product.name}`} className="bg-[var(--tone-121212)] border border-[var(--tone-2a2a2a)] w-full max-w-3xl max-h-[calc(100dvh-2rem)] rounded-none shadow-2xl overflow-y-auto relative animate-fade-in grid grid-cols-1 md:grid-cols-2">
        <button
          onClick={onClose}
          aria-label="Close quick view"
          autoFocus
          className="absolute top-4 right-4 z-20 text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] p-1 rounded hover:bg-[var(--tone-1e1e1e)]"
        >
          <X size={20} />
        </button>

        {/* Product Image placeholder */}
        <div className="bg-[var(--tone-171717)] p-6 flex items-center justify-center border-b md:border-b-0 md:border-r border-[var(--tone-262626)]">
          <div className="w-full max-w-sm">
            <ImagePlaceholder
              imageUrl={product.image_url}
              alt={product.name}
              category={product.category}
              aspectRatio="portrait"
              allowEdit={false}
            />
          </div>
        </div>

        {/* Product Details */}
        <div className="p-6 md:p-8 flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tone-888888)] font-medium mb-1">
              {product.category} · {product.subcategory}
            </div>

            <h2 className="font-heading text-xl font-bold text-[var(--tone-ffffff)] mb-2">
              {product.name}
            </h2>

            <div className="text-lg font-bold text-[var(--tone-ffffff)] mb-4">
              {formattedPrice}
            </div>

            <p className="text-xs text-[var(--tone-a3a3a3)] mb-6 leading-relaxed">
              {product.description}
            </p>

            {/* Colors */}
            <div className="mb-4">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-2">
                Color: <span className="text-[var(--tone-ffffff)] font-medium">{selectedColor.name}</span>
              </span>
              <div className="flex gap-2">
                {product.colors.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setSelectedColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      selectedColor.name === c.name
                        ? 'border-[var(--tone-ffffff)] scale-110'
                        : 'border-[var(--tone-333333)] hover:border-[var(--tone-737373)]'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Sizes */}
            <div className="mb-6">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-2">
                Size: <span className="text-[var(--tone-ffffff)] font-medium">{selectedSize}</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSize(s)}
                    className={`text-xs px-3 py-1.5 border transition-all ${
                      selectedSize === s
                        ? 'border-[var(--tone-ffffff)] bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-semibold'
                        : 'border-[var(--tone-2e2e2e)] text-[var(--tone-d4d4d4)] hover:border-[var(--tone-a3a3a3)]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[var(--tone-222222)]">
            <button
              onClick={handleAdd}
              disabled={product.stock <= 0}
              className={`w-full py-3 px-4 text-xs uppercase tracking-[0.2em] font-semibold flex items-center justify-center gap-2 transition-colors ${
                added
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[var(--tone-ffffff)] hover:bg-[var(--tone-e5e5e5)] text-[var(--tone-000000)]'
              }`}
            >
              {added ? (
                <>
                  <Check size={16} />
                  <span>Added to Shopping Bag</span>
                </>
              ) : (
                <>
                  <ShoppingBag size={16} />
                  <span>Add to Bag</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                onClose();
                onViewDetails(product);
              }}
              className="w-full py-2.5 px-4 text-xs uppercase tracking-wider text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] border border-[var(--tone-2e2e2e)] hover:border-[var(--tone-737373)] flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>View Full Garment Details</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
