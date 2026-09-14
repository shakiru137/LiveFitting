import React from 'react';
import { Star, CheckCircle } from 'lucide-react';
import type { Review } from '../types';

interface CustomerReviewsProps {
  reviews: Review[];
  rating: number;
  reviewCount: number;
}

export const CustomerReviews: React.FC<CustomerReviewsProps> = ({
  reviews,
  rating,
  reviewCount
}) => {
  return (
    <section className="pt-24 sm:pt-30 border-t border-[#ECE8E3]">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">
        {/* Rating Card with 32px-40px Padding */}
        <div className="flex flex-col gap-6 luxury-card !bg-[#FAF9F7]">
          <span className="text-[11px] font-sans uppercase tracking-[0.25em] text-[#D8B4A0] font-medium">
            Customer Experiences
          </span>
          <div className="flex items-baseline gap-4">
            <span className="text-5xl sm:text-6xl font-serif text-[#1D1D1D]">{rating}</span>
            <div className="flex flex-col">
              <div className="flex text-[#D8B4A0]">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <span className="text-xs text-[#666666] font-sans mt-1.5">
                From {reviewCount} verified purchases
              </span>
            </div>
          </div>

          <div className="mt-4 pt-6 border-t border-[#ECE8E3] space-y-3">
            <div className="flex justify-between text-xs text-[#1D1D1D] font-sans">
              <span>Fit Accuracy</span>
              <span className="text-[#4F7A63] font-medium">98% True to Size</span>
            </div>
            <div className="w-full h-2 bg-[#ECE8E3] rounded-full overflow-hidden flex">
              <div className="w-[3%] bg-[#8E8E8E]" title="Runs Small" />
              <div className="w-[94%] bg-[#D8B4A0]" title="True to Size" />
              <div className="w-[3%] bg-[#8E8E8E]" title="Runs Large" />
            </div>
            <div className="flex justify-between text-[10px] text-[#8E8E8E] font-sans uppercase tracking-widest pt-1">
              <span>Runs Small</span>
              <span>True to Size</span>
              <span>Runs Large</span>
            </div>
          </div>
        </div>

        {/* Reviews List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-2xl font-serif text-[#1D1D1D]">
              Verified Feedback ({reviews.length})
            </h3>
            <span className="text-xs text-[#D8B4A0] hover:underline font-sans cursor-pointer font-medium">
              Write a Review
            </span>
          </div>

          <div className="space-y-6">
            {reviews.map((rev) => (
              <div
                key={rev.id}
                className="luxury-card space-y-3.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-sans font-medium text-[#1D1D1D] text-sm">{rev.author}</span>
                    {rev.verified && (
                      <span className="flex items-center gap-1.5 text-[10px] font-sans bg-[#4F7A63]/10 text-[#4F7A63] px-3 py-0.5 rounded-full border border-[#4F7A63]/20">
                        <CheckCircle className="w-3 h-3" />
                        Verified Purchase
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#8E8E8E] font-sans">{rev.date}</span>
                </div>

                <div className="flex items-center gap-2.5 text-[11px] text-[#666666] font-sans flex-wrap">
                  <div className="flex text-[#D8B4A0]">
                    {[...Array(rev.rating)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                  <span>•</span>
                  <span>Height: {rev.height}</span>
                  <span>•</span>
                  <span>Size: {rev.sizePurchased}</span>
                  <span>•</span>
                  <span className="text-[#D8B4A0]">{rev.fitRating}</span>
                </div>

                <h4 className="text-sm font-sans font-medium text-[#1D1D1D] pt-1">{rev.title}</h4>
                <p className="text-xs text-[#666666] leading-relaxed font-sans">{rev.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
