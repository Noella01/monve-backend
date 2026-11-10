import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

let moduleId = 0;
async function services(env = {}) {
  const result = await build({
    stdin: {
      contents: `export * from './frontend/src/services/api.ts'; export * from './frontend/src/services/account.ts'; export * from './frontend/src/services/http.ts';`,
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'import.meta.env': JSON.stringify(env) },
  });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text + `\n// instance ${++moduleId}`).toString('base64'));
}

function guardBrowserStorage(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { assert.fail('Services must not restore records from the removed backend cache'); },
    setItem() { assert.fail('Services must not fabricate local records'); },
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
}

test('standalone storefront has a catalogue and rejects service operations without network access', async t => {
  guardBrowserStorage(t);
  const network = t.mock.method(globalThis, 'fetch', async () => { assert.fail('Unexpected network request'); });
  const oldEvents = globalThis.EventSource;
  globalThis.EventSource = class { constructor() { assert.fail('Unexpected event stream'); } };
  t.after(() => { if (oldEvents) globalThis.EventSource = oldEvents; else delete globalThis.EventSource; });
  const api = await services();
  assert.equal(api.isBackendConfigured, false);
  assert.ok((await api.getProducts()).length > 0);
  const unsubscribe = api.subscribeToStoreEvents('order_created', () => assert.fail('Unexpected successful order'));
  const operations = [
    () => api.accountRequest('session'), () => api.accountRequest('login', {}),
    () => api.apiFetch('/api/admin/login', { method: 'POST' }),
    () => api.getOrders(), () => api.getCustomRequests(), () => api.getFlutterwaveConfig(),
    () => api.createOrder({}), () => api.updateOrderStatus('old', 'CONFIRMED'),
    () => api.createCustomRequest({}), () => api.updateCustomRequestStatus('old', 'COMPLETED'),
    () => api.createProduct({}), () => api.updateProduct('old', {}), () => api.deleteProduct('old'),
    () => api.updateFlutterwaveConfig({}),
  ];
  for (const operation of operations) await assert.rejects(operation(), /temporarily unavailable/);
  unsubscribe();
  assert.equal(network.mock.calls.length, 0);
});

test('a replacement API receives the request and only confirmed writes emit success', async t => {
  guardBrowserStorage(t);
  const saved = { id: 'replacement-request', request_number: 'REQ-NEW-001', status: 'NEW' };
  const network = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(saved), { status: 201 }));
  const api = await services({ VITE_API_BASE_URL: 'https://replacement.example.test/' });
  let event;
  const unsubscribe = api.subscribeToStoreEvents('custom_request_created', data => { event = data; });
  assert.deepEqual(await api.createCustomRequest({ clothing_type: 'Shirt' }), saved);
  assert.deepEqual(event, saved);
  const [url, options] = network.mock.calls[0].arguments;
  assert.equal(url, 'https://replacement.example.test/api/custom-requests');
  assert.equal(options.credentials, 'include');
  assert.equal(options.method, 'POST');
  assert.deepEqual(JSON.parse(options.body), { clothing_type: 'Shirt' });
  unsubscribe();
});

test('server and network failures cannot become local orders or successful submissions', async t => {
  guardBrowserStorage(t);
  const network = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 503 }));
  const api = await services({ VITE_API_BASE_URL: 'https://replacement.example.test' });
  const unsubscribe = api.subscribeToStoreEvents('order_created', () => assert.fail('Failed order emitted success'));
  await assert.rejects(api.createOrder({}), /Service unavailable/);
  await assert.rejects(api.createCustomRequest({}), /Service unavailable/);
  network.mock.mockImplementation(async () => { throw new TypeError('Network unavailable'); });
  await assert.rejects(api.createOrder({}), /Network unavailable/);
  await assert.rejects(api.updateCustomRequestStatus('old', 'COMPLETED'), /Network unavailable/);
  unsubscribe();
});
