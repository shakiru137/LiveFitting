import React from 'react';
import { X, Trash2, ShoppingBag, ArrowRight, ShieldCheck, Lock, Sparkles } from 'lucide-react';

export interface CartItem {
  id: string;
  type: 'dress' | 'accessory';
  title: string;
  colorName?: string;
  size?: string;
  price: number;
  image: string;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onRemoveItem: (id: string) => void;
  onOpenFittingRoom: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onRemoveItem,
  onOpenFittingRoom
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((acc, curr) => acc + curr.price, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-300">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-md bg-white border-l border-[#ECE8E3] text-[#1D1D1D] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-[#ECE8E3] flex items-center justify-between bg-[#FAF9F7]">
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5 text-[#1D1D1D]" />
              <h2 className="text-base sm:text-lg font-serif text-[#1D1D1D]">
                Shopping Bag <span className="text-sm text-[#8E8E8E] font-sans">({items.length})</span>
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-[#666666] hover:text-[#1D1D1D] rounded-full hover:bg-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
                <div className="w-16 h-16 rounded-full bg-[#FAF9F7] border border-[#ECE8E3] flex items-center justify-center text-[#8E8E8E]">
                  <ShoppingBag className="w-8 h-8 text-[#8E8E8E]" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-[#1D1D1D]">Your shopping bag is empty</h3>
                  <p className="text-xs text-[#666666] font-sans mt-1 max-w-xs leading-relaxed">
                    Try on our occasion wear in real-time with the Live Fitting Room before making your selection.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onOpenFittingRoom();
                  }}
                  className="btn-fitting-room !py-3 !px-6 !text-xs mt-2"
                >
                  <Sparkles className="w-4 h-4 text-[#D8B4A0]" />
                  <span>Live Fitting Room</span>
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#FAF9F7] p-3.5 rounded-2xl border border-[#ECE8E3] flex gap-4 items-center"
                >
                  <div className="w-18 h-22 rounded-xl overflow-hidden bg-white flex-shrink-0 border border-[#ECE8E3]">
                    <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs sm:text-sm font-sans font-medium text-[#1D1D1D] truncate">{item.title}</h4>
                    {item.colorName && (
                      <p className="text-[11px] text-[#666666] font-sans mt-0.5">{item.colorName} • {item.size}</p>
                    )}
                    <p className="text-sm font-serif font-semibold text-[#1D1D1D] mt-1.5">£{item.price}</p>
                  </div>

                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="p-2 text-[#8E8E8E] hover:text-[#1D1D1D] transition-colors"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer Summary */}
          {items.length > 0 && (
            <div className="p-5 sm:p-6 border-t border-[#ECE8E3] bg-[#FAF9F7] space-y-4">
              <div className="space-y-2 text-xs font-sans">
                <div className="flex justify-between text-[#666666]">
                  <span>Subtotal</span>
                  <span className="text-[#1D1D1D] font-medium">£{subtotal}</span>
                </div>
                <div className="flex justify-between text-[#666666]">
                  <span>Express Worldwide Shipping</span>
                  <span className="text-[#4F7A63] font-medium">Complimentary</span>
                </div>
                <div className="flex justify-between text-sm font-serif text-[#1D1D1D] pt-3 border-t border-[#ECE8E3]">
                  <span>Total</span>
                  <span className="text-lg">£{subtotal}</span>
                </div>
              </div>

              <button className="btn-primary-luxury w-full flex items-center justify-center gap-2 !py-4">
                <Lock className="w-4 h-4" />
                <span>Secure Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-[#666666] font-sans text-center">
                <ShieldCheck className="w-4 h-4 text-[#4F7A63] flex-shrink-0" />
                <span>Complimentary returns within 28 days</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
