import HeroSection from '../sections/home/HeroSection';
import { FeaturedWorksSection } from '../sections/home/FeaturedWorksSection';
import { ReviewsSection } from '../sections/home/ReviewsSection';
import { SocialsSection } from '../sections/home/SocialsSection';
import { HomeContactSection } from '../sections/home/HomeContactSection';
import { EmailSignupBand } from '../components/EmailSignupBand';

export function HomePage() {
  return (
    <div className="bg-white">
      <HeroSection />
      <FeaturedWorksSection />
      <EmailSignupBand />
      <ReviewsSection />
      <SocialsSection />
      <HomeContactSection />
    </div>
  );
}
