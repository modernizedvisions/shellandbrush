import HeroSection from '../sections/home/HeroSection';
import { FeaturedWorksSection } from '../sections/home/FeaturedWorksSection';
import { ReviewsSection } from '../sections/home/ReviewsSection';
import { SocialsSection } from '../sections/home/SocialsSection';
import { ContactFooterSection } from '../sections/home/ContactFooterSection';

export function HomePage() {
  return (
    <div className="bg-white">
      <HeroSection />
      <FeaturedWorksSection />
      <ReviewsSection />
      <SocialsSection />
      <ContactFooterSection />
    </div>
  );
}
