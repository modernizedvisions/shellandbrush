import { EmailSignupBand } from '../components/EmailSignupBand';

export function EmailListPage() {
  return (
    <div className="min-h-full flex items-center">
      <EmailSignupBand
        withBackground={false}
        sectionClassName="w-full py-8 md:py-12"
        containerClassName="max-w-3xl"
      />
    </div>
  );
}
