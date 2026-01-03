import React from 'react';

type Review = {
  name: string;
  date: string;
  stars: number;
  item: string;
  text: string;
};

const averageRating = 5;
const reviewCount = 18;

const STATIC_REVIEWS: Review[] = [
  {
    name: 'Hannah',
    date: '',
    stars: 5,
    item: 'Verified Buyer  Etsy',
    text: 'Love it! Wrapped so beautifully, beautiful and unique piece! Will def order more in the future for myself or for gifts',
  },
  {
    name: 'Samantha',
    date: '',
    stars: 5,
    item: 'Verified Buyer  Etsy',
    text: "10/10 recommend everything about this shop! Lauren is so gifted and her talent shines bright in her work! I absolutely love my beautiful art, it will always stand as a reminder of finishing chemo and the journey God has brought me through, while celebrating with my family at our favorite place, the beach! Shipping was the best I've ever experienced, packaged so safely and beautifully! Got here very fast, as well!",
  },
  {
    name: 'Maria',
    date: '',
    stars: 5,
    item: 'Verified Buyer  Etsy',
    text: 'FABULOUS is an understatement. This is a one of a kind piece that has become the focal point of my living room! I absolutely love the colors and materials used by the artist. The quality, uniqueness and style are unmatched!! I will be adding more to my collection and buying as gifts!!! 10/10 recommend!!!!!',
  },
  {
    name: 'Brooke',
    date: '',
    stars: 5,
    item: 'Verified Buyer  Etsy',
    text: 'Absolutely beautiful! Guests have inquired about ordering their own.',
  },
];

export function ProductReviews() {
  return (
    <section className="border-t border-slate-200 pt-10 mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-semibold tracking-[0.12em] uppercase text-slate-900">
            Customer Reviews
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Average rating {averageRating} out of 5 stars ({reviewCount} reviews)
          </p>
        </div>
        <div className="text-right space-y-1">
          <div className="text-amber-500 text-lg leading-none">★★★★★</div>
          <p className="text-xs text-slate-500">5.0 • Etsy reviews for Lauren</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {STATIC_REVIEWS.map((review) => (
          <article key={`${review.name}-${review.date}-${review.item}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{review.name}</p>
              </div>
              <span className="text-amber-500 text-sm">{'★'.repeat(review.stars)}</span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{review.item}</p>
            <p className="mt-2 text-sm text-slate-800 leading-relaxed">“{review.text}”</p>
          </article>
        ))}
      </div>
    </section>
  );
}
