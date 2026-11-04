import {
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
  Library,
  loadEntries,
  EntryDataBibLaTeX,
} from '../types';

function bib(source: string): EntryBibLaTeXAdapter {
  return new EntryBibLaTeXAdapter(
    loadEntries(source, 'biblatex')[0] as EntryDataBibLaTeX,
  );
}

test('preserves the issue 125 link label and adjacent text', () => {
  const entry = bib(
    String.raw`@article{key, title={A NASA Title}, note={See \href{zotero://select/items/abc}{my note link}. And more.}}`,
  );
  expect(entry.note).toBe(
    'See [my note link](zotero://select/items/abc). And more.',
  );
  expect(entry.title).toBe('A NASA Title');
});

test('exports entry type, metadata, and inherited getters', () => {
  const entry = bib(
    String.raw`@article{key, type={report}, journal={Nature, Science}, keywords={one, two}, date={2024-02-29}}`,
  );
  const vars = new Library({ key: entry }).getTemplateVariablesForCitekey(
    'key',
  );
  expect(vars).toMatchObject({
    type: 'article',
    containerTitle: 'Nature, Science',
    keywords: 'one, two',
    issued: '2024-02-29',
  });
  expect(vars.entry).toMatchObject({
    year: 2024,
    zoteroSelectURI: 'zotero://select/items/@key',
  });
});

test('handles CSL names, keywords, editors, and invalid dates', () => {
  const entry = new EntryCSLAdapter({
    id: 'k',
    type: 'book',
    author: [{ literal: 'World Health Organization' }, { family: 'Smith' }],
    editor: [{ given: 'Jane', family: 'Doe' }],
    keyword: 'one, two',
    issued: { 'date-parts': [[2024, 2, 30]] },
  });
  expect(entry.authorString).toBe('World Health Organization, Smith');
  expect(entry.editorString).toBe('Jane Doe');
  expect(entry.keywords).toBe('one, two');
  expect(
    new Library({ k: entry }).getTemplateVariablesForCitekey('k').issued,
  ).toBeUndefined();
  expect(
    bib('@book{k, editor={Doe, Jane}, date={2024-02-30}}').editorString,
  ).toBe('Jane Doe');
  expect(bib('@book{k, date={2024-02-30}}').issuedDate).toBeNull();
});

test('rejects invalid formats, malformed CSL, and missing keys', () => {
  for (const raw of ['', '{}', '[]', '[null]', '[{"id":"x"}]']) {
    expect(() => loadEntries(raw, 'csl-json')).toThrow();
  }
  expect(() => loadEntries('', 'unknown' as any)).toThrow(/Unsupported/);
});

test('extracts only valid storage PDF keys and encodes citekeys', () => {
  const entry = bib(
    String.raw`@book{a/b, file={/Users/me/Zotero/storage/ABCDEFGH/paper.pdf}}`,
  );
  expect(entry.zoteroPdfHash).toBe('ABCDEFGH');
  expect(entry.zoteroPdfURI).toBeNull();
  expect(entry.zoteroSelectURI).toBe('zotero://select/items/@a%2Fb');
  expect(
    bib(String.raw`@book{x, file={/tmp/storage/no/paper.pdf}}`).zoteroPdfHash,
  ).toBeNull();
});

test('keeps both links in the issue 171 annotation and respects Zotero group URIs', () => {
  const entry = bib(
    String.raw`@article{huang_IndepthStudyLTE_2013, note={Open PDF, \href{zotero://open-pdf/library/items/8SU8CCQA?page=0&annotation=EZFZEMQV}{Open PDF} and \href{zotero://select/library/items/L2KWDK96}{Open item}}}`,
  );
  expect(entry.note).toBe(
    'Open PDF, [Open PDF](zotero://open-pdf/library/items/8SU8CCQA?page=0&annotation=EZFZEMQV) and [Open item](zotero://select/library/items/L2KWDK96)',
  );
  const group = new EntryCSLAdapter({
    id: 'arbitrary-key',
    type: 'book',
    uri: 'http://zotero.org/groups/123/items/ABCDEFGH',
  });
  expect(group.zoteroSelectURI).toBe(
    'zotero://select/groups/123/items/ABCDEFGH',
  );
  expect(
    new EntryCSLAdapter({ id: '2CURNAU9', type: 'book' }).zoteroSelectURI,
  ).toBe('zotero://select/items/@2CURNAU9');
});

