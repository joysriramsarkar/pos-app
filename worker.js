/**
 * @deprecated এই ফাইলটি পুরনো — Vercel-এ proxy করার জন্য তৈরি হয়েছিল।
 *
 * এখন opennextjs-cloudflare ব্যবহার হচ্ছে।
 * `npm run build:worker` চালালে `.open-next/worker.js` তৈরি হয়,
 * এবং `wrangler.jsonc`-এ `"main": ".open-next/worker.js"` সেট আছে।
 *
 * এই ফাইলটি deploy-এ ব্যবহার হয় না।
 */

const worker = {
  async fetch(request) {
    const url = new URL(request.url);
    const originalHost = request.headers.get('Host') || 'pos.onuron.org';

    // Target Vercel production deployment
    url.hostname = 'lakhanb.vercel.app';
    url.protocol = 'https:';

    const reqHeaders = new Headers(request.headers);
    reqHeaders.set('Host', 'lakhanb.vercel.app');
    reqHeaders.set('X-Forwarded-Host', originalHost);
    reqHeaders.set('X-Forwarded-Proto', 'https');

    const newReq = new Request(url.toString(), {
      method: request.method,
      headers: reqHeaders,
      body: request.body,
      redirect: 'manual',
    });

    const response = await fetch(newReq);

    // Forward response and rewrite redirects to stay on pos.onuron.org
    const respHeaders = new Headers(response.headers);
    const location = respHeaders.get('Location');
    if (location) {
      try {
        const locUrl = new URL(location, url.origin);
        if (locUrl.hostname === 'lakhanb.vercel.app') {
          locUrl.hostname = originalHost;
          locUrl.protocol = 'https:';
          respHeaders.set('Location', locUrl.toString());
        }
      } catch {
        // Ignore malformed redirect headers
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  },
};

export default worker;

