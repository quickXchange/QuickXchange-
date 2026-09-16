import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from '@playwright/test';

const operatorToken = process.env.LIVE_OPERATOR_BEARER_TOKEN;
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type Upload = {
  uploadURL: string;
  objectPath: string;
};

async function requestUpload(
  request: APIRequestContext,
  name: string,
  contentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml',
  size: number,
): Promise<Upload> {
  const response = await request.post('/api/admin/payment-methods/logo-upload', {
    data: { name, contentType, size },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<Upload>;
}

test('operator uploads, validates, renders, and cleans up payment-method logos', async ({
  page,
  request,
}, testInfo) => {
  test.skip(!operatorToken, 'LIVE_OPERATOR_BEARER_TOKEN is required for the live App Storage check.');
  const baseURL = String(testInfo.project.use.baseURL);
  const operatorApi = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { authorization: `Bearer ${operatorToken}` },
  });

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const methodId = `e2e-logo-${suffix}`;
  const uploadedObjectPaths = new Set<string>();
  let methodCreated = false;

  try {
    const valid = await requestUpload(operatorApi, `${methodId}.png`, 'image/png', tinyPng.length);
    uploadedObjectPaths.add(valid.objectPath);
    const validPut = await request.put(valid.uploadURL, {
      data: tinyPng,
      headers: { 'content-type': 'image/png' },
    });
    expect(validPut.ok(), await validPut.text()).toBeTruthy();

    const create = await operatorApi.post('/api/admin/payment-methods', {
      data: {
        id: methodId,
        name: `Live logo ${suffix}`,
        logoObjectPath: valid.objectPath,
        description: null,
        instructions: null,
        enabled: true,
        canSend: true,
        canReceive: true,
        fieldDefinitions: [],
      },
    });
    expect(create.status(), await create.text()).toBe(201);
    methodCreated = true;
    const created = await create.json() as { logoUrl: string };

    const attachedDeletion = await operatorApi.delete(
      `/api/admin/payment-methods/logo-upload/${valid.objectPath.split('/').at(-1)}`,
    );
    expect(attachedDeletion.status()).toBe(409);
    expect(await attachedDeletion.json()).toMatchObject({ code: 'PAYMENT_METHOD_LOGO_IN_USE' });

    await page.goto('/');
    await page.setContent(`<img id="public-logo" alt="Uploaded payment method logo">`);
    await page.locator('#public-logo').evaluate(
      (image, source) => { (image as HTMLImageElement).src = source; },
      created.logoUrl,
    );
    await expect.poll(
      () => page.locator('#public-logo').evaluate((image) => ({
        complete: (image as HTMLImageElement).complete,
        width: (image as HTMLImageElement).naturalWidth,
      })),
    ).toEqual({ complete: true, width: 1 });

    const validSvgBytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#2563eb"/></svg>',
    );
    const validSvg = await requestUpload(operatorApi, `${methodId}.svg`, 'image/svg+xml', validSvgBytes.length);
    uploadedObjectPaths.add(validSvg.objectPath);
    const validSvgPut = await request.put(validSvg.uploadURL, {
      data: validSvgBytes,
      headers: { 'content-type': 'image/svg+xml' },
    });
    expect(validSvgPut.ok(), await validSvgPut.text()).toBeTruthy();
    const updateWithSvg = await operatorApi.patch(`/api/admin/payment-methods/${methodId}`, {
      data: { logoObjectPath: validSvg.objectPath },
    });
    expect(updateWithSvg.ok(), await updateWithSvg.text()).toBeTruthy();
    const updated = await updateWithSvg.json() as { logoUrl: string; logoObjectPath: string };
    expect(updated.logoObjectPath).toBe(validSvg.objectPath);
    await page.locator('#public-logo').evaluate(
      (image, source) => { (image as HTMLImageElement).src = source; },
      updated.logoUrl,
    );
    await expect.poll(
      () => page.locator('#public-logo').evaluate((image) => ({
        complete: (image as HTMLImageElement).complete,
        width: (image as HTMLImageElement).naturalWidth,
      })),
    ).toEqual({ complete: true, width: 32 });

    const unsafeSvgBytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const svg = await requestUpload(operatorApi, `${methodId}-unsafe.svg`, 'image/svg+xml', unsafeSvgBytes.length);
    uploadedObjectPaths.add(svg.objectPath);
    const svgPut = await request.put(svg.uploadURL, {
      data: unsafeSvgBytes,
      headers: { 'content-type': 'image/svg+xml' },
    });
    expect(svgPut.ok(), await svgPut.text()).toBeTruthy();
    const attachMissingSvg = await operatorApi.patch(`/api/admin/payment-methods/${methodId}`, {
      data: { logoObjectPath: svg.objectPath },
    });
    expect(attachMissingSvg.status()).toBe(400);
    expect(await attachMissingSvg.json()).toMatchObject({ code: 'PAYMENT_METHOD_LOGO_INVALID' });

    const oversizedBytes = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    const oversized = await requestUpload(
      operatorApi,
      `${methodId}-oversized.png`,
      'image/png',
      5 * 1024 * 1024,
    );
    uploadedObjectPaths.add(oversized.objectPath);
    const oversizedPut = await request.put(oversized.uploadURL, {
      data: oversizedBytes,
      headers: { 'content-type': 'image/png' },
    });
    expect(oversizedPut.ok(), await oversizedPut.text()).toBeTruthy();
    const attachOversized = await operatorApi.patch(`/api/admin/payment-methods/${methodId}`, {
      data: { logoObjectPath: oversized.objectPath },
    });
    expect(attachOversized.status()).toBe(400);
    expect(await attachOversized.json()).toMatchObject({ code: 'PAYMENT_METHOD_LOGO_INVALID' });
  } finally {
    const cleanupErrors: string[] = [];
    if (methodCreated) {
      try {
        const deletion = await operatorApi.delete(`/api/admin/payment-methods/${methodId}`);
        if (![204, 404].includes(deletion.status())) {
          cleanupErrors.push(`payment method cleanup returned ${deletion.status()}`);
        }
      } catch (error) {
        cleanupErrors.push(`payment method cleanup failed: ${String(error)}`);
      }
    }
    for (const objectPath of uploadedObjectPaths) {
      const id = objectPath.split('/').at(-1);
      if (!id) continue;
      try {
        const deletion = await operatorApi.delete(`/api/admin/payment-methods/logo-upload/${id}`);
        if (![204, 404].includes(deletion.status())) {
          cleanupErrors.push(`${objectPath} cleanup returned ${deletion.status()}`);
        }
      } catch (error) {
        cleanupErrors.push(`${objectPath} cleanup failed: ${String(error)}`);
      }
      try {
        const publicRead = await request.get(`/api/storage${objectPath}`);
        if (publicRead.status() !== 404) {
          cleanupErrors.push(`${objectPath} remained public with status ${publicRead.status()}`);
        }
      } catch (error) {
        cleanupErrors.push(`${objectPath} public cleanup check failed: ${String(error)}`);
      }
    }
    await operatorApi.dispose();
    expect(cleanupErrors).toEqual([]);
  }
});