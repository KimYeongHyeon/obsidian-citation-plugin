jest.mock(
  'obsidian',
  () => ({
    Plugin: class {},
    TFile: class {},
    Events: class {},
    Notice: jest.fn(),
    FileSystemAdapter: class {},
    normalizePath: (p: string) => p,
  }),
  { virtual: true },
);
jest.mock('web-worker:./worker', () => jest.fn(), { virtual: true });
jest.mock('../modals', () => ({}));
jest.mock('../settings', () => ({}));

import CitationPlugin from '../main';
import { Notice } from 'obsidian';

describe('asynchronous insertions', () => {
  const cases = [
    [
      'link',
      'getOrCreateLiteratureNoteFile',
      { path: 'notes/key.md' },
      (p: CitationPlugin, e: any) => p.insertLiteratureNoteLink('key', e),
    ],
    [
      'content',
      'getInitialContentForCitekey',
      'line one\nline two',
      (p: CitationPlugin, e: any) => p.insertLiteratureNoteContent('key', e),
    ],
    [
      'citation',
      'getMarkdownCitationForCitekey',
      'citation',
      (p: CitationPlugin, e: any) => p.insertMarkdownCitation('key', false, e),
    ],
    [
      'Zotero',
      'getEntryZoteroLinkForCitekey',
      'zotero://select/library/items/ABCDEFGH',
      (p: CitationPlugin, e: any) => p.insertZoteroLink('key', false, e),
    ],
  ] as const;

  test.each(cases)(
    '%s cancels when selection or document changes during lookup',
    async (_name, method, result, insert) => {
      for (const change of ['selection', 'content']) {
        let value = 'before selected after';
        let selection = [
          { anchor: { line: 0, ch: 7 }, head: { line: 0, ch: 15 } },
        ];
        const editor = {
          getValue: () => value,
          listSelections: () => selection,
          replaceSelection: jest.fn(),
        };
        const plugin = Object.create(
          CitationPlugin.prototype,
        ) as CitationPlugin;
        plugin.app = {
          workspace: { activeEditor: { file: { path: 'source.md' } } },
          vault: { getConfig: () => true },
          fileManager: { generateMarkdownLink: () => 'link' },
        } as any;
        let finish: (value: any) => void;
        (plugin as any)[method] = () =>
          new Promise((resolve) => {
            finish = resolve;
          });
        const pending = insert(plugin, editor);
        if (change === 'content') value += '!';
        else
          selection = [
            { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } },
          ];
        finish(result);
        await pending;
        expect(editor.replaceSelection).not.toHaveBeenCalled();
        expect(Notice).toHaveBeenCalledWith(expect.stringContaining('changed'));
      }
    },
  );

  test.each(cases)(
    '%s inserts when the document and multiline selection stay unchanged',
    async (_name, method, result, insert) => {
      const editor = {
        getValue: () => 'one\ntwo',
        listSelections: () => [
          { anchor: { line: 0, ch: 1 }, head: { line: 1, ch: 2 } },
        ],
        replaceSelection: jest.fn(),
      };
      const plugin = Object.create(CitationPlugin.prototype) as CitationPlugin;
      plugin.app = {
        workspace: { activeEditor: { file: { path: 'source.md' } } },
        vault: { getConfig: () => true },
        fileManager: { generateMarkdownLink: () => 'link' },
      } as any;
      (plugin as any)[method] = async () => result;
      await insert(plugin, editor);
      expect(editor.replaceSelection).toHaveBeenCalledWith(
        method === 'getOrCreateLiteratureNoteFile' ? 'link' : result,
      );
    },
  );
});

test('cancels when the captured editor is reused for another file with identical state', async () => {
  const editor = {
    getValue: () => 'same',
    listSelections: () => [
      { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } },
    ],
    replaceSelection: jest.fn(),
  };
  const plugin = Object.create(CitationPlugin.prototype) as CitationPlugin;
  const activeEditor = { editor, file: { path: 'before.md' } };
  plugin.app = { workspace: { activeEditor } } as any;
  let finish: (value: string) => void;
  plugin.getMarkdownCitationForCitekey = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = plugin.insertMarkdownCitation('key', false, editor);
  activeEditor.file = { path: 'other.md' };
  finish('citation');
  await pending;
  expect(editor.replaceSelection).not.toHaveBeenCalled();
  expect(Notice).toHaveBeenCalledWith(expect.stringContaining('changed'));
});

test('still inserts into the captured editor when a different editor becomes active', async () => {
  const editor = {
    getValue: () => 'same',
    listSelections: () => [
      { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } },
    ],
    replaceSelection: jest.fn(),
  };
  const plugin = Object.create(CitationPlugin.prototype) as CitationPlugin;
  const workspace = { activeEditor: { editor, file: { path: 'before.md' } } };
  plugin.app = { workspace } as any;
  let finish: (value: string) => void;
  plugin.getMarkdownCitationForCitekey = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = plugin.insertMarkdownCitation('key', false, editor);
  workspace.activeEditor = {
    editor: { ...editor, replaceSelection: jest.fn() },
    file: { path: 'other.md' },
  };
  finish('citation');
  await pending;
  expect(editor.replaceSelection).toHaveBeenCalledWith('citation');
});
