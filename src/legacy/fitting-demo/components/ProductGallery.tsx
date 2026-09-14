import React, { useState } from 'react';
import { ZoomIn, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Dress, DressColor } from '../types';

interface ProductGalleryProps {
  dress: Dress;
  selectedColor: DressColor;
  onOpenFittingRoom: () => void;
}

export const ProductGallery: React.FC<ProductGalleryProps> = ({
  dress,
  selectedColor,
  onOpenFittingRoom,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);

  const mediaList = [
    selectedColor.image,
    ...dress.photos.filter((p) => p !== selectedColor.image),
  ];

  const prev = () => { setActiveIndex((i) => (i - 1 + mediaList.length) % mediaList.length); };
  const next = () => { setActiveIndex((i) => (i + 1) % mediaList.length); };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Main viewport ───────────────────────────────── */}
      <div className="relative w-full aspect-[3/4] rounded-[24px] overflow-hidden bg-[#FAF9F7] border border-[#ECE8E3] group">
        <img
          src={mediaList[activeIndex] || selectedColor.image}
          alt={dress.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />

        {/* Floating action overlay badge */}
        <div className="absolute top-5 right-5 pointer-events-none z-10">
          <button
            onClick={onOpenFittingRoom}
            className="pointer-events-auto btn-fitting-room !min-h-[38px] !py-2 !px-4 !text-[11px] bg-white/95 backdrop-blur-md shadow-md"
          >
            Try On Live
          </button>
        </div>

        {/* Prev / Next arrows */}
        <button
          onClick={prev}
          aria-label="Previous image"
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/90 backdrop-blur-sm border border-[#ECE8E3] text-[#1D1D1D] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white z-10"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={next}
          aria-label="Next image"
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/90 backdrop-blur-sm border border-[#ECE8E3] text-[#1D1D1D] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white z-10"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Bottom controls */}
        <div className="absolute bottom-5 right-5 flex items-center gap-3 z-10">
          <button
            onClick={() => setZoomOpen(true)}
            aria-label="Zoom image"
            className="p-2.5 rounded-full bg-white/95 border border-[#ECE8E3] text-[#1D1D1D] hover:border-[#D8B4A0] backdrop-blur-md transition-all shadow-sm"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile swipe dots */}
        <div className="absolute bottom-5 left-5 flex items-center gap-1.5 sm:hidden z-10">
          {mediaList.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${activeIndex === idx ? 'w-5 bg-[#1D1D1D]' : 'w-1.5 bg-white/60'}`}
            />
          ))}
        </div>
      </div>

      {/* ── Thumbnail strip ─────────────────────────────── */}
      <div className="flex items-center gap-4 overflow-x-auto scrollbar-none pb-1">
        {mediaList.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`w-[76px] h-[100px] sm:w-[92px] sm:h-[120px] flex-shrink-0 rounded-2xl overflow-hidden border-2 transition-all ${
              activeIndex === idx
                ? 'border-[#D8B4A0] ring-4 ring-[#D8B4A0]/20 scale-105'
                : 'border-[#ECE8E3] opacity-75 hover:opacity-100 hover:border-[#D8B4A0]/50'
            }`}
          >
            <img src={img} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {/* ── Fullscreen zoom modal ────────────────────────── */}
      {zoomOpen && (
        <div className="fixed inset-0 z-[60] bg-black/92 backdrop-blur-xl flex items-center justify-center p-6 sm:p-10">
          <button
            onClick={() => setZoomOpen(false)}
            className="absolute top-6 right-6 sm:top-8 sm:right-8 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={mediaList[activeIndex]}
            alt={dress.title}
            className="max-h-[88vh] max-w-full rounded-2xl shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
