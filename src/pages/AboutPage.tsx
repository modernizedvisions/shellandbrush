import { ContactForm } from '../components/ContactForm';

export function AboutPage() {
  return (
    <div className="bg-white">
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-serif font-bold text-gray-900 mb-8">About the Artist</h1>

          <div className="grid gap-10 lg:grid-cols-2 items-start">
            <div className="space-y-5 text-gray-700 order-2 lg:order-1">
              <p className="text-lg text-gray-900">Hi, I’m so glad you’re here.</p>
              <p>
                I’m a lifelong Eastern Shore native, born and raised in Salisbury, Maryland. Growing up surrounded by
                the water, shells, and coastal charm sparked a love for all things beach-inspired that has stayed with
                me ever since.
              </p>
              <p>
                By day, I work in healthcare — a field I’ve been part of for the past 18 years. Helping others has
                always been a meaningful part of my life, but creating shell art gives me a creative escape and a chance
                to slow down, recharge, and create something beautiful with my hands.
              </p>
              <p>
                I’m also a proud wife and mom to two young children, ages 3 and 5, who keep life busy, joyful, and full
                of love. Between work, family, and everyday life, my art is something I truly do for joy. Every piece is
                made with care and inspired by the shoreline I grew up loving.
              </p>
              <p>
                Thank you for being here and for supporting my passion. It truly means the world to me, and I hope each
                shell brings a little happiness and coastal charm into your life.
              </p>
            </div>

            <div className="w-full order-1 lg:order-2">
              {/* Artist photo — replace src when image is provided */}
              <div className="aspect-[4/5] w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                <img
                  src="https://files.reimage.dev/modernizedvisions/0cb5fb896e5f/original"
                  alt="Artist portrait"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <ContactForm />
    </div>
  );
}
