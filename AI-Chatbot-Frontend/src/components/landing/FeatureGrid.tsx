import type { IconType } from 'react-icons';
import { FaBolt, FaComments, FaSearch, FaShieldAlt } from 'react-icons/fa';

interface Feature {
  icon: IconType;
  title: string;
  description: string;
  color: string;
}

const FEATURES: Feature[] = [
  {
    icon: FaSearch,
    title: 'Understands Unit Lesson Page',
    description: 'Write Unit 3 Lesson 5 Page 45 and get the exact match solved, even with very short text.',
    color: '#8B5CF6',
  },
  {
    icon: FaBolt,
    title: 'Simple words for Class 3',
    description: 'Short sentences, Bangla meaning, and one small practice question at the end.',
    color: '#F472B6',
  },
  {
    icon: FaComments,
    title: 'Matching game included',
    description: 'Tap a request, tap a reply, earn stars. Built for the Page 45 request matching task.',
    color: '#FBBF24',
  },
  {
    icon: FaShieldAlt,
    title: 'Safe and book based',
    description: 'Answers stay close to English For Today and never shame a wrong try.',
    color: '#34D399',
  },
];

export function FeatureGrid() {
  return (
    <section className="pg-app" aria-labelledby="landing-features-title" style={{ padding: '48px 0 32px' }}>
      <div className="pg-container">
        <h2 id="landing-features-title" style={{ fontSize: 32, marginBottom: 8, textAlign: 'center' }}>
          Made for little learners
        </h2>
        <p style={{ textAlign: 'center', color: '#64748B', marginBottom: 28 }}>
          Everything a Class 3 child needs to finish English homework with a smile.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
          {FEATURES.map((feature) => (
            <article key={feature.title} className="pg-card pg-pop-in" style={{ padding: 22 }}>
              <div className="pg-icon-circle" style={{ background: feature.color, marginBottom: 14 }}>
                <feature.icon />
              </div>
              <h3 style={{ fontSize: 17, marginBottom: 6 }}>{feature.title}</h3>
              <p style={{ margin: 0, color: '#475569', fontSize: 14.5 }}>
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

