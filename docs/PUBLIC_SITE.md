# Lummet public website

The public site (lummet.com) is rendered by the control-plane Worker from its
own D1 database. There is no mock data, no placeholder copy and no hardcoded
content list in code: what a visitor sees is exactly the set of **published**
rows in the database.

## Layout of the code (mirrors the tenant's organisation)

```
public/                          Workers Assets root (wrangler.jsonc "assets")
  templates/
    layout/base.html             <head>, skip link, {{> header}}, <main>{{{content}}}, {{> footer}}, scripts
    layout/header.html           logo, nav (from DB), theme toggle, CTA buttons, mobile menu
    layout/footer.html           brand blurb + link columns (from DB)
    components/*.html            cards, breadcrumbs, pagination, one partial per homepage section kind
    pages/*.html                 home, brands, brand, updates, update, insights, insight,
                                 partners, author, page, 404
  static/
    css/tokens.css               colours (light + dark), type scale, spacing, radii
    css/base.css                 reset, typography, layout, header, footer
    css/components.css           buttons, cards, sections, prose, FAQ, panel, stats
    css/pages.css                hero + network graph, page headers, articles, timeline
    js/theme.js                  applies light/dark before first paint
    js/nav.js                    mobile menu, theme toggle, header shadow
    js/reveal.js                 scroll reveal (content is visible without JS)
    js/filter.js                 brand category filter (progressive enhancement)
    js/article.js                copy-link button, external links in articles
    images/                      favicon.svg, brands/<logo files you own>

worker/public-site/
  router.js     routes, edge cache, static passthrough (returns null for admin paths)
  context.js    per-request site context: branding, nav/footer links, canonical base
  data.js       read-only D1 queries, always `status = 'published'`
  models.js     row -> safe view model (sanitized HTML, validated URLs)
  home.js       composes the homepage from lummet_homepage_sections
  pages.js      one handler per public page + SEO/JSON-LD
  seo.js        <title>, canonical, Open Graph, Twitter, JSON-LD builders
  render.js     shared layout render, security headers, cache headers
  template.js   the template engine ({{x}} escaped, {{{x}}} raw, if/else/unless/each, partials)
  sitemap.js    sitemap.xml and robots.txt generated from the DB
  hero-graph.js hero network diagram: one SVG node per published brand
  sanitize.js   HTML sanitizer for CMS rich text (same as the tenant's)
  icons.js, format.js
```

## Routes

| URL | Source |
|---|---|
| `/` | `lummet_homepage_sections` (ordered), `lummet_site_settings` (hero), counts |
| `/brands`, `/brands/:slug` | `lummet_brands` |
| `/updates`, `/updates/:slug` | `lummet_updates` (paginated, newest first) |
| `/insights`, `/insights/:slug` | `lummet_publications` (filter `?type=`) |
| `/partners` | `lummet_partners` |
| `/authors/:slug` | `lummet_authors` + their published work |
| `/about`, `/security`, `/privacy`, `/terms`, `/p/:slug` | `lummet_pages` |
| `/sitemap.xml`, `/robots.txt` | generated |
| `/static/*` | `public/static/**` |

`/` still shows the authenticated dashboard to a signed-in admin.

## What is managed where (Dashboard -> Lummet Site)

| Screen | Controls |
|---|---|
| Homepage settings | site name/logo/accent colours, homepage `<title>` and description, canonical URL, hero copy and buttons, footer text, contact email, list-page titles and intros |
| Homepage sections | which sections appear, their order, `kind`, background, title/eyebrow/body, button |
| Features | the cards, steps, checklist items and AI-panel items inside sections (`group_key` <-> section `feature_group`) |
| FAQs | the FAQ section, and FAQPage structured data |
| Navigation links | header, header buttons and the three footer columns |
| Brand profiles / Updates / Publications / Partners / Authors / Pages | the content pages, each with SEO title, description and social image |

Section kinds: `text`, `features`, `steps`, `checklist`, `panel`, `brands`,
`stats`, `updates`, `insights`, `partners`, `faq`, `cta`, `contact`.

## The "real content" rules the code enforces

- Drafts are never queried by a public route.
- A section whose data source has no published rows is not rendered.
- A navigation link with `visible_when` = `has_partners` (etc.) hides until that content exists; `/#anchor` links hide when the section is not on the page.
- Contact block, footer address and the "Get a Demo" buttons hide when no contact email is configured (`contact_email` setting, else the `CONTACT_EMAIL` var).
- The stats strip shows counts read from the database, never typed numbers.
- A brand without a `logo_url` shows an initials tile, not a fabricated logo.
- CMS URLs are restricted to `http(s)`, `mailto`, site-relative and `#`; CMS HTML is sanitized; accent colours are validated before reaching CSS.

## Caching

Rendered pages carry `Cache-Control: public, max-age=30, s-maxage=60,
stale-while-revalidate=300` and are stored with the Cache API, so D1 is not hit
on every view. A dashboard edit is live within about a minute. (The Cache API
only operates on custom domains, not `*.workers.dev`; there it renders each
request, which is still correct.)

## Content Security Policy

Public pages send `script-src 'self'`: there are no inline scripts, so a
stored-XSS payload in CMS content cannot execute even if a sanitizer gap is
found. Do not add inline `<script>` blocks to templates; add a file in
`public/static/js/` and reference it from `base.html`.

## Adding things

- **A new brand**: Brand profiles -> New. Upload the logo file to
  `public/static/images/brands/` (commit + deploy) and set Logo URL to
  `/static/images/brands/<file>`, or use a full `https://` URL.
- **A new homepage section**: Homepage sections -> New; pick a `kind`. For
  `features`/`steps`/`checklist`/`panel`, add Features rows with the same group.
- **A new page in the footer**: create the page in Pages, then add a
  Navigation link with Show when = `always` (an unpublished page 404s, so
  publish it first).
- **A new icon**: add its SVG path to `worker/public-site/icons.js` and to the
  Features `icon` list in `worker/cms-resources.js`.

## Tests

`npm test` runs `test/public-site.test.js` against the real migrations, the real
seed, the real templates and the real router (D1 -> `node:sqlite`, ASSETS ->
the `public/` folder).
