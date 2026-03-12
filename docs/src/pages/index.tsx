import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header style={{padding: '4rem 0 2rem', textAlign: 'center'}}>
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

function Screenshot({src, alt}: {src: string; alt: string}) {
  const imgUrl = useBaseUrl(src);
  return (
    <div style={{
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      <img src={imgUrl} alt={alt} style={{width: '100%', display: 'block'}} />
    </div>
  );
}

const features = [
  {
    title: 'Project Management',
    description: 'Create, import, and organize 3D printing projects with drag-and-drop. Auto-categorize files, track print specs, and manage thumbnails.',
  },
  {
    title: 'Smart Filament Matching',
    description: 'Curated filament library with 800+ filaments and fuzzy matching. Automatically parse filament data from 3MF metadata and match against your collection.',
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
        {/* Main screenshot */}
        <section style={{padding: '1rem 0 3rem'}}>
          <div className="container" style={{maxWidth: '900px'}}>
            <Screenshot src="/img/screenshot-main.png" alt="HF Library Manager - Grid view with project cards" />
          </div>
        </section>

        {/* Features */}
        <section style={{padding: '2rem 0'}}>
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

        {/* Screenshot gallery */}
        <section style={{padding: '2rem 0 4rem'}}>
          <div className="container">
            <Heading as="h2" style={{textAlign: 'center', marginBottom: '2rem'}}>
              See it in action
            </Heading>
            <div className="row">
              <div className="col col--6" style={{marginBottom: '1.5rem'}}>
                <Screenshot src="/img/screenshot-project.png" alt="Project detail view with files, filaments, and metadata" />
                <p style={{textAlign: 'center', marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.7}}>
                  Project detail with files, filaments, and metadata
                </p>
              </div>
              <div className="col col--6" style={{marginBottom: '1.5rem'}}>
                <Screenshot src="/img/screenshot-filaments.png" alt="Filament library with search, filters, and ownership tracking" />
                <p style={{textAlign: 'center', marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.7}}>
                  Curated filament library with 800+ entries
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
