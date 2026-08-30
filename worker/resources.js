// =====================================================
// RESOURCE CONFIGURATION
// Drives the generic CRUD screens. Field lists mirror the
// tenant repo's actual schema.sql columns; idField/verbs
// mirror the actual Phase 1 Super API handler signatures
// (en/worker/super/handlers.js) — e.g. casinos/reviews/
// news/pages/categories key on :slug, countries on :code,
// authors/media/users key on numeric :id.
// =====================================================

export const RESOURCES = {
  casinos: {
    label: "Casinos",
    section: "Content",
    idField: "slug",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "name", label: "Name" },
      { key: "slug", label: "Slug" },
      { key: "status", label: "Status" },
      { key: "published", label: "Published", type: "bool" },
      { key: "featured", label: "Featured", type: "bool" },
      { key: "rating", label: "Rating" }
    ],
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true, lockOnEdit: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "website_url", label: "Website URL", type: "text", required: true },
      { name: "affiliate_url", label: "Affiliate URL", type: "text", required: true },
      { name: "logo", label: "Logo URL", type: "text" },
      { name: "rating", label: "Rating", type: "number", step: "0.1" },
      { name: "bonus_title", label: "Bonus title", type: "text" },
      { name: "bonus_value", label: "Bonus value", type: "text" },
      { name: "license", label: "License", type: "text" },
      { name: "owner", label: "Owner", type: "text" },
      { name: "status", label: "Status", type: "select", options: ["draft", "published"] },
      { name: "sort_order", label: "Sort order", type: "number" },
      { name: "published", label: "Published", type: "checkbox" },
      { name: "featured", label: "Featured", type: "checkbox" },
      { name: "seo_title", label: "SEO title", type: "text" },
      { name: "seo_description", label: "SEO description", type: "textarea" }
    ]
  },

  reviews: {
    label: "Reviews",
    section: "Content",
    idField: "slug",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "title", label: "Title" },
      { key: "slug", label: "Slug" },
      { key: "casino_slug", label: "Casino" },
      { key: "rating", label: "Rating" },
      { key: "published", label: "Published", type: "bool" }
    ],
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true, lockOnEdit: true },
      { name: "casino_slug", label: "Casino slug", type: "text", required: true },
      { name: "country_code", label: "Country code", type: "text" },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "content", label: "Content", type: "textarea", required: true },
      { name: "overview", label: "Overview", type: "textarea" },
      { name: "pros", label: "Pros", type: "textarea" },
      { name: "cons", label: "Cons", type: "textarea" },
      { name: "verdict", label: "Verdict", type: "textarea" },
      { name: "rating", label: "Rating", type: "number", step: "0.1" },
      { name: "author", label: "Author name", type: "text" },
      { name: "published", label: "Published", type: "checkbox" },
      { name: "seo_title", label: "SEO title", type: "text" },
      { name: "seo_description", label: "SEO description", type: "textarea" }
    ]
  },

  news: {
    label: "News",
    section: "Content",
    idField: "slug",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "title", label: "Title" },
      { key: "slug", label: "Slug" },
      { key: "published", label: "Published", type: "bool" },
      { key: "published_at", label: "Published at" }
    ],
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true, lockOnEdit: true },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "content", label: "Content", type: "textarea", required: true },
      { name: "excerpt", label: "Excerpt", type: "textarea" },
      { name: "author", label: "Author name", type: "text" },
      { name: "tags", label: "Tags", type: "text" },
      { name: "published", label: "Published", type: "checkbox" },
      { name: "seo_title", label: "SEO title", type: "text" },
      { name: "seo_description", label: "SEO description", type: "textarea" }
    ]
  },

  pages: {
    label: "Pages",
    section: "Content",
    idField: "slug",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "title", label: "Title" },
      { key: "slug", label: "Slug" },
      { key: "type", label: "Type" },
      { key: "published", label: "Published", type: "bool" }
    ],
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true, lockOnEdit: true },
      { name: "type", label: "Type", type: "text", required: true },
      { name: "template", label: "Template", type: "text", required: true },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "content_json", label: "Content (JSON)", type: "textarea" },
      { name: "published", label: "Published", type: "checkbox" },
      { name: "seo_title", label: "SEO title", type: "text" },
      { name: "seo_description", label: "SEO description", type: "textarea" }
    ]
  },

  categories: {
    label: "Categories",
    section: "Content",
    idField: "slug",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "name", label: "Name" },
      { key: "slug", label: "Slug" }
    ],
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true, lockOnEdit: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "seo_title", label: "SEO title", type: "text" },
      { name: "seo_description", label: "SEO description", type: "textarea" }
    ]
  },

  countries: {
    label: "Countries",
    section: "Content",
    idField: "code",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "legal_status", label: "Legal status" }
    ],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, lockOnEdit: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "currency", label: "Currency", type: "text" },
      { name: "language", label: "Language", type: "text" },
      { name: "legal_status", label: "Legal status", type: "text" },
      { name: "seo_title", label: "SEO title", type: "text" },
      { name: "seo_description", label: "SEO description", type: "textarea" }
    ]
  },

  authors: {
    label: "Authors",
    section: "Content",
    idField: "id",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "name", label: "Name" },
      { key: "slug", label: "Slug" },
      { key: "role", label: "Role" },
      { key: "published", label: "Published", type: "bool" }
    ],
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true, lockOnEdit: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "bio", label: "Bio", type: "textarea" },
      { name: "avatar_url", label: "Avatar URL", type: "text" },
      { name: "role", label: "Role", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "published", label: "Published", type: "checkbox" },
      { name: "seo_title", label: "SEO title", type: "text" },
      { name: "seo_description", label: "SEO description", type: "textarea" }
    ]
  },

  media: {
    label: "Media",
    section: "System",
    idField: "id",
    supportsCreate: false, // no upload endpoint in Super API Phase 1
    supportsDelete: true,
    listColumns: [
      { key: "filename", label: "Filename" },
      { key: "folder", label: "Folder" },
      { key: "type", label: "Type" },
      { key: "url", label: "URL" }
    ],
    fields: [
      { name: "alt_text", label: "Alt text", type: "text" },
      { name: "caption", label: "Caption", type: "text" },
      { name: "folder", label: "Folder", type: "text" }
    ]
  },

  users: {
    label: "Users",
    section: "System",
    idField: "id",
    supportsCreate: false,
    supportsDelete: false,
    roleOnly: true, // Super API only exposes role updates for users
    listColumns: [
      { key: "email", label: "Email" },
      { key: "role", label: "Role" },
      { key: "created_at", label: "Created" }
    ],
    fields: [{ name: "role", label: "Role", type: "text", required: true }]
  }
};

export function getResourceConfig(key) {
  return RESOURCES[key] || null;
}