test('normalizes Mendeley and JabRef file paths without damaging absolute paths', () => {
  const entry = bib(
    String.raw`@article{test, file={:C\:\Project/Literature/MyPDF.pdf:PDF;C:\Project\Literature\MyPDF.pdf:PDF;Paper:C\:\Other\two.pdf:application/pdf;\\server\share\file.pdf;label:/home/user/file.pdf:PDF}}`,
  );
  expect(entry.files).toEqual([
    String.raw`C:\Project/Literature/MyPDF.pdf`,
    String.raw`C:\Project\Literature\MyPDF.pdf`,
    String.raw`C:\Other\two.pdf`,
    String.raw`\\server\share\file.pdf`,
    '/home/user/file.pdf',
  ]);
});

test('preserves JabRef multiline comments without changing the default verbatim fields', () => {
  const entry = bib(
    '@book{x, comment={- First point\n- Second point\n\nThird paragraph}, url={https://example.com/a_b}}',
  );
  expect(entry.toJSON().data).toMatchObject({
    fields: {
      comment: ['- First point\n- Second point\n\nThird paragraph'],
      url: ['https://example.com/a_b'],
    },
  });
});

test('does not guess a native item key from an eight-character citekey', () => {
  const plain = bib(
    '@book{ABCDEFGH, file={/Users/me/Zotero/storage/QWERTY12/paper.pdf}}',
  );
  expect(plain.zoteroSelectURI).toBe('zotero://select/items/@ABCDEFGH');
  expect(plain.zoteroPdfURI).toBeNull();
  const explicit = bib(
    '@book{ABCDEFGH, zotero={zotero://select/groups/123/items/ZXCVBN12}, file={/Users/me/Zotero/storage/QWERTY12/paper.pdf}}',
  );
  expect(explicit.zoteroSelectURI).toBe(
    'zotero://select/groups/123/items/ZXCVBN12',
  );
  expect(explicit.zoteroPdfURI).toBe(
    'zotero://open-pdf/groups/123/items/QWERTY12',
  );
  const csl = new EntryCSLAdapter({
    id: 'ABCDEFGH',
    type: 'book',
    uri: 'zotero://select/library/items/ZXCVBN12',
  });
  expect(csl.zoteroSelectURI).toBe('zotero://select/library/items/ZXCVBN12');
});

test('rejects malformed CSL names and date-parts before creating entries', () => {
  const invalidFields: unknown[] = [
    { author: 'Smith' },
    { author: [null] },
    { editor: [{ given: 7 }] },
    { issued: { 'date-parts': '2024' } },
    { issued: { 'date-parts': [null] } },
    { issued: { 'date-parts': [[2024, 'February']] } },
  ];
  for (const fields of invalidFields) {
    expect(() =>
      loadEntries(
        JSON.stringify([Object.assign({ id: 'x', type: 'book' }, fields)]),
        'csl-json',
      ),
    ).toThrow(/invalid/);
  }
  expect(() =>
    loadEntries(
      JSON.stringify([
        { id: 'x', type: 'book', issued: { literal: 'Spring 2024' } },
      ]),
      'csl-json',
    ),
  ).not.toThrow();
});

test('preserves duplicate records with a warning and library lookup retains the last entry', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const same = loadEntries(
      '[{"id":"x","type":"book","title":"One"},{"title":"One","type":"book","id":"x"}]',
      'csl-json',
    );
    expect(same).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('identical duplicate'),
    );
    const different = loadEntries(
      '@book{x,title={One},doi={10.1/old}}\n@book{x,title={Two},doi={10.1/new}}',
      'biblatex',
    ) as EntryDataBibLaTeX[];
    expect(different).toHaveLength(2);
    const library = new Library(
      Object.fromEntries(
        different.map((e) => [e.key, new EntryBibLaTeXAdapter(e)]),
      ),
    );
    expect(library.size).toBe(1);
    expect(library.entries.x.title).toBe('Two');
    expect(library.entries.x.DOI).toBe('10.1/new');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('conflicting duplicate'),
    );
  } finally {
    warn.mockRestore();
  }
});
