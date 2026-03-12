import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header style={{padding: '4rem 0', textAlign: 'center'}}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div style={{display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem'}}>
          <Link className="button button--primary button--lg" to="/docs/getting-started">
            Get Started
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/intro">
            Learn More
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    title: 'Project Management',
    description: 'Create, import, and organize 3D printing projects with drag-and-drop. Auto-categorize files, track print specs, and manage thumbnails.',
  },
  {
    title: 'Smart Filament Matching',
    description: 'Curated filament library with fuzzy matching. Automatically parse filament data from 3MF metadata and match against your collection.',
  },
  {
    title: 'Powerful Search & Filters',
    description: 'Full-text search, tag and collection filters, filament filters, size filters, and ownership tracking. Find any project instantly.',
  },
];

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <section style={{padding: '2rem 0 4rem'}}>
          <div className="container">
            <div className="row">
              {features.map((f, i) => (
                <div key={i} className="col col--4" style={{marginBottom: '1.5rem'}}>
                  <Heading as="h3">{f.title}</Heading>
                  <p>{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
