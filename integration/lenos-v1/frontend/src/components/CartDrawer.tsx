import React from 'react';
import { X, Trash2, ArrowRight, ShoppingBag } from 'lucide-react';
import { CartItem } from '../types';
import { ImagePlaceholder } from './ImagePlaceholder';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (index: number, newQty: number) => void;
  onRemoveItem: (index: number) => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryFee = subtotal > 120000 || subtotal === 0 ? 0 : 2500;
  const total = subtotal + deliveryFee;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: 'RWF',
      maximumFractionDigits: 0
    }).format(val);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[var(--tone-0f0f0f)] border-l border-[var(--tone-262626)] flex flex-col justify-between shadow-2xl">
          {/* Header */}
          <div className="p-5 border-b border-[var(--tone-222222)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-[var(--tone-d4d4d4)]" />
              <h2 className="font-heading text-base font-semibold tracking-wider text-[var(--tone-ffffff)]">
                YOUR SHOPPING BAG ({items.length})
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close cart"
              className="p-1.5 text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)] hover:bg-[var(--tone-1c1c1c)] rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16 text-[var(--tone-a3a3a3)]">
                <div className="w-16 h-16 rounded-full border border-[var(--tone-222222)] flex items-center justify-center mb-4 text-[var(--tone-737373)]">
                  <ShoppingBag size={24} />
                </div>
                <p className="font-heading text-sm text-[var(--tone-d4d4d4)] mb-1">Your bag is empty</p>
                <p className="text-xs text-[var(--tone-737373)] max-w-xs mb-6">
                  Explore AURIE menswear, womenswear, and contemporary cultural collections.
                </p>
                <button
                  onClick={onClose}
                  className="bg-[var(--tone-ffffff)] text-[var(--tone-000000)] px-6 py-2.5 text-xs uppercase tracking-widest font-semibold hover:bg-[var(--tone-e5e5e5)] transition-colors"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              items.map((item, idx) => (
                <div
                  key={`${item.product.id}-${item.selectedSize}-${item.selectedColor.name}-${idx}`}
                  className="flex gap-4 p-3 bg-[var(--tone-151515)] border border-[var(--tone-222222)] relative group"
                >
                  {/* Thumbnail / Minimal placeholder */}
                  <div className="w-20 h-24 flex-shrink-0 overflow-hidden bg-[var(--tone-171717)] border border-[var(--tone-2a2a2a)]">
                    <ImagePlaceholder
                      imageUrl={item.product.image_url}
                      alt={item.product.name}
                      category={item.product.category}
                      aspectRatio="portrait"
                      allowEdit={false}
                    />
                  </div>

                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <h4 className="text-xs font-semibold text-[var(--tone-ffffff)] line-clamp-1">
                          {item.product.name}
                        </h4>
                        <button
                          onClick={() => onRemoveItem(idx)}
                          className="text-[var(--tone-737373)] hover:text-red-400 transition-colors ml-2"
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <p className="text-[10px] text-[var(--tone-a3a3a3)] mt-1 uppercase tracking-wider">
                        Size: <span className="text-[var(--tone-e5e5e5)]">{item.selectedSize}</span> · Color:{' '}
                        <span className="text-[var(--tone-e5e5e5)]">{item.selectedColor.name}</span>
                      </p>

                      <p className="text-xs font-medium text-[var(--tone-ffffff)] mt-1">
                        {formatCurrency(item.product.price)}
                      </p>
                    </div>

                    {/* Quantity Selector */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center border border-[var(--tone-2e2e2e)] bg-[var(--tone-111111)]">
                        <button
                          onClick={() => onUpdateQuantity(idx, item.quantity - 1)}
                          className="px-2 py-0.5 text-xs text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]"
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-medium text-[var(--tone-ffffff)]">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(idx, item.quantity + 1)}
                          className="px-2 py-0.5 text-xs text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-[11px] text-[var(--tone-a3a3a3)] font-light ml-auto">
                        Subtotal: {formatCurrency(item.product.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Checkout Summary */}
          {items.length > 0 && (
            <div className="p-5 border-t border-[var(--tone-222222)] bg-[var(--tone-121212)] space-y-3">
              <div className="flex justify-between text-xs text-[var(--tone-a3a3a3)]">
                <span>Subtotal</span>
                <span className="text-[var(--tone-e5e5e5)]">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-[var(--tone-a3a3a3)]">
                <span>Estimated delivery fee</span>
                <span className="text-[var(--tone-e5e5e5)]">
                  {deliveryFee === 0 ? (
                    <span className="text-emerald-400 font-medium">Complimentary</span>
                  ) : (
                    formatCurrency(deliveryFee)
                  )}
                </span>
              </div>

              <div className="border-t border-[var(--tone-222222)] pt-3 flex justify-between items-baseline">
                <span className="font-heading text-sm text-[var(--tone-ffffff)] font-semibold">Total</span>
                <span className="font-heading text-base font-bold text-[var(--tone-ffffff)] tracking-wide">
                  {formatCurrency(total)}
                </span>
              </div>

              <p className="text-[10px] text-[var(--tone-737373)] text-center">
                RWF estimate · Current price and delivery confirmed at checkout
              </p>

              <button
                onClick={() => {
                  onClose();
                  onProceedToCheckout();
                }}
                className="w-full bg-[var(--tone-ffffff)] hover:bg-[var(--tone-e5e5e5)] text-[var(--tone-000000)] py-3 px-4 font-semibold text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
