import { compile } from 'handlebars';
import {
  EntryBibLaTeXAdapter,
  EntryDataBibLaTeX,
  Library,
  loadEntries,
} from '../types';

test('issue 265 retains the reported German title in a literature note template', () => {
  const title =
    'Politik für eine nachhaltigere Ernährung: Eine integrierte Ernährungspolitik entwickeln und faire Ernährungsumgebungen gestalten';
  const entry = new EntryBibLaTeXAdapter(
    loadEntries(
      `@article{key, title={${title}}}`,
      'biblatex',
    )[0] as EntryDataBibLaTeX,
  );
  const vars = new Library({ key: entry }).getTemplateVariablesForCitekey(
    'key',
  );
  expect(compile('title: "{{title}}"')(vars)).toBe(`title: "${title}"`);
});

test('issue 171 preserves all links and surrounding text in the original multiline note', () => {
  const source =
    "@article{huang_IndepthStudyLTE_2013,\r\n  title = {An In-Depth Study of {{LTE}}: Effect of Network Protocol and Application Behavior on Performance},\r\n  shorttitle = {An In-Depth Study of {{LTE}}},\r\n  author = {Huang, Junxian and Qian, Feng and Guo, Yihua and Zhou, Yuanyuan and Xu, Qiang and Mao, Z. Morley and Sen, Subhabrata and Spatscheck, Oliver},\r\n  year = {2013},\r\n  month = sep,\r\n  journal = {ACM SIGCOMM Computer Communication Review},\r\n  volume = {43},\r\n  number = {4},\r\n  pages = {363--374},\r\n  note = {\\section{Annotations\\\\\r\n(5/10/2022, 6:59:51 PM)}\r\n\r\n\\par\r\n``However, the interactions among applications, network transport protocol, and the radio layer still remain unexplored.'' |Open PDF, \\href{zotero://open-pdf/library/items/8SU8CCQA?page=0&annotation=EZFZEMQV}{Open PDF}| (Huang et al., 2013, p. 363 |Open item, \\href{zotero://select/library/items/L2KWDK96}{Open item}|)\r\n\\par\r\n``We observed that LTE has significantly shorter state promotion delays and lower RTTs than those of 3G networks.'' |Open PDF, \\href{zotero://open-pdf/library/items/8SU8CCQA?page=0&annotation=WD3P2JKD}{Open PDF}| (Huang et al., 2013, p. 363 |Open item, \\href{zotero://select/library/items/L2KWDK96}{Open item}|)\r\n\\par\r\n(Huang et al., 2013, p. 363 |Open item, \\href{zotero://select/library/items/L2KWDK96}{Open item}|) test\r\n\\par\r\n(Go to the note, \\href{zotero://select/library/items/XMZP86RD}{Go to note})\\\\\r\n..................................\r\n\\par\r\n\\section{Manually Generated Notes}\r\n\r\n\\par\r\nThis is a reference to (Atxutegi et al., 2018 |Open item, \\href{zotero://select/library/items/8FC6JVQ6}{Open item}|)\r\n\\par\r\n(Atxutegi et al., 2018 |Open item, \\href{zotero://select/library/items/8FC6JVQ6}{Open item}|; Croitoru et al., 2015 |Open item, \\href{zotero://select/library/items/IR9GYRYW}{Open item}|; Dong et al., 2018 |Open item, \\href{zotero://select/library/items/BGMMKVIF}{Open item}|)\r\n\\par\r\n\\href{https://bing.com}{aaa}\r\n\\par\r\n(Go to the note, \\href{zotero://select/library/items/Y4J279RR}{Go to note})\\\\\r\n..................................}\r\n}";
  const entry = new EntryBibLaTeXAdapter(
    loadEntries(source, 'biblatex')[0] as EntryDataBibLaTeX,
  );
  const note = entry.note;
  const links = [
    '[Open PDF](zotero://open-pdf/library/items/8SU8CCQA?page=0&annotation=EZFZEMQV)',
    '[Open item](zotero://select/library/items/L2KWDK96)',
    '[Open PDF](zotero://open-pdf/library/items/8SU8CCQA?page=0&annotation=WD3P2JKD)',
    '[Open item](zotero://select/library/items/L2KWDK96)',
    '[Open item](zotero://select/library/items/L2KWDK96)',
    '[Go to note](zotero://select/library/items/XMZP86RD)',
    '[Open item](zotero://select/library/items/8FC6JVQ6)',
    '[Open item](zotero://select/library/items/8FC6JVQ6)',
    '[Open item](zotero://select/library/items/IR9GYRYW)',
    '[Open item](zotero://select/library/items/BGMMKVIF)',
    '[aaa](https://bing.com)',
    '[Go to note](zotero://select/library/items/Y4J279RR)',
  ];
  let position = 0;
  for (const link of links) {
    const index = note.indexOf(link, position);
    expect(index).toBeGreaterThanOrEqual(position);
    position = index + link.length;
  }
  expect(note).toContain('the radio layer still remain unexplored');
  expect(note).toContain(
    'We observed that LTE has significantly shorter state promotion delays',
  );
  expect(note).toContain('Manually Generated Notes');
  expect(note).toContain('Croitoru et al., 2015');
});
