export function parseTrackingInput(input: string): { orderId: string; trackingToken: string } {
  const value = input.trim();
  try {
    const url = new URL(value, 'https://tracking.invalid');
    // Plain IDs are not links. Do not reinterpret them as arbitrary URL paths.
    if (!value.includes('?') && !/^https?:\/\//i.test(value)) {
      return { orderId: value, trackingToken: '' };
    }
    const pathId = url.pathname.match(/\/orders\/([^/]+)\/?$/)?.[1];
    return {
      orderId: (url.searchParams.get('order') || url.searchParams.get('orderId')
        || (pathId ? decodeURIComponent(pathId) : '')).trim(),
      trackingToken: (url.searchParams.get('trackingToken') || url.searchParams.get('token') || '').trim(),
    };
  } catch {
    return { orderId: value, trackingToken: '' };
  }
}