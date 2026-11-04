jest.mock('obsidian', () => ({ requestUrl: jest.fn() }), { virtual: true });
import { compile, registerHelper, unregisterHelper } from 'handlebars';
import { renderZoteroTemplate } from '../template-zotero';

const vars = (): Record<string, any> => ({
  citekey: 'key',
  zoteroSelectURI: null,
  zoteroPdfURI: null,
  entry: {},
});

test('only resolves requested Zotero variables and supports entry paths', async () => {
  const resolve = jest
    .fn()
    .mockResolvedValue('zotero://select/library/items/ABCDEFGH');
  expect(
    await renderZoteroTemplate(
      '[@{{citekey}}]',
      compile('[@{{citekey}}]'),
      vars(),
      resolve,
    ),
  ).toBe('[@key]');
  expect(resolve).not.toHaveBeenCalled();
  const source = '{{zoteroSelectURI}} {{entry.zoteroSelectURI}}';
  expect(
    await renderZoteroTemplate(
      source,
      compile(source, { noEscape: true }),
      vars(),
      resolve,
    ),
  ).toBe(
    'zotero://select/library/items/ABCDEFGH zotero://select/library/items/ABCDEFGH',
  );
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(resolve).toHaveBeenCalledWith('key', false, undefined);
});

test('uses explicit URIs and propagates missing PDF errors', async () => {
  const resolve = jest.fn().mockRejectedValue(new Error('No PDF attachment'));
  const variables = vars();
  variables.zoteroSelectURI = 'zotero://select/library/items/ABCDEFGH';
  expect(
    await renderZoteroTemplate(
      '{{zoteroSelectURI}}',
      compile('{{zoteroSelectURI}}'),
      variables,
      resolve,
    ),
  ).toBe(variables.zoteroSelectURI);
  expect(resolve).not.toHaveBeenCalled();
  await expect(
    renderZoteroTemplate(
      '{{entry.zoteroPdfURI}}',
      compile('{{entry.zoteroPdfURI}}'),
      vars(),
      resolve,
    ),
  ).rejects.toThrow('No PDF attachment');
  expect(resolve).toHaveBeenCalledWith('key', true, undefined);
});

test('keeps missing PDF guards and inactive branches offline', async () => {
  const resolve = jest.fn().mockRejectedValue(new Error('Cannot reach Zotero'));
  for (const source of [
    '{{#if zoteroPdfURI}}PDF{{else}}No PDF{{/if}}',
    '{{#if zoteroPdfURI}}{{zoteroPdfURI}}{{else}}No PDF{{/if}}',
    '{{#if missing}}{{zoteroPdfURI}}{{else}}No PDF{{/if}}',
  ]) {
    expect(
      await renderZoteroTemplate(source, compile(source), vars(), resolve),
    ).toBe('No PDF');
  }
  expect(resolve).not.toHaveBeenCalled();
});

test('resolves lookup expressions and passes the source item URI', async () => {
  const variables = vars();
  variables.entry.zoteroSourceURI =
    'https://www.zotero.org/users/42/items/ABCDEFGH';
  const resolve = jest
    .fn()
    .mockResolvedValue('zotero://open-pdf/library/items/12345678');
  const source = '{{lookup entry "zoteroPdfURI"}}';
  expect(
    await renderZoteroTemplate(source, compile(source), variables, resolve),
  ).toBe('zotero://open-pdf/library/items/12345678');
  expect(resolve).toHaveBeenCalledWith(
    'key',
    true,
    variables.entry.zoteroSourceURI,
  );
});

test('preserves lookup errors for an output value', async () => {
  const source = '{{lookup entry "zoteroPdfURI"}}';
  const resolve = jest.fn().mockRejectedValue(new Error('No PDF attachment'));
  await expect(
    renderZoteroTemplate(source, compile(source), vars(), resolve),
  ).rejects.toThrow('No PDF attachment');
});

test('uses a native PDF URI without contacting Zotero', async () => {
  const variables = vars();
  variables.zoteroPdfURI = 'zotero://open-pdf/library/items/ABCDEFGH';
  variables.entry.zoteroPdfURI = variables.zoteroPdfURI;
  const resolve = jest.fn().mockRejectedValue(new Error('Cannot reach Zotero'));
  const source =
    '{{#if zoteroPdfURI}}{{entry.zoteroPdfURI}}{{else}}No PDF{{/if}}';
  expect(
    await renderZoteroTemplate(source, compile(source), variables, resolve),
  ).toBe(variables.zoteroPdfURI);
  expect(resolve).not.toHaveBeenCalled();
});

