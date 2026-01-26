import { EmailSignupBand } from '../components/EmailSignupBand';

export function EmailListPage() {
  return (
    <div className="h-full bg-[#F8F5F0]">
      <EmailSignupBand withBackground={false} sectionClassName="py-10 md:py-16" />
    </div>
  );
}
