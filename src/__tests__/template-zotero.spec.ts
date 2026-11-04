jest.mock('obsidian', () => ({ requestUrl: jest.fn() }), { virtual: true });
import { compile } from 'handlebars';
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
  expect(resolve).toHaveBeenCalledWith('key', false);
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
  expect(resolve).toHaveBeenCalledWith('key', true);
});
