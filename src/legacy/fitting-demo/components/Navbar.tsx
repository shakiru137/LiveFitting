import React from 'react';
import { ShoppingBag } from 'lucide-react';

interface NavbarProps {
  cartCount: number;
  onOpenCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ cartCount, onOpenCart }) => {
  return (
    <header className="bg-white border-b border-[#ECE8E3] py-2 sm:py-3 sticky top-0 z-40 backdrop-blur-md bg-white/95">
      <div className="container-luxury flex items-center justify-between">
        {/* Left spacer for optical centering */}
        <div className="w-10" />

        {/* Minimalist Logo */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className=" font-serif text-2xl sm:text-[1.75rem] font-light tracking-[0.3em] text-[#1D1D1D] uppercase cursor-pointer hover:opacity-80 transition-opacity"
        >
          ATELIER
        </button>

        {/* Shopping Bag Icon */}
        <button
          onClick={onOpenCart}
          className="relative p-2.5 text-[#1D1D1D] border border-[#ECE8E3] rounded-full hover:bg-[#FAF9F7] hover:border-[#D8B4A0] transition-all cursor-pointer"
          aria-label="Shopping Bag"
        >
          <ShoppingBag className="w-5 h-5" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-[#D8B4A0] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
