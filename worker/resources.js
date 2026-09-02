// =====================================================
// RESOURCE CONTRACT
// Drives the generic CRUD screens. Every field/type/
// required/lockOnEdit rule below was verified directly
// against the tenant's own code — not guessed:
//
//   - en/worker/database/*.js   the actual INSERT/UPDATE
//                                column lists and bind order
//   - en/worker/api.js           the actual validate([...])
//                                required-field lists
//   - en/static/js/admin.js      the tenant's own admin
//                                frontend's real serialization
//                                (pros/cons newline-splitting,
//                                faq_json sent as a raw string,
//                                seo fields null-not-empty, etc.)
//
// Field types and what they mean for serialization (see
// crud.js's coerceFieldValue — this is where each type's
// wire format is actually implemented):
//
//   text/select   string, or null if empty (matches the
//                 tenant's own `formData.get(x) || null`
//                 convention for optional fields)
//   textarea      same as text, just a bigger box
//   number        real number, or null if empty
//   checkbox      real boolean
//   list          newline-separated textarea -> real JS array
//                 (e.g. reviews.pros/cons, casinos.features —
//                 the DB layer JSON.stringify()s these itself)
//   json_object   JSON textarea -> parsed object/array (the DB
//                 layer JSON.stringify()s it again itself, e.g.
//                 pages.content_json — sending an object here
//                 avoids double-encoding)
//   json_raw      JSON textarea -> the RAW STRING is sent as-is
//                 (e.g. reviews.faq_json, components.settings_json,
//                 authors.social_links — the DB layer does NOT
//                 re-encode these, it stores the string verbatim)
//   richtext      HTML string via the built-in rich text editor
//   media         numeric media_library id, via the media picker
//
// `lockOnEdit: true` means the tenant's own update function does
// NOT include that column in its UPDATE statement at all — it is
// genuinely immutable after creation (verified per-resource, not
// assumed). Fields without `lockOnEdit` that ARE editable but also
// double as the record's identity (e.g. casinos.slug, news.slug,
// authors.slug) support rename-on-edit exactly like the tenant's
// own admin — the URL/route param is the OLD value used to find
// the row, and the field's new value in the body becomes the new
// identity, verified against updateCasino/updateNews/updateAuthor.
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
      { key: "featured", label: "Featured", type: "bool" },
      { key: "rating", label: "Rating" }
    ],
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "affiliate_url", label: "Affiliate URL", type: "text", required: true },
      { name: "website_url", label: "Website URL", type: "text" },
      { name: "logo", label: "Logo URL", type: "text" },
      { name: "rating", label: "Rating", type: "number", step: "0.1" },
      { name: "bonus_title", label: "Bonus title", type: "text" },
      { name: "bonus_value", label: "Bonus value", type: "text" },
      { name: "features", label: "Features", type: "list", hint: "one per line" },
      { name: "status", label: "Status", type: "select", options: ["draft", "published"] },
      { name: "featured", label: "Featured", type: "checkbox" },
      { name: "sort_order", label: "Sort order", type: "number" },
      { name: "logo_media_id", label: "Logo image", type: "media" },
      { name: "hero_image_media_id", label: "Hero image", type: "media" },
      // Not real columns on `casinos` — the tenant's Super API
      // (handleGetCasino/handleCreateCasino/handleUpdateCasino)
      // reads/writes these through casino_categories and geo_rules
      // respectively, and attaches them to the record as
      // category_ids / geo_rules so this generic form can round-trip
      // them like any other field.
      {
        name: "category_ids",
        label: "Categories",
        type: "multi_select",
        optionsResource: "categories",
        optionValueKey: "id",
        optionLabelKey: "name",
        castTo: "number"
      },
      {
        name: "geo_rules",
        label: "Countries",
        type: "geo_rules",
        optionsResource: "countries",
        optionValueKey: "code",
        optionLabelKey: "name",
        hint: "which countries can see/access this casino"
      },
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
      // Verified: updateReview's SET clause does not include slug,
      // casino_slug, or country_code — genuinely immutable post-create.
      { name: "slug", label: "Slug", type: "text", required: true, lockOnEdit: true },
      { name: "casino_slug", label: "Casino slug", type: "text", required: true, lockOnEdit: true },
      { name: "country_code", label: "Country code", type: "text", lockOnEdit: true },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "content", label: "Content", type: "richtext", required: true },
      { name: "overview", label: "Overview", type: "textarea" },
      { name: "games", label: "Games", type: "textarea" },
      { name: "bonuses", label: "Bonuses", type: "textarea" },
      { name: "payments", label: "Payments", type: "textarea" },
      { name: "licenses", label: "Licenses", type: "textarea" },
      { name: "verdict", label: "Verdict", type: "textarea" },
      { name: "pros", label: "Pros", type: "list", hint: "one per line" },
      { name: "cons", label: "Cons", type: "list", hint: "one per line" },
      { name: "faq_json", label: "FAQ", type: "json_raw" },
      { name: "rating", label: "Rating", type: "number", step: "0.1" },
      { name: "author_id", label: "Author ID", type: "number" },
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
      // Verified: updateNews DOES rename (slug is in its SET clause).
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "content", label: "Content", type: "richtext", required: true },
      { name: "excerpt", label: "Excerpt", type: "textarea" },
      { name: "author", label: "Author name", type: "text" },
      { name: "author_id", label: "Author ID", type: "number" },
      { name: "tags", label: "Tags", type: "text", hint: "comma-separated" },
      { name: "featured_image", label: "Featured image", type: "media" },
      // IMPORTANT: updateNews defaults published to 1 whenever the
      // field is absent from the payload — omitting this checkbox
      // from the form would silently force-republish every edited
      // post. It must always be included and always sent.
      { name: "published", label: "Published", type: "checkbox" },
      { name: "published_at", label: "Published at", type: "text", hint: "ISO date, optional" },
      { name: "ad_mode", label: "Ad mode", type: "select", options: ["auto", "disable"] },
      { name: "ai_generated", label: "AI generated", type: "checkbox" },
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
      // Verified: updatePage's SET clause is ONLY title,
      // content_json, seo_title, seo_description, author_id.
      // slug/type/template/published are genuinely frozen after
      // creation on this tenant.
      { name: "slug", label: "Slug", type: "text", required: true, lockOnEdit: true },
      { name: "type", label: "Type", type: "text", required: true, lockOnEdit: true },
      { name: "template", label: "Template", type: "text", required: true, lockOnEdit: true },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "content_json", label: "Content", type: "json_object" },
      { name: "author_id", label: "Author ID", type: "number" },
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
      // Verified: updateCategory's SET clause does not include slug.
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
      // Verified: updateAuthor DOES rename (slug is in its SET clause).
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "bio", label: "Bio", type: "textarea" },
      { name: "avatar_url", label: "Avatar URL", type: "text" },
      { name: "role", label: "Role", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "social_links", label: "Social links", type: "json_raw" },
      { name: "published", label: "Published", type: "checkbox" },
      { name: "seo_title", label: "SEO title", type: "text" },
      { name: "seo_description", label: "SEO description", type: "textarea" }
    ]
  },

  media: {
    label: "Media",
    section: "System",
    idField: "id",
    // Create happens through the dedicated upload flow (base64
    // JSON — see client.js/handlers.js), not the generic create
    // form, since it needs a file rather than text fields.
    supportsCreate: false,
    supportsDelete: true,
    listColumns: [
      { key: "filename", label: "Filename" },
      { key: "folder", label: "Folder" },
      { key: "type", label: "Type" },
      { key: "url", label: "URL" }
    ],
    fields: [
      // Verified against updateMediaItem (media_library.js) — the
      // only fields it actually persists.
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
    supportsDelete: true,
    roleOnly: true, // Super API only exposes role updates for users
    listColumns: [
      { key: "email", label: "Email" },
      { key: "role", label: "Role" },
      { key: "created_at", label: "Created" }
    ],
    fields: [{ name: "role", label: "Role", type: "text", required: true }]
  },

  components: {
    label: "Components",
    section: "System",
    idField: "id",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "name", label: "Name" },
      { key: "slug", label: "Slug" },
      { key: "type", label: "Type" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", hint: "auto-generated from name if left blank" },
      { name: "type", label: "Type", type: "text", required: true },
      { name: "title", label: "Title", type: "text" },
      { name: "content", label: "Content", type: "richtext" },
      { name: "settings_json", label: "Settings", type: "json_raw" },
      { name: "status", label: "Status", type: "select", options: ["active", "inactive"] }
    ]
  },

  blocks: {
    label: "Blocks",
    section: "System",
    idField: "id",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "page_type", label: "Page type" },
      { key: "page_slug", label: "Page slug" },
      { key: "name", label: "Component" },
      { key: "injection_point", label: "Injection point" },
      { key: "enabled", label: "Enabled", type: "bool" }
    ],
    fields: [
      // Verified: updatePageComponentAssignment's SET clause is
      // ONLY position and injection_point — page_type, page_slug,
      // and component_id are genuinely immutable once assigned
      // (assign a new block instead of trying to repoint one).
      { name: "page_type", label: "Page type", type: "text", required: true, lockOnEdit: true },
      { name: "page_slug", label: "Page slug", type: "text", required: true, lockOnEdit: true, hint: "'*' matches all pages of this type" },
      { name: "component_id", label: "Component ID", type: "number", required: true, lockOnEdit: true },
      { name: "position", label: "Position", type: "number" },
      { name: "injection_point", label: "Injection point", type: "text", hint: "e.g. content_bottom" },
      { name: "enabled", label: "Enabled", type: "checkbox" }
    ]
  },

  "nav-items": {
    label: "Navigation",
    section: "System",
    idField: "id",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "label", label: "Label" },
      { key: "url", label: "URL" },
      { key: "location", label: "Location" },
      { key: "enabled", label: "Enabled", type: "bool" }
    ],
    fields: [
      { name: "label", label: "Label", type: "text", required: true },
      { name: "url", label: "URL", type: "text", required: true },
      { name: "location", label: "Location", type: "text", hint: "e.g. header, footer" },
      { name: "parent_id", label: "Parent nav item ID", type: "number" },
      { name: "position", label: "Position", type: "number" },
      { name: "icon", label: "Icon", type: "text" },
      { name: "is_external", label: "Opens externally", type: "checkbox" },
      { name: "enabled", label: "Enabled", type: "checkbox" }
    ]
  },

  banners: {
    label: "Banners",
    section: "System",
    idField: "id",
    supportsCreate: true,
    supportsDelete: true,
    listColumns: [
      { key: "type", label: "Type" },
      { key: "title", label: "Title" },
      { key: "position", label: "Position" },
      { key: "enabled", label: "Enabled", type: "bool" }
    ],
    fields: [
      { name: "type", label: "Type", type: "text", hint: "e.g. announcement" },
      { name: "title", label: "Title", type: "text" },
      { name: "content", label: "Content", type: "richtext" },
      { name: "link", label: "Link URL", type: "text" },
      { name: "button_text", label: "Button text", type: "text" },
      { name: "bg_color", label: "Background color", type: "text", hint: "hex, e.g. #6c5ce7" },
      { name: "text_color", label: "Text color", type: "text", hint: "hex, e.g. #ffffff" },
      { name: "position", label: "Position", type: "select", options: ["top", "bottom"] },
      { name: "dismissible", label: "Dismissible", type: "checkbox" },
      { name: "geo_countries", label: "Countries", type: "text", hint: "comma-separated country codes, blank = all" },
      { name: "start_date", label: "Start date", type: "text", hint: "ISO date, optional" },
      { name: "end_date", label: "End date", type: "text", hint: "ISO date, optional" },
      { name: "enabled", label: "Enabled", type: "checkbox" }
    ]
  }
};

export function getResourceConfig(key) {
  return RESOURCES[key] || null;
}
