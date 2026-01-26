import { EmailSignupBand } from '../components/EmailSignupBand';

export function EmailListPage() {
  return (
    <div className="min-h-full bg-[#F8F5F0] flex items-center">
      <EmailSignupBand
        withBackground={false}
        sectionClassName="w-full py-6 md:py-10"
        containerClassName="max-w-5xl"
      />
    </div>
  );
}