test('does not resolve lookup used as a guard', async () => {
  const source =
    '{{#if (lookup entry "zoteroPdfURI")}}PDF{{else}}No PDF{{/if}}';
  const resolve = jest.fn().mockRejectedValue(new Error('Cannot reach Zotero'));
  expect(
    await renderZoteroTemplate(source, compile(source), vars(), resolve),
  ).toBe('No PDF');
  expect(resolve).not.toHaveBeenCalled();
});

test('reevaluates branches after resolving a link', async () => {
  const resolve = jest
    .fn()
    .mockImplementation((_key, pdf) => Promise.resolve(pdf ? 'PDF' : 'SELECT'));
  let source =
    '{{zoteroSelectURI}} {{#if zoteroSelectURI}}{{zoteroPdfURI}}{{/if}}';
  expect(
    await renderZoteroTemplate(source, compile(source), vars(), resolve),
  ).toBe('SELECT PDF');
  resolve.mockClear();
  source =
    '{{#unless zoteroSelectURI}}{{zoteroPdfURI}}{{/unless}}{{zoteroSelectURI}}';
  expect(
    await renderZoteroTemplate(source, compile(source), vars(), resolve),
  ).toBe('SELECT');
  expect(resolve).toHaveBeenCalledTimes(1);
});

test('renders unrelated helpers once', async () => {
  const helper = jest.fn().mockReturnValue('text');
  registerHelper('countedForTest', helper);
  try {
    const source = '{{countedForTest}}';
    expect(
      await renderZoteroTemplate(source, compile(source), vars(), jest.fn()),
    ).toBe('text');
    expect(helper).toHaveBeenCalledTimes(1);
  } finally {
    unregisterHelper('countedForTest');
  }
});

test('does not resolve unrelated fields with Zotero URI names', async () => {
  const variables = vars();
  variables.metadata = {};
  const resolve = jest.fn().mockRejectedValue(new Error('Cannot reach Zotero'));
  const source = '{{metadata.zoteroPdfURI}}';
  expect(
    await renderZoteroTemplate(source, compile(source), variables, resolve),
  ).toBe('');
  expect(resolve).not.toHaveBeenCalled();
});

test('does not resolve a same-named field in another context or helper argument', async () => {
  const variables = vars();
  variables.metadata = {};
  const resolve = jest.fn().mockRejectedValue(new Error('Cannot reach Zotero'));
  for (const source of [
    '{{#with metadata}}{{zoteroPdfURI}}{{/with}}',
    '{{lookup metadata.zoteroPdfURI "anything"}}',
  ]) {
    expect(
      await renderZoteroTemplate(source, compile(source), variables, resolve),
    ).toBe('');
  }
  expect(resolve).not.toHaveBeenCalled();
});

test('resolves root and parent URI paths only when they target the entry', async () => {
  for (const source of [
    '{{#with metadata}}{{../zoteroPdfURI}}{{/with}}',
    '{{#with metadata}}{{../entry.zoteroPdfURI}}{{/with}}',
    '{{#with metadata}}{{@root.zoteroPdfURI}}{{/with}}',
    '{{#with metadata}}{{@root.entry.zoteroPdfURI}}{{/with}}',
  ]) {
    const variables = vars();
    variables.metadata = { label: 'context' };
    const resolve = jest.fn().mockResolvedValue('PDF');
    expect(
      await renderZoteroTemplate(source, compile(source), variables, resolve),
    ).toBe('PDF');
    expect(resolve).toHaveBeenCalledTimes(1);
  }
});

test('resolves unconditional PDF before a conditionally needed selection URI', async () => {
  const source =
    '{{#unless zoteroPdfURI}}{{zoteroSelectURI}}{{/unless}}{{zoteroPdfURI}}';
  const resolve = jest
    .fn()
    .mockImplementation((_key, pdf) =>
      pdf
        ? Promise.resolve('PDF')
        : Promise.reject(new Error('unnecessary lookup')),
    );
  expect(
    await renderZoteroTemplate(source, compile(source), vars(), resolve),
  ).toBe('PDF');
  expect(resolve).toHaveBeenCalledTimes(1);
});
