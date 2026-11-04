import { loadEntries } from '../types';

test('accepts an empty CSL library while rejecting malformed inputs', () => {
  expect(loadEntries('[]', 'csl-json')).toEqual([]);
  expect(() => loadEntries('', 'csl-json')).toThrow();
  expect(() => loadEntries('{}', 'csl-json')).toThrow();
  expect(() => loadEntries('[]', undefined as any)).toThrow(/Unsupported/);
});
