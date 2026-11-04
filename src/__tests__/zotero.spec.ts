import { EventEmitter } from 'events';
import * as http from 'http';
import { resolveZoteroLink } from '../zotero';

jest.mock('http');
const request = jest.fn();
beforeEach(() => {
  request.mockReset();
  (http.request as jest.Mock).mockImplementation((_options, callback) => {
    const outgoing = new EventEmitter() as any;
    outgoing.setTimeout = jest.fn();
    outgoing.end = () => {
      request().then(
        (value: any) => {
          const incoming = new EventEmitter() as any;
          incoming.statusCode = value.status || 200;
          incoming.setEncoding = jest.fn();
          callback(incoming);
          incoming.emit('data', value.raw || JSON.stringify(value.json));
          incoming.emit('end');
        },
        (error: Error) => outgoing.emit('error', error),
      );
    };
    return outgoing;
  });
});
const response = (result: unknown) => ({
  json: { jsonrpc: '2.0', id: 1, result },
});

test('resolves an exact citekey to its native group item and PDF', async () => {
  const item = {
    citekey: 'ABCDEFGH',
    id: 'http://zotero.org/groups/123/items/ZXCVBN12',
  };
  request.mockResolvedValueOnce(response([item]));
  expect(await resolveZoteroLink('ABCDEFGH')).toBe(
    'zotero://select/groups/123/items/ZXCVBN12',
  );
  request.mockResolvedValueOnce(response([item])).mockResolvedValueOnce(
    response([
      {
        path: '/tmp/paper.pdf',
        open: 'zotero://open-pdf/groups/123/items/QWERTY12',
      },
    ]),
  );
  expect(await resolveZoteroLink('ABCDEFGH', true)).toBe(
    'zotero://open-pdf/groups/123/items/QWERTY12',
  );
});

test('rejects missing, ambiguous, or unidentified items instead of guessing', async () => {
  request.mockResolvedValueOnce(
    response([
      { citekey: 'other', id: 'http://zotero.org/users/1/items/ABCDEFGH' },
    ]),
  );
  await expect(resolveZoteroLink('ABCDEFGH')).rejects.toThrow(
    '0 matching items',
  );
  request.mockResolvedValueOnce(
    response([{ citekey: 'key' }, { citekey: 'key' }]),
  );
  await expect(resolveZoteroLink('key')).rejects.toThrow('2 matching items');
  request.mockResolvedValueOnce(response([{ citekey: 'key', id: 'key' }]));
  await expect(resolveZoteroLink('key')).rejects.toThrow('item URI');
});

test('reports unavailable Zotero and missing PDF', async () => {
  request.mockRejectedValueOnce(new Error('offline'));
  await expect(resolveZoteroLink('key')).rejects.toThrow('Cannot reach Zotero');
  request
    .mockResolvedValueOnce(
      response([
        { citekey: 'key', id: 'http://zotero.org/users/1/items/ZXCVBN12' },
      ]),
    )
    .mockResolvedValueOnce(response([]));
  await expect(resolveZoteroLink('key', true)).rejects.toThrow(
    'No PDF attachment',
  );
});

test('rejects HTTP and invalid JSON or RPC responses', async () => {
  request.mockResolvedValueOnce({ status: 400, raw: 'bad' });
  await expect(resolveZoteroLink('key')).rejects.toThrow('HTTP 400');
  request.mockResolvedValueOnce({ raw: 'not json' });
  await expect(resolveZoteroLink('key')).rejects.toThrow('Invalid JSON');
  request.mockResolvedValueOnce({ json: { result: [] } });
  await expect(resolveZoteroLink('key')).rejects.toThrow('Invalid response');
});

test('resolves an unsynced local user item URI', async () => {
  request.mockResolvedValueOnce(
    response([
      {
        citekey: 'key',
        id: 'http://zotero.org/users/local/ABCD1234/items/ZXCVBN12',
      },
    ]),
  );
  expect(await resolveZoteroLink('key')).toBe(
    'zotero://select/library/items/ZXCVBN12',
  );
});
