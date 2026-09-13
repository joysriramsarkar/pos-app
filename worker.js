const worker = {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'lakhanb.vercel.app';
    url.protocol = 'https:';

    const headers = new Headers(request.headers);
    headers.set('Host', 'lakhanb.vercel.app');
    headers.set('X-Forwarded-Host', request.headers.get('Host') || 'pos.onuron.org');
    headers.set('X-Forwarded-Proto', 'https');

    return fetch(url.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: 'manual',
    });
  },
};

export default worker;
