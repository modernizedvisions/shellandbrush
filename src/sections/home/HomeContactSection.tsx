import { ContactForm } from '../../components/ContactForm';

export function HomeContactSection() {
  return (
    <section className="py-20 border-t border-gray-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900">
          CONTACT
        </h2>
        <p className="mt-3 text-sm md:text-base text-gray-600">
          For commissions, custom orders and questions, send a note below. I'd love to hear from you.
        </p>
      </div>

      <div className="mt-10">
        <ContactForm
          showHeading={false}
          useDefaultBackground={false}
          sectionClassName="py-0"
          containerClassName="max-w-xl"
          panelClassName="max-w-xl"
          namePlaceholder="YOUR NAME"
          emailPlaceholder="YOUR@EMAIL.COM"
          messagePlaceholder="TELL ME ABOUT YOUR PROJECT OR QUESTION..."
          submitLabel="SEND MESSAGE"
          successMessage="Message sent!"
          errorMessage="Something went wrong. Please try again."
          showServerError={false}
        />
      </div>
    </section>
  );
}
