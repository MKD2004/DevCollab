import { Navigation } from '../components/landing/navigation.jsx';
import { HeroSection } from '../components/landing/hero-section.jsx';
import { FeaturesSection } from '../components/landing/features-section.jsx';
import { HowItWorksSection } from '../components/landing/how-it-works-section.jsx';
import { InfrastructureSection } from '../components/landing/infrastructure-section.jsx';
import { MetricsSection } from '../components/landing/metrics-section.jsx';
import { IntegrationsSection } from '../components/landing/integrations-section.jsx';
import { SecuritySection } from '../components/landing/security-section.jsx';
import { DevelopersSection } from '../components/landing/developers-section.jsx';
import { CtaSection } from '../components/landing/cta-section.jsx';
import { FooterSection } from '../components/landing/footer-section.jsx';

export default function Landing() {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <Navigation />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <InfrastructureSection />
      <MetricsSection />
      <IntegrationsSection />
      <SecuritySection />
      <DevelopersSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
