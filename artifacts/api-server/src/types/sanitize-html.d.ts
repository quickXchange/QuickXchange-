declare module "sanitize-html" {
  type SanitizeOptions = Record<string, unknown>;
  function sanitizeHtml(input: string, options?: SanitizeOptions): string;
  export default sanitizeHtml;
}