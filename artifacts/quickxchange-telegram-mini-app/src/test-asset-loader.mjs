// Node's test runner has no Vite asset pipeline. The tests inspect URLs, not image bytes.
export async function load(url, context, nextLoad) {
  if (/\.(png|webp)(?:\?|$)/.test(url)) {
    return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(url)};` };
  }
  return nextLoad(url, context);
}