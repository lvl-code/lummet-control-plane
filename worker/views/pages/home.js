import { escapeHtml } from "../layout.js";
import { listPublicBrands } from "../../public-brands.js";

const SITE_TITLE = "Lummet — Centralized Technology & AI Platform for Digital Brands";
const SITE_DESCRIPTION =
  "Lummet is a centralized technology and AI platform for managing, scaling and operating multiple independent digital brands from one control plane.";

// -----------------------------------------------------
// Styles — a distinct, light, premium SaaS visual identity.
// Deliberately does NOT reuse the dark admin STYLES from
// layout.js, so the public site never looks like the tenant
// CMS/control plane per the brief.
// -----------------------------------------------------
const STYLES = `
  :root {
    --bg: #ffffff;
    --bg-soft: #f7f7fb;
    --ink: #14131f;
    --ink-dim: #5b5a6e;
    --border: #e7e6f0;
    --accent: #6d5bf6;
    --accent-2: #9b6bf6;
    --accent-soft: rgba(109, 91, 246, 0.08);
    --radius-lg: 20px;
    --radius-md: 14px;
    --radius-sm: 10px;
    --shadow: 0 20px 60px -30px rgba(20, 19, 31, 0.25);
    --max: 1160px;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--ink);
    background: var(--bg);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }
  img { max-width: 100%; display: block; }
  h1, h2, h3 { line-height: 1.15; margin: 0 0 14px; font-weight: 700; letter-spacing: -0.02em; }
  h1 { font-size: clamp(34px, 5vw, 56px); }
  h2 { font-size: clamp(26px, 3.4vw, 38px); }
  h3 { font-size: 19px; }
  p { color: var(--ink-dim); margin: 0 0 16px; }
  .wrap { max-width: var(--max); margin: 0 auto; padding: 0 24px; }
  .eyebrow {
    display: inline-block; font-size: 13px; font-weight: 600; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--accent); margin-bottom: 14px;
  }
  section { padding: 96px 0; }
  section.tight { padding: 64px 0; }
  .center { text-align: center; }
  .lede { font-size: 18px; max-width: 620px; }
  .center .lede { margin-left: auto; margin-right: auto; }

  /* ---- Header ---- */
  header.site {
    position: sticky; top: 0; z-index: 40; background: rgba(255,255,255,0.85);
    backdrop-filter: blur(10px); border-bottom: 1px solid var(--border);
  }
  .nav-inner { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; max-width: var(--max); margin: 0 auto; }
  .logo { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 20px; }
  .logo .dot { width: 9px; height: 9px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent-2)); display: inline-block; }
  nav.links { display: flex; gap: 28px; align-items: center; }
  nav.links a { font-size: 14px; font-weight: 600; color: var(--ink-dim); }
  nav.links a:hover { color: var(--ink); }
  .nav-cta { display: flex; align-items: center; gap: 14px; }
  .signin-link { font-size: 13px; color: var(--ink-dim); }
  #mobile-toggle { display: none; background: none; border: none; font-size: 22px; cursor: pointer; color: var(--ink); }
  #mobile-menu { display: none; }

  /* ---- Buttons ---- */
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    padding: 13px 24px; border-radius: 999px; font-weight: 600; font-size: 14px;
    cursor: pointer; border: 1px solid transparent; transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .btn:hover { transform: translateY(-1px); }
  .btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; box-shadow: 0 12px 24px -10px rgba(109, 91, 246, 0.6); }
  .btn-primary:hover { text-decoration: none; }
  .btn-secondary { background: #fff; color: var(--ink); border-color: var(--border); }
  .btn-secondary:hover { text-decoration: none; border-color: var(--accent); }
  .btn-lg { padding: 16px 30px; font-size: 15px; }

  /* ---- Hero ---- */
  .hero { padding: 96px 0 60px; background: radial-gradient(circle at 20% -10%, var(--accent-soft), transparent 55%); }
  .hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center; }
  .hero h1 { max-width: 620px; }
  .hero .lede { font-size: 19px; max-width: 520px; }
  .hero-ctas { display: flex; gap: 14px; margin-top: 30px; flex-wrap: wrap; }

  .flow-card {
    background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg);
    box-shadow: var(--shadow); padding: 28px; position: relative;
  }
  .flow-node {
    border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px;
    font-weight: 700; font-size: 14px; background: var(--bg-soft); text-align: center;
  }
  .flow-node.top { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; border: none; }
  .flow-arrow { text-align: center; color: var(--ink-dim); font-size: 13px; margin: 10px 0; }
  .flow-branches { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

  /* ---- Cards / grids ---- */
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 48px; }
  .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 48px; }
  .card {
    background: #fff; border: 1px solid var(--border); border-radius: var(--radius-md);
    padding: 28px; transition: box-shadow 0.2s ease, transform 0.2s ease;
  }
  .card:hover { box-shadow: var(--shadow); transform: translateY(-3px); }
  .card .step-no { font-size: 13px; font-weight: 700; color: var(--accent); margin-bottom: 10px; letter-spacing: 0.04em; }
  .card .icon {
    width: 42px; height: 42px; border-radius: 12px; background: var(--accent-soft);
    display: flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 20px;
  }

  .list-cols { columns: 2; column-gap: 40px; margin-top: 28px; }
  .list-cols li { margin-bottom: 12px; break-inside: avoid; color: var(--ink-dim); font-size: 15px; }

  /* ---- Alt background sections ---- */
  .section-soft { background: var(--bg-soft); }

  /* ---- Brands ---- */
  .brand-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 48px; }
  .brand-card {
    background: #fff; border: 1px solid var(--border); border-radius: var(--radius-md);
    padding: 26px; display: flex; flex-direction: column; gap: 10px; transition: box-shadow 0.2s ease, transform 0.2s ease;
  }
  .brand-card:hover { box-shadow: var(--shadow); transform: translateY(-3px); }
  .brand-mark {
    width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 16px; color: #fff; background: linear-gradient(135deg, var(--accent), var(--accent-2));
  }
  .brand-name { font-weight: 700; font-size: 17px; margin-top: 6px; }
  .brand-category { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); }
  .brand-desc { font-size: 14px; color: var(--ink-dim); margin: 4px 0 6px; flex-grow: 1; }
  .brand-link { font-size: 13px; font-weight: 700; color: var(--ink); display: inline-flex; align-items: center; gap: 6px; }
  .brand-link:hover { color: var(--accent); }

  /* ---- Why / architecture ---- */
  .why-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; margin-top: 40px; }
  .why-tags { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
  .tag { background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 999px; }
  .stack-card { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; background: #fff; margin-bottom: 12px; }
  .stack-card b { display: block; margin-bottom: 4px; }

  /* ---- AI section ---- */
  .ai-panel {
    background: linear-gradient(135deg, #14131f, #262246); color: #fff;
    border-radius: var(--radius-lg); padding: 64px 48px; text-align: center;
  }
  .ai-panel h2, .ai-panel .eyebrow { color: #fff; }
  .ai-panel p { color: rgba(255,255,255,0.72); }
  .ai-panel .lede { margin: 0 auto 28px; }

  /* ---- Growth ---- */
  .grow-visual { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 40px 0; }
  .grow-chip { border: 1px dashed var(--border); border-radius: 999px; padding: 10px 20px; font-size: 14px; font-weight: 600; color: var(--ink-dim); }
  .grow-chip.new { border-style: solid; border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

  /* ---- CTA band ---- */
  .cta-band {
    background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff;
    border-radius: var(--radius-lg); padding: 64px 48px; text-align: center;
  }
  .cta-band h2 { color: #fff; }
  .cta-band p { color: rgba(255,255,255,0.85); }
  .cta-band .btn-secondary { background: rgba(255,255,255,0.12); color: #fff; border-color: rgba(255,255,255,0.4); }
  .cta-band .btn-primary { background: #fff; color: var(--ink); box-shadow: none; }

  /* ---- Contact ---- */
  .contact-card { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 48px; text-align: center; background: var(--bg-soft); }

  /* ---- Footer ---- */
  footer.site { border-top: 1px solid var(--border); padding: 56px 0 32px; }
  .footer-grid { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 32px; }
  .footer-nav { display: flex; gap: 24px; flex-wrap: wrap; }
  .footer-nav a { font-size: 14px; color: var(--ink-dim); }
  .footer-nav a:hover { color: var(--ink); }
  .footer-bottom { margin-top: 40px; font-size: 13px; color: var(--ink-dim); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }

  @media (max-width: 860px) {
    .hero-grid, .why-grid { grid-template-columns: 1fr; }
    .grid-3, .brand-grid { grid-template-columns: repeat(2, 1fr); }
    .grid-2 { grid-template-columns: 1fr; }
    .list-cols { columns: 1; }
    nav.links { display: none; }
    #mobile-toggle { display: inline-block; }
  }
  @media (max-width: 600px) {
    section { padding: 64px 0; }
    .grid-3, .brand-grid, .grid-2 { grid-template-columns: 1fr; }
    .hero { padding: 56px 0 40px; }
    .hero-ctas .btn { width: 100%; }
    .flow-branches { grid-template-columns: 1fr; }
    .ai-panel, .cta-band { padding: 40px 22px; }
    .footer-grid { flex-direction: column; }
    #mobile-menu.open { display: flex; }
  }
`;

