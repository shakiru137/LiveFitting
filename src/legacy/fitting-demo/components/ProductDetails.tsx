import React, { useState } from 'react';
import { ShoppingBag, Check } from 'lucide-react';
import type { Dress, DressColor } from '../types';

interface ProductDetailsProps {
  dress: Dress;
  selectedColor: DressColor;
  onSelectColor: (c: DressColor) => void;
  onOpenFittingRoom: () => void;
  onAddToCart: (size: string) => void;
}

const SIZES = ['UK 6', 'UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16'];

export const ProductDetails: React.FC<ProductDetailsProps> = ({
  dress,
  selectedColor,
  onSelectColor,
  onOpenFittingRoom,
  onAddToCart,
}) => {
  const [selectedSize, setSelectedSize] = useState('UK 8');

  return (
    <div className="flex flex-col gap-7 text-[#1D1D1D]">

      {/* Category chip */}
      <div>
        <span
          style={{
            display: 'inline-block',
            padding: '7px 18px',
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            color: '#D8B4A0',
            fontWeight: 500,
            background: '#FAF9F7',
            border: '1px solid #ECE8E3',
            borderRadius: '9999px',
          }}
        >
          {dress.category}
        </span>
      </div>

      {/* Title & Subtitle block — given explicit vertical padding so
          the border-box below and above never touches text */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px', paddingBottom: '4px' }}>
        <h1 className="font-serif text-3xl sm:text-4xl lg:text-[2.75rem] text-[#1D1D1D] leading-[1.14]">
          {dress.title}
        </h1>
        <p className="text-xs sm:text-sm text-[#666666] font-sans leading-relaxed">
          {dress.subtitle}
        </p>
      </div>

      {/* Price block */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap' }}>
        <span className="font-serif text-3xl sm:text-4xl text-[#1D1D1D]">£{dress.price}</span>
        {dress.originalPrice && (
          <span className="font-serif text-lg text-[#9A9A9A] line-through">£{dress.originalPrice}</span>
        )}
        {/* Chip: uses inline-flex via style to guarantee Preflight doesn't collapse padding */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 14px',
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
            background: 'rgba(79,122,99,0.10)',
            color: '#4F7A63',
            border: '1px solid rgba(79,122,99,0.20)',
            borderRadius: '9999px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          In Stock · Express Delivery
        </span>
      </div>

      {/* Divider — using a styled div instead of <hr> because Tailwind Preflight
          collapses hr margin and Tailwind's my-* on hr is unreliable */}
      <div style={{ borderTop: '1px solid #ECE8E3', margin: '4px 0' }} />

      {/* Shade Selection */}
      <div className="space-y-3.5">
        <p className="text-[11px] font-sans uppercase tracking-[0.2em] text-[#666666]">
          Shade: <strong className="text-[#1D1D1D] font-medium ml-1">{selectedColor.name}</strong>
        </p>
        <div className="flex items-center gap-3.5">
          {dress.colors.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectColor(c)}
              title={c.name}
              className={`w-10 h-10 rounded-full p-0.5 transition-all flex items-center justify-center flex-shrink-0 ${
                c.id === selectedColor.id
                  ? 'ring-2 ring-[#D8B4A0] ring-offset-4 scale-110'
                  : 'opacity-70 hover:opacity-100 hover:scale-105'
              }`}
            >
              <span
                className="w-full h-full rounded-full border border-black/10 shadow-inner flex items-center justify-center"
                style={{ backgroundColor: c.hex }}
              >
                {c.id === selectedColor.id && (
                  <Check className={`w-4 h-4 ${c.hex === '#F4EFEA' || c.hex === '#E4D4B8' ? 'text-black/60' : 'text-white'}`} />
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Size Selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p className="text-[11px] font-sans uppercase tracking-[0.2em] text-[#666666]">Select Size</p>
          {/* Using inline style so Preflight doesn't strip cursor/padding from this text-button */}
          <button
            onClick={onOpenFittingRoom}
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              color: '#D8B4A0',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
              lineHeight: 1.5,
            }}
          >
            Virtual Fitting Guide
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSize(s)}
              style={{
                /* Guaranteed padding — not via Tailwind utility which Preflight can strip */
                padding: '12px 8px',
                borderRadius: '16px',
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                border: `1px solid ${selectedSize === s ? '#1D1D1D' : '#ECE8E3'}`,
                background: selectedSize === s ? '#1D1D1D' : '#FFFFFF',
                color: selectedSize === s ? '#FFFFFF' : '#1D1D1D',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'center',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Actions */}
      <div className="flex flex-col gap-3 pt-2">
        <button
          onClick={() => onAddToCart(selectedSize)}
          className="btn-primary-luxury w-full"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Add to Bag — £{dress.price}</span>
        </button>

        <button
          onClick={onOpenFittingRoom}
          className="btn-fitting-room w-full"
        >
          <span>Try On in Live Fitting Room</span>
        </button>
      </div>
    </div>
  );
};
