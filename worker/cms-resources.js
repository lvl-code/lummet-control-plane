// =====================================================
// LUMMET CMS RESOURCE CONTRACT
//
// Drives the generic /cms/:resource screens in
// views/pages/cms.js. Unlike resources.js (which proxies
// a tenant's Super API over HTTPS), every one of these
// reads/writes this control plane's OWN D1 directly via
// cms.js — there is no remote call involved.
//
// Field types understood by cms.js's form renderer:
//   text / textarea   plain string, or null if empty
//   richtext           HTML string via the same rich text
//                       editor used by the tenant CRUD screens
//   select             one of `options`
//   number             real number, or null if empty
//   resource_select    numeric id, options pulled from another
//                       CMS resource (e.g. author_id -> authors)
//   tenant_select       numeric/text id, options pulled from the
//                       tenant registry (brands.tenant_id)
// =====================================================

export const CMS_RESOURCES = {
  pages: {
    label: "Pages",
    table: "lummet_pages",
    listColumns: [
      { key: "title", label: "Title" },
      { key: "slug", label: "Slug" },
      { key: "status", label: "Status" }
    ],
    orderBy: "title",
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true, hint: "lummet.com/p/<slug>" },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "excerpt", label: "Excerpt", type: "textarea" },
      { name: "content", label: "Content", type: "richtext" },
      { name: "author_id", label: "Author", type: "resource_select", optionsResource: "authors" },
      { name: "status", label: "Status", type: "select", options: ["draft", "published"] },
      { name: "seo_title", label: "SEO title", type: "text" },
      { name: "seo_description", label: "SEO description", type: "textarea" }
    ]
  },

  authors: {
    label: "Authors",
    table: "lummet_authors",
    listColumns: [
      { key: "name", label: "Name" },
      { key: "slug", label: "Slug" },
      { key: "title", label: "Title" }
    ],
    orderBy: "name",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "title", label: "Title", type: "text", hint: "e.g. Editor, Head of Partnerships" },
      { name: "bio", label: "Bio", type: "textarea" },
      { name: "avatar_url", label: "Avatar URL", type: "text" },
      { name: "social_links", label: "Social links (raw JSON)", type: "textarea", hint: '{"twitter":"https://..."}' }
    ]
  },

  brands: {
    label: "Brand profiles",
    table: "lummet_brands",
    listColumns: [
      { key: "name", label: "Name" },
      { key: "slug", label: "Slug" },
      { key: "status", label: "Status" }
    ],
    orderBy: "sort_order, name",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "tagline", label: "Tagline", type: "text" },
      { name: "description", label: "Description", type: "richtext" },
      { name: "logo_url", label: "Logo URL", type: "text" },
      { name: "website_url", label: "Website URL", type: "text" },
      { name: "tenant_id", label: "Linked tenant (optional)", type: "tenant_select" },
      { name: "status", label: "Status", type: "select", options: ["draft", "published"] },
      { name: "sort_order", label: "Sort order", type: "number" }
    ]
  },

  partners: {
    label: "Partners",
    table: "lummet_partners",
    listColumns: [
      { key: "name", label: "Name" },
      { key: "partner_type", label: "Type" },
      { key: "status", label: "Status" }
    ],
    orderBy: "sort_order, name",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "partner_type", label: "Type", type: "select", options: ["technology", "payments", "affiliate", "media", "other"] },
      { name: "logo_url", label: "Logo URL", type: "text" },
      { name: "website_url", label: "Website URL", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "status", label: "Status", type: "select", options: ["draft", "published"] },
      { name: "sort_order", label: "Sort order", type: "number" }
    ]
  },

  updates: {
    label: "Lummet updates",
    table: "lummet_updates",
    listColumns: [
      { key: "title", label: "Title" },
      { key: "status", label: "Status" },
      { key: "published_at", label: "Published at" }
    ],
    orderBy: "created_at DESC",
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "excerpt", label: "Excerpt", type: "textarea" },
      { name: "content", label: "Content", type: "richtext" },
      { name: "author_id", label: "Author", type: "resource_select", optionsResource: "authors" },
      { name: "featured_image", label: "Featured image URL", type: "text" },
      { name: "status", label: "Status", type: "select", options: ["draft", "published"] },
      { name: "published_at", label: "Published at", type: "text", hint: "ISO date, optional" }
    ]
  },

  publications: {
    label: "Publications",
    table: "lummet_publications",
    listColumns: [
      { key: "title", label: "Title" },
      { key: "publication_type", label: "Type" },
      { key: "status", label: "Status" }
    ],
    orderBy: "created_at DESC",
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "publication_type", label: "Type", type: "select", options: ["blog", "press", "report"] },
      { name: "excerpt", label: "Excerpt", type: "textarea" },
      { name: "content", label: "Content", type: "richtext" },
      { name: "source_name", label: "Source name", type: "text", hint: "if this is a press mention" },
      { name: "source_url", label: "Source URL", type: "text" },
      { name: "author_id", label: "Author", type: "resource_select", optionsResource: "authors" },
      { name: "featured_image", label: "Featured image URL", type: "text" },
      { name: "status", label: "Status", type: "select", options: ["draft", "published"] },
      { name: "published_at", label: "Published at", type: "text", hint: "ISO date, optional" }
    ]
  },

  advertisements: {
    label: "Advertisements",
    table: "lummet_advertisements",
    listColumns: [
      { key: "name", label: "Name" },
      { key: "placement", label: "Placement" },
      { key: "status", label: "Status" }
    ],
    orderBy: "sort_order, name",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "placement", label: "Placement", type: "select", options: ["homepage_hero", "homepage_banner", "homepage_sidebar", "homepage_footer"] },
      { name: "image_url", label: "Image URL", type: "text" },
      { name: "link_url", label: "Link URL", type: "text" },
      { name: "alt_text", label: "Alt text", type: "text" },
      { name: "status", label: "Status", type: "select", options: ["draft", "active", "paused"] },
      { name: "start_date", label: "Start date", type: "text", hint: "ISO date, optional" },
      { name: "end_date", label: "End date", type: "text", hint: "ISO date, optional" },
      { name: "sort_order", label: "Sort order", type: "number" }
    ]
  }
};

export function getCmsResourceConfig(key) {
  return CMS_RESOURCES[key] || null;
}
