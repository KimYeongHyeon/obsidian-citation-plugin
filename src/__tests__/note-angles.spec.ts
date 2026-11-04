import { EntryBibLaTeXAdapter, EntryDataBibLaTeX, loadEntries } from '../types';

test('preserves literal angle brackets and Spanish punctuation alongside TeX markup', () => {
  const source = String.raw`@book{key,note={A > B and C < D ¿Qué? ¡Sí! \textbf{bold} \href{https://example.com}{link}}}`;
  const entry = new EntryBibLaTeXAdapter(
    loadEntries(source, 'biblatex')[0] as EntryDataBibLaTeX,
  );
  expect(entry.note).toBe(
    'A > B and C < D ¿Qué? ¡Sí! <b>bold</b> [link](https://example.com)',
  );
});

test('does not confuse existing private-use text with protected brackets', () => {
  const entry = new EntryBibLaTeXAdapter(
    loadEntries(
      '@book{key, note={\uE000L < \uE000G >}}',
      'biblatex',
    )[0] as EntryDataBibLaTeX,
  );
  expect(entry.note).toBe('\uE000L < \uE000G >');
});
