import React from 'react';
import { Plus, Check } from 'lucide-react';
import type { Accessory } from '../types';

interface CompleteTheLookProps {
  accessories: Accessory[];
  onAddAccessory: (acc: Accessory) => void;
  addedIds: string[];
}

export const CompleteTheLook: React.FC<CompleteTheLookProps> = ({
  accessories,
  onAddAccessory,
  addedIds,
}) => {
  if (!accessories?.length) return null;

  return (
    <div
      style={{
        /* Guaranteed top padding + border — Tailwind pt-16 sm:pt-24 can be
           stripped by Preflight on div elements in certain cascade orders */
        paddingTop: '80px',
        borderTop: '1px solid #ECE8E3',
      }}
    >
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginBottom: '56px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-sans)',
              textTransform: 'uppercase',
              letterSpacing: '0.25em',
              color: '#D8B4A0',
              fontWeight: 500,
            }}
          >
            Styling Recommendations
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl text-[#1D1D1D]">
            Complete The Look
          </h2>
        </div>
        <p className="text-xs text-[#8E8E8E] font-sans">
          Curated pairings by Atelier stylists for your occasion
        </p>
      </div>

      {/* Grid of Accessories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {accessories.map((item) => {
          const added = addedIds.includes(item.id);
          return (
            <div
              key={item.id}
              className="luxury-card flex flex-col justify-between group overflow-hidden bg-[#FAF9F7]/60"
            >
              {/* Product Image with natural 4:3 portrait ratio */}
              <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-white border border-[#ECE8E3] mb-6">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>

              {/* Title & Price Footer */}
              <div className="flex flex-col gap-4">
                <div>
                  <span className="text-[10px] font-sans uppercase tracking-widest text-[#8E8E8E] block mb-1">
                    {item.category}
                  </span>
                  <h3 className="text-sm font-sans font-medium text-[#1D1D1D] leading-snug">
                    {item.title}
                  </h3>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#ECE8E3]/60">
                  <span className="font-serif text-xl text-[#1D1D1D]">
                    £{item.price}
                  </span>
                  <button
                    onClick={() => onAddAccessory(item)}
                    style={{
                      /* Guaranteed padding so this pill looks like a proper button
                         and not bare text — Tailwind px-5 py-2.5 can be stripped */
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '9px 18px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      border: `1px solid ${added ? '#4F7A63' : '#ECE8E3'}`,
                      background: added ? '#4F7A63' : '#FFFFFF',
                      color: added ? '#FFFFFF' : '#1D1D1D',
                    }}
                  >
                    {added ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Added</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add to Bag</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
