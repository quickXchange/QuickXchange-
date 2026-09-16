import sanitizeHtml from "sanitize-html";

/**
 * Single write-boundary contract for article HTML. The same sanitizer policy
 * must be used by every producer (editor, automation, and future imports).
 * sanitize-html parses malformed markup and drops unknown/event attributes;
 * SVG/MathML, CSS, srcdoc, and non-web URL schemes are deliberately absent.
 */
export function sanitizeBlogHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [
      "p", "br", "h2", "h3", "h4", "strong", "em", "u", "s", "blockquote",
      "ul", "ol", "li", "a", "img", "figure", "figcaption", "code", "pre",
    ],
    allowedAttributes: {
      "*": ["class"],
      a: ["href", "title", "rel", "target"],
      img: ["src", "alt", "title", "width", "height", "loading"],
    },
    allowedClasses: {
      "*": [
        "qx-service-visual",
        "qx-service-widget",
        "qx-service-pairs",
        "qx-service-steps",
        "qx-service-tracking",
        "qx-service-rates",
        "qx-service-features",
        "qx-service-kicker",
        "qx-service-chip",
        "qx-service-metric",
        "qx-service-action",
      ],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
    parser: { lowerCaseTags: true },
  }).trim();
}