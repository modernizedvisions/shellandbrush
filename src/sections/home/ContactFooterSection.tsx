import { Link } from 'react-router-dom';
import { Instagram, Mail, Music2 } from 'lucide-react';
import { ContactForm } from '../../components/ContactForm';

export function ContactFooterSection() {
  return (
    <section className="py-20 border-t border-gray-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900">
          CONTACT
        </h2>
        <p className="mt-3 text-sm md:text-base text-gray-600">
          Share your idea and we will respond with availability and details.
        </p>
      </div>

      <div className="mt-10">
        <ContactForm
          showHeading={false}
          useDefaultBackground={false}
          sectionClassName="py-0"
          containerClassName="max-w-xl"
          panelClassName="max-w-xl"
        />
      </div>

      <div className="mt-16 border-t border-gray-100">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 text-center space-y-4">
          <div className="flex items-center justify-center gap-5">
            <a
              href="https://www.instagram.com/thechesapeakeshell"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 transition"
              aria-label="Instagram"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href="https://www.tiktok.com/@thechesapeakeshell"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 transition"
              aria-label="TikTok"
            >
              <Music2 className="h-4 w-4" />
            </a>
            <a
              href="mailto:hello@shellandbrush.com"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 transition"
              aria-label="Email"
            >
              <Mail className="h-4 w-4" />
            </a>
          </div>
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500">
            &copy; {new Date().getFullYear()} Shell &amp; Brush. All rights reserved.
          </p>
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500">
            hello@shellandbrush.com
          </p>
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500">
            Built by{' '}
            <a
              href="https://modernizedvisions.agency"
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-gray-700"
            >
              Modernized Visions
            </a>
          </p>
          <Link to="/admin" className="text-xs uppercase tracking-[0.25em] text-gray-500 hover:text-gray-700">
            Admin
          </Link>
        </div>
      </div>
    </section>
  );
}
