const fetchWithoutProvider = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), "http://127.0.0.1");
  if (url.hostname === "whitebit.com" || url.hostname.endsWith(".whitebit.com")) {
    throw new Error("WhiteBIT network calls are blocked in isolated integration tests.");
  }
  return fetchWithoutProvider(input, init);
};