import * as http from 'http';

async function rpc(method: string, params: unknown[]): Promise<any> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const response = await new Promise<any>((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: 23119,
        path: '/better-bibtex/json-rpc',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('error', reject);
        res.on('end', () => {
          if (res.statusCode !== 200)
            return reject(new Error(`Zotero HTTP ${res.statusCode}`));
          try {
            resolve(JSON.parse(data));
          } catch (_error) {
            reject(new Error('Invalid JSON response from Zotero.'));
          }
        });
      },
    );
    request.on('error', reject);
    request.setTimeout(5000, () =>
      request.destroy(new Error('Zotero request timed out')),
    );
    request.end(body);
  }).catch((error) => {
    throw new Error(`Cannot reach Zotero Better BibTeX: ${error.message}`);
  });
  if (
    !response ||
    typeof response !== 'object' ||
    response.jsonrpc !== '2.0' ||
    response.id !== 1
  )
    throw new Error('Invalid response from Zotero Better BibTeX.');
  if (response.error)
    throw new Error(
      `Zotero: ${
        typeof response.error.message === 'string'
          ? response.error.message
          : 'Invalid RPC error'
      }`,
    );
  return response.result;
}

export async function resolveZoteroLink(
  citekey: string,
  pdf = false,
): Promise<string> {
  const result = await rpc('item.search', [citekey, '*']);
  if (!Array.isArray(result))
    throw new Error('Invalid response from Zotero Better BibTeX.');
  const matches = result.filter(
    (item) => item && typeof item === 'object' && item.citekey === citekey,
  );
  if (matches.length !== 1)
    throw new Error(
      `Zotero citation key ${citekey} has ${matches.length} matching items.`,
    );
  const local =
    typeof matches[0].id === 'string' &&
    matches[0].id.match(
      /^https?:\/\/(?:www\.)?zotero\.org\/users\/local\/[A-Z0-9]+\/items\/([A-Z0-9]{8})\/?$/i,
    );
  const id =
    typeof matches[0].id === 'string' &&
    matches[0].id.match(
      /^https?:\/\/(?:www\.)?zotero\.org\/(users|groups)\/(\d+)\/items\/([A-Z0-9]{8})\/?$/i,
    );
  if (!id && !local)
    throw new Error(`Zotero did not return an item URI for ${citekey}.`);
  if (!pdf && local) return `zotero://select/library/items/${local[1]}`;
  if (!pdf)
    return `zotero://select/${
      id[1].toLowerCase() === 'groups' ? `groups/${id[2]}` : 'library'
    }/items/${id[3]}`;
  const attachments = await rpc('item.attachments', [citekey, '*']);
  if (!Array.isArray(attachments))
    throw new Error('Invalid attachment response from Zotero.');
  const attachment = attachments.find(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof item.path === 'string' &&
      /\.pdf$/i.test(item.path) &&
      typeof item.open === 'string' &&
      /^zotero:\/\/open-pdf\/(?:library|groups\/\d+)\/items\/[A-Z0-9]{8}$/i.test(
        item.open,
      ),
  );
  if (!attachment) throw new Error(`No PDF attachment found for ${citekey}.`);
  return attachment.open;
}