function flowVisual() {
  return `
    <div class="flow-card" aria-hidden="true">
      <div class="flow-node top">Lummet Control Plane</div>
      <div class="flow-arrow">↓ manages ↓</div>
      <div class="flow-branches">
        <div class="flow-node">Brand A</div>
        <div class="flow-node">Brand B</div>
        <div class="flow-node">Brand C</div>
        <div class="flow-node">Brand D</div>
      </div>
      <div class="flow-arrow">each with its own database &amp; configuration</div>
    </div>`;
}

function brandInitial(name) {
  return escapeHtml(name.replace(/\.(com|casino|xyz)$/i, "").slice(0, 2).toUpperCase());
}

function renderBrandCards(brands) {
  return brands
    .map(
      (b) => `
      <a class="brand-card" href="${escapeHtml(b.url)}" target="_blank" rel="noopener noreferrer">
        <div class="brand-mark">${brandInitial(b.name)}</div>
        <div class="brand-name">${escapeHtml(b.name)}</div>
        <div class="brand-category">${escapeHtml(b.category)}</div>
        <p class="brand-desc">${escapeHtml(b.description)}</p>
        <span class="brand-link">Visit site →</span>
      </a>`
    )
    .join("");
}

function contactBlock(contactEmail) {
  if (contactEmail) {
    return `
      <p class="lede">Interested in Lummet, partnership opportunities, technology licensing or a platform demonstration? Get in touch.</p>
      <a class="btn btn-primary btn-lg" href="mailto:${escapeHtml(contactEmail)}">Email ${escapeHtml(contactEmail)}</a>`;
  }
  return `
    <p class="lede">Interested in Lummet, partnership opportunities, technology licensing or a platform demonstration? Get in touch and our team will follow up.</p>
    <p style="font-size:13px;color:var(--ink-dim);">Contact details for this deployment haven't been configured yet.</p>`;
}

