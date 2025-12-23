export function ReviewsSection() {
  const reviews = [
    'Love it! Wrapped so beautifully, beautiful and unique piece! Will def order more in the future for myself or for gifts',
    "10/10 recommend everything about this shop! Lauren is so gifted and her talent shines bright in her work! I absolutely love my beautiful art, it will always stand as a reminder of finishing chemo and the journey God has brought me through, while celebrating with my family at our favorite place, the beach! Shipping was the best I've ever experienced, packaged so safely and beautifully! Got here very fast, as well!",
    'FABULOUS is an understatement. This is a one of a kind piece that has become the focal point of my living room! I absolutely love the colors and materials used by the artist. The quality, uniqueness and style are unmatched!! I will be adding more to my collection and buying as gifts!!! 10/10 recommend!!!!!',
    'Absolutely beautiful! Guests have inquired about ordering their own.',
  ];

  return (
    <section className="py-20 bg-[#F8F5F0]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900">
          CUSTOMER REVIEWS
        </h2>

        <div className="mt-12 space-y-16">
          {reviews.map((review) => (
            <div key={review} className="space-y-4">
              <div className="text-sm tracking-[0.3em] text-accent-gold">★★★★★</div>
              <p className="text-base md:text-lg italic text-gray-700 leading-relaxed">
                {review}
              </p>
              <p className="text-xs uppercase tracking-[0.25em] text-gray-500">
                — Verified Buyer · Etsy
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