/**
 * Renders the fully self-contained, unauthenticated public
 * marketing homepage. Deliberately has its own <html> shell
 * (not renderShell/renderAuthShell from layout.js) so it never
 * shares the admin control-plane's visual identity, and pulls
 * brand data only from the public brand config — never from the
 * tenant registry DB — so no internal IDs, credentials, or
 * private tenant data can leak onto a public page.
 *
 * `contactEmail` is optional and comes from an already-configured
 * env var (e.g. env.CONTACT_EMAIL); nothing is invented if it's
 * unset.
 */
/**
 * Minimal, on-brand placeholder for the /privacy and /terms
 * footer links. Intentionally simple — real legal copy is
 * expected to replace this body text later; this just avoids
 * a broken/404 footer link on the public site.
 */
export function renderPublicStaticPage({ title, heading, bodyText }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Lummet</title>
  <meta name="robots" content="noindex" />
  <style>${STYLES}</style>
</head>
<body>
  <header class="site">
    <div class="nav-inner">
      <a class="logo" href="https://level.casino/media/lummet/1788359639229-55a3643f6bba8b7a.png"><span class="dot"></span> Lummet</a>
      <a class="btn btn-secondary" href="/">Back to Lummet</a>
    </div>
  </header>
  <main>
    <section class="tight">
      <div class="wrap" style="max-width:720px;">
        <h1>${escapeHtml(heading)}</h1>
        <p class="lede">${escapeHtml(bodyText)}</p>
      </div>
    </section>
  </main>
  <footer class="site">
    <div class="wrap footer-bottom">
      <span>© ${new Date().getFullYear()} Lummet. All rights reserved.</span>
    </div>
  </footer>
</body>
</html>`;
}

export function renderPublicHomepage({ contactEmail } = {}) {
  const brands = listPublicBrands();
  const canonicalUrl = "https://lummet.com/";

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "name": "Lummet",
        "url": canonicalUrl,
        "description": SITE_DESCRIPTION
      },
      {
        "@type": "WebSite",
        "name": "Lummet",
        "url": canonicalUrl
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(SITE_TITLE)}</title>
  <meta name="description" content="${escapeHtml(SITE_DESCRIPTION)}" />
  <link rel="canonical" href="${canonicalUrl}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(SITE_TITLE)}" />
  <meta property="og:description" content="${escapeHtml(SITE_DESCRIPTION)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(SITE_TITLE)}" />
  <meta name="twitter:description" content="${escapeHtml(SITE_DESCRIPTION)}" />

  <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
  <style>${STYLES}</style>
</head>
<body>

  <header class="site">
    <div class="nav-inner">
      <a class="logo" href="https://level.casino/media/lummet/1788359639229-55a3643f6bba8b7a.png"><span class="dot"></span> Lummet</a>
      <nav class="links">
        <a href="#platform">Platform</a>
        <a href="#brands">Brands</a>
        <a href="#ai">Lummet AI</a>
        <a href="#demo">Get a Demo</a>
        <a href="#contact">Contact</a>
      </nav>
      <div class="nav-cta">
        <a class="signin-link" href="/login">Sign in</a>
        <a class="btn btn-primary" href="#demo">Get a Demo</a>
        <button id="mobile-toggle" aria-label="Toggle menu" onclick="document.getElementById('mobile-menu').classList.toggle('open')">☰</button>
      </div>
    </div>
    <div id="mobile-menu" class="wrap" style="flex-direction:column;gap:14px;padding-bottom:18px;">
      <a href="#platform">Platform</a>
      <a href="#brands">Brands</a>
      <a href="#ai">Lummet AI</a>
      <a href="#demo">Get a Demo</a>
      <a href="#contact">Contact</a>
      <a href="/login">Sign in</a>
    </div>
  </header>

  <main>

    <!-- 1. Hero -->
    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <span class="eyebrow">Lummet Platform</span>
          <h1>One Platform. Multiple Brands. Centralized Control.</h1>
          <p class="lede">Lummet is the centralized technology and AI platform built to operate, manage and scale multiple digital properties from a single control plane.</p>
          <div class="hero-ctas">
            <a class="btn btn-primary btn-lg" href="#demo">Get a Demo</a>
            <a class="btn btn-secondary btn-lg" href="#brands">Explore Our Brands</a>
          </div>
        </div>
        ${flowVisual()}
      </div>
    </section>

    <!-- 2. What Is Lummet -->
    <section id="platform">
      <div class="wrap">
        <span class="eyebrow">What is Lummet?</span>
        <h2>The Technology Behind Multiple Digital Brands</h2>
        <p class="lede">Lummet separates the central management layer from each individual brand it powers. Every property keeps its own identity while being run, monitored and scaled from one place.</p>
        <ul class="list-cols">
          <li>Each brand operates independently</li>
          <li>Each tenant has its own configuration</li>
          <li>Each tenant can have its own database</li>
          <li>Centralized management through Lummet</li>
          <li>Secure communication between Lummet and tenants</li>
          <li>Scalable architecture for adding new brands</li>
          <li>AI-powered capabilities</li>
          <li>Centralized monitoring and operational visibility</li>
        </ul>
      </div>
    </section>

    <!-- 3. How Lummet Works -->
    <section class="section-soft">
      <div class="wrap">
        <span class="eyebrow">How it works</span>
        <h2>How Lummet Works</h2>
        <div class="grid-3">
          <div class="card">
            <div class="step-no">01 — Connect</div>
            <h3>Connect</h3>
            <p>Connect independent digital properties to the Lummet control plane.</p>
          </div>
          <div class="card">
            <div class="step-no">02 — Manage</div>
            <h3>Manage</h3>
            <p>Manage tenants, content, settings, capabilities, health and platform operations from one central environment.</p>
          </div>
          <div class="card">
            <div class="step-no">03 — Scale</div>
            <h3>Scale</h3>
            <p>Add new brands and properties without rebuilding the underlying platform from scratch.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. Platform Capabilities -->
    <section>
      <div class="wrap">
        <span class="eyebrow">Capabilities</span>
        <h2>Built for Scale. Designed for Control.</h2>
        <div class="grid-3">
          <div class="card"><div class="icon">◆</div><h3>Multi-Tenant Architecture</h3><p>Run multiple independent properties on a shared technology foundation.</p></div>
          <div class="card"><div class="icon">◈</div><h3>Centralized Management</h3><p>Manage connected properties from one control plane.</p></div>
          <div class="card"><div class="icon">✦</div><h3>AI-Powered Tools</h3><p>Use Lummet AI capabilities to accelerate content, operations and platform workflows.</p></div>
          <div class="card"><div class="icon">▤</div><h3>Content Management</h3><p>Manage reviews, news, pages, categories, countries, authors and other publishing resources.</p></div>
          <div class="card"><div class="icon">◎</div><h3>SEO Infrastructure</h3><p>Build and manage SEO-focused digital properties with structured content and metadata.</p></div>
          <div class="card"><div class="icon">⌖</div><h3>GEO Targeting</h3><p>Support location-aware content, rankings and digital experiences.</p></div>
          <div class="card"><div class="icon">⇄</div><h3>Affiliate Infrastructure</h3><p>Support affiliate-focused publishing and commercial integrations.</p></div>
          <div class="card"><div class="icon">◐</div><h3>Monitoring &amp; Health</h3><p>Maintain visibility into connected tenants and their operational status.</p></div>
          <div class="card"><div class="icon">🔒</div><h3>Security &amp; Auditability</h3><p>Centralized credentials, authentication and audit capabilities for platform administration.</p></div>
        </div>
      </div>
    </section>

    <!-- 5. Our Brands -->
    <section id="brands" class="section-soft">
      <div class="wrap">
        <span class="eyebrow">Our Brands</span>
        <h2>Brands Powered by Lummet</h2>
        <p class="lede">A growing network of independent digital properties operating on the Lummet technology platform.</p>
        <div class="brand-grid">
          ${renderBrandCards(brands)}
        </div>
      </div>
    </section>

    <!-- 6. Why Lummet -->
    <section>
      <div class="wrap why-grid">
        <div>
          <span class="eyebrow">Why Lummet</span>
          <h2>Built Once. Configured for Every Brand.</h2>
          <p class="lede">A shared technology foundation, independent brand configuration, and centralized management — so every brand keeps its own identity while still benefiting from the platform underneath it.</p>
          <div class="why-tags">
            <span class="tag">Identity</span>
            <span class="tag">Content</span>
            <span class="tag">Configuration</span>
            <span class="tag">Database</span>
            <span class="tag">Dashboard experience</span>
            <span class="tag">SEO structure</span>
            <span class="tag">GEO strategy</span>
          </div>
        </div>
        <div>
          <div class="stack-card"><b>Shared technology foundation</b>One platform, built once, powering every connected brand.</div>
          <div class="stack-card"><b>Independent brand configuration</b>Each property runs its own identity, content and settings.</div>
          <div class="stack-card"><b>Centralized management</b>Operated, monitored and scaled from a single control plane.</div>
        </div>
      </div>
    </section>

    <!-- 7. Lummet AI -->
    <section id="ai" class="section-soft">
      <div class="wrap">
        <div class="ai-panel">
          <span class="eyebrow">Lummet AI</span>
          <h2>Meet Lummet AI</h2>
          <p class="lede">AI-powered capabilities built directly into the platform to help teams create, manage and scale digital properties more efficiently.</p>
          <a class="btn btn-primary btn-lg" href="#demo">Discover Lummet AI</a>
        </div>
      </div>
    </section>

    <!-- 8. Built to Grow -->
    <section>
      <div class="wrap center">
        <span class="eyebrow">Built to Grow</span>
        <h2>Ready for the Next Brand</h2>
        <p class="lede center">The architecture is designed so additional properties can become tenants of the platform — add another brand without starting the technology stack from zero.</p>
        <div class="grow-visual">
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
            <span class="grow-chip">Current Brands</span>
            <span class="grow-chip new">+ New Brand</span>
            <span class="grow-chip new">+ Future Brand</span>
          </div>
          <div class="flow-arrow">↓</div>
          <div class="flow-node top" style="max-width:280px;">Lummet Control Plane</div>
        </div>
      </div>
    </section>

    <!-- 9. Get a Demo -->
    <section id="demo">
      <div class="wrap">
        <div class="cta-band">
          <h2>See Lummet in Action</h2>
          <p class="lede" style="margin:0 auto 28px;">Want to understand how Lummet can manage multiple digital properties from one centralized platform? Request a private demonstration.</p>
          <div class="hero-ctas" style="justify-content:center;">
            <a class="btn btn-primary btn-lg" href="#contact">Get a Demo</a>
            <a class="btn btn-secondary btn-lg" href="#contact">Contact Us</a>
          </div>
        </div>
      </div>
    </section>

    <!-- 10. Contact -->
    <section id="contact" class="tight">
      <div class="wrap center">
        <div class="contact-card">
          <span class="eyebrow">Let's Talk</span>
          <h2>Get in Touch</h2>
          ${contactBlock(contactEmail)}
        </div>
      </div>
    </section>

  </main>

  <footer class="site">
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <a class="logo" href="https://level.casino/media/lummet/1788359639229-55a3643f6bba8b7a.png"><span class="dot"></span> Lummet</a>
          <p style="max-width:280px;margin-top:10px;">Centralized technology and AI infrastructure for scalable digital brands.</p>
        </div>
        <nav class="footer-nav">
          <a href="#platform">Platform</a>
          <a href="#brands">Brands</a>
          <a href="#ai">Lummet AI</a>
          <a href="#demo">Get a Demo</a>
          <a href="#contact">Contact</a>
<!--          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a> -->
        </nav>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} Lummet. All rights reserved.</span>
      </div>
    </div>
  </footer>

</body>
</html>`;
}
