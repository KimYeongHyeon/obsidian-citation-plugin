jest.mock(
  'obsidian',
  () => {
    class Plugin {}
    class TFile {
      constructor(public path: string, public name: string) {}
    }
    class Events {
      on = jest.fn();
      offref = jest.fn();
      trigger = jest.fn();
    }
    return {
      Plugin,
      TFile,
      Events,
      Notice: jest.fn(),
      FileSystemAdapter: class {
        static readLocalFile = jest.fn();
      },
      normalizePath: (p: string) => p,
    };
  },
  { virtual: true },
);
jest.mock('web-worker:./worker', () => jest.fn(), { virtual: true });
jest.mock('../modals', () => ({}));
jest.mock('../settings', () => ({}));

import CitationPlugin from '../main';
import { TFile, Notice, FileSystemAdapter } from 'obsidian';
import { Library } from '../types';
import { TextDecoder } from 'util';
(global as any).TextDecoder = TextDecoder;

describe('citation runtime', () => {
  let plugin: CitationPlugin;
  let files: TFile[];
  let create: jest.Mock;
  let createFolder: jest.Mock;

  beforeEach(() => {
    files = [];
    create = jest.fn(
      async (path) => new (TFile as any)(path, path.split('/').pop()),
    );
    createFolder = jest.fn().mockResolvedValue(undefined);
    plugin = Object.create(CitationPlugin.prototype);
    plugin.settings = {
      literatureNoteFolder: 'notes/nested',
      literatureNoteTitleTemplate: '{{citekey}}',
      literatureNoteContentTemplate: 'content',
      markdownCitationTemplate: '{{citekey}}',
      alternativeMarkdownCitationTemplate: 'alt {{citekey}}',
    } as any;
    plugin.library = new Library({ key: { toJSON: () => ({}) } as any });
    plugin.literatureNoteErrorNotifier = { show: jest.fn() } as any;
    plugin.app = {
      vault: {
        getAbstractFileByPath: jest.fn((path) =>
          files.find((f) => f.path === path),
        ),
        getMarkdownFiles: () => files,
        create,
        createFolder,
        getConfig: () => true,
      },
      workspace: {
        activeEditor: {
          editor: { replaceSelection: jest.fn() },
          file: { path: 'source.md' },
        },
      },
      fileManager: {
        generateMarkdownLink: jest.fn(() => '[key](moved/key.md)'),
      },
    } as any;
  });

  test('creates nested folders and reuses an existing moved note', async () => {
    const moved = new (TFile as any)('moved/key.md', 'key.md');
    files.push(moved);
    expect(await plugin.getOrCreateLiteratureNoteFile('key')).toBe(moved);
    expect(create).not.toHaveBeenCalled();
    files.length = 0;
    await plugin.getOrCreateLiteratureNoteFile('key');
    expect(createFolder.mock.calls.map((call) => call[0])).toEqual([
      'notes',
      'notes/nested',
    ]);
    expect(create).toHaveBeenCalledWith('notes/nested/key.md', 'content');
  });

  test('rejects ambiguous filenames and paths outside the vault', async () => {
    files.push(
      new (TFile as any)('a/key.md', 'key.md'),
      new (TFile as any)('b/key.md', 'key.md'),
    );
    await expect(plugin.getOrCreateLiteratureNoteFile('key')).rejects.toThrow(
      'Multiple',
    );
    plugin.settings.literatureNoteFolder = '../outside';
    await expect(plugin.getOrCreateLiteratureNoteFile('key')).rejects.toThrow(
      'inside the vault',
    );
    expect(create).not.toHaveBeenCalled();
  });

  test('inserts into the captured editor using Obsidian-generated moved-file link', async () => {
    files.push(new (TFile as any)('moved/key.md', 'key.md'));
    const editor = { replaceSelection: jest.fn() };
    await plugin.insertLiteratureNoteLink('key', editor);
    expect(plugin.app.fileManager.generateMarkdownLink).toHaveBeenCalledWith(
      files[0],
      'source.md',
      '',
      'key',
    );
    expect(editor.replaceSelection).toHaveBeenCalledWith('[key](moved/key.md)');
    await plugin.insertMarkdownCitation('key', false, editor);
    expect(editor.replaceSelection).toHaveBeenLastCalledWith('key');
    await plugin.insertMarkdownCitation('key', false, null);
    expect(Notice).toHaveBeenCalled();
  });

  test('read failures and missing paths complete loading without losing the library', async () => {
    const original = plugin.library;
    (plugin as any).loadQueue = Promise.resolve(original);
    (plugin as any).events = { trigger: jest.fn() };
    (plugin as any).loadErrorNotifier = { show: jest.fn(), hide: jest.fn() };
    plugin.settings.citationExportPath = 'missing.json';
    (FileSystemAdapter.readLocalFile as jest.Mock).mockRejectedValueOnce(
      new Error('missing'),
    );
    jest.spyOn(plugin, 'resolveLibraryPath').mockReturnValue('missing.json');
    jest.spyOn(console, 'error').mockImplementationOnce(() => undefined);
    (plugin as any).watchedPath = 'missing.json';
    await plugin.loadLibrary();
    await Promise.resolve();
    expect(plugin.library).toBe(original);
    expect(plugin.isLibraryLoading).toBe(false);
    expect((plugin as any).events.trigger).toHaveBeenCalledWith(
      'library-load-complete',
    );
    plugin.settings.citationExportPath = '';
    await plugin.loadLibrary();
    expect(plugin.library.size).toBe(0);
  });

  test('queues reloads received while a worker request is active', async () => {
    (plugin as any).loadQueue = Promise.resolve(plugin.library);
    (plugin as any).events = { trigger: jest.fn() };
    (plugin as any).loadErrorNotifier = { show: jest.fn(), hide: jest.fn() };
    plugin.settings.citationExportPath = 'db.json';
    plugin.settings.citationExportFormat = 'csl-json';
    (plugin as any).watchedPath = 'db.json';
    jest.spyOn(plugin, 'resolveLibraryPath').mockReturnValue('db.json');
    (FileSystemAdapter.readLocalFile as jest.Mock).mockResolvedValue(
      new Uint8Array([91, 93]).buffer,
    );
    let finish: (result: any[]) => void;
    const post = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce([{ id: 'second', type: 'book', title: 'Second' }]);
    (plugin as any).loadWorker = { post };
    const first = plugin.loadLibrary();
    const second = plugin.loadLibrary();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(post).toHaveBeenCalledTimes(1);
    finish([{ id: 'first', type: 'book', title: 'First' }]);
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.entries.first.title).toBe('First');
    expect(secondResult.entries.second.title).toBe('Second');
    expect(plugin.library).toBe(secondResult);
    expect(plugin.library.entries.first).toBeUndefined();
    expect(post).toHaveBeenCalledTimes(2);
    expect(plugin.isLibraryLoading).toBe(false);
  });

  test('clipboard accepts one configured-format entry without replacing the main library', async () => {
    const original = plugin.library;
    plugin.settings.citationExportFormat = 'csl-json';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: jest
          .fn()
          .mockResolvedValue('[{"id":"clip","title":"Title","type":"book"}]'),
      },
    });
    const openFile = jest.fn();
    (plugin.app.workspace as any).getLeaf = () => ({ openFile });
    await plugin.openFromClipboard();
    expect(create).toHaveBeenCalledWith('notes/nested/clip.md', 'content');
    expect(plugin.library).toBe(original);
    expect(openFile).toHaveBeenCalledTimes(1);
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      '@book{bibkey, title={BibTeX title}}',
    );
    await plugin.openFromClipboard();
    expect(create).toHaveBeenCalledWith('notes/nested/bibkey.md', 'content');
    expect(plugin.library).toBe(original);
    expect(openFile).toHaveBeenCalledTimes(2);
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      '[{"id":"a","type":"book"},{"id":"b","type":"book"}]',
    );
    jest.spyOn(console, 'error').mockImplementationOnce(() => undefined);
    await plugin.openFromClipboard();
    expect(openFile).toHaveBeenCalledTimes(2);
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining('exactly one'));
  });

  test('worker parse failure retains the prior library and ends loading', async () => {
    const original = plugin.library;
    (plugin as any).loadQueue = Promise.resolve(original);
    (plugin as any).events = { trigger: jest.fn() };
    (plugin as any).loadErrorNotifier = { show: jest.fn(), hide: jest.fn() };
    plugin.settings.citationExportPath = 'db.json';
    (plugin as any).watchedPath = 'db.json';
    jest.spyOn(plugin, 'resolveLibraryPath').mockReturnValue('db.json');
    (FileSystemAdapter.readLocalFile as jest.Mock).mockResolvedValue(
      new Uint8Array([91, 93]).buffer,
    );
    (plugin as any).loadWorker = {
      post: jest.fn().mockRejectedValue(new Error('invalid citation data')),
    };
    jest.spyOn(console, 'error').mockImplementationOnce(() => undefined);
    expect(await plugin.loadLibrary()).toBeNull();
    expect(plugin.library).toBe(original);
    expect(plugin.isLibraryLoading).toBe(false);
    expect((plugin as any).events.trigger).toHaveBeenCalledWith(
      'library-load-complete',
    );
    expect((plugin as any).loadErrorNotifier.show).toHaveBeenCalled();
  });

  test('link source path stays with the editor when active note changes during creation', async () => {
    let finish: (file: TFile) => void;
    jest.spyOn(plugin, 'getOrCreateLiteratureNoteFile').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const editor = { replaceSelection: jest.fn() };
    const insertion = plugin.insertLiteratureNoteLink('key', editor);
    (plugin.app.workspace as any).activeEditor.file.path = 'other.md';
    const file = new (TFile as any)('moved/key.md', 'key.md');
    finish(file);
    await insertion;
    expect(plugin.app.fileManager.generateMarkdownLink).toHaveBeenCalledWith(
      file,
      'source.md',
      '',
      'key',
    );
  });

  test('editor lookup safely falls back to a compatible active view', () => {
    const workspace = plugin.app.workspace as any;
    const fallback = { replaceSelection: jest.fn() };
    workspace.activeEditor = null;
    workspace.activeLeaf = { view: { editor: fallback } };
    expect(plugin.editor).toBe(fallback);
    const active = { replaceSelection: jest.fn() };
    workspace.activeEditor = { editor: active };
    expect(plugin.editor).toBe(active);
    workspace.activeEditor = { editor: {} };
    workspace.activeLeaf.view.editor = {};
    expect(plugin.editor).toBeNull();
    workspace.activeLeaf = null;
    expect(plugin.editor).toBeNull();
  });

  test('clipboard rejects two CSL records with the same citation key', async () => {
    const original = plugin.library;
    plugin.settings.citationExportFormat = 'csl-json';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: jest
          .fn()
          .mockResolvedValue(
            '[{"id":"same","type":"book","title":"First"},{"id":"same","type":"book","title":"Second"}]',
          ),
      },
    });
    const openFile = jest.fn();
    (plugin.app.workspace as any).getLeaf = () => ({ openFile });
    jest.spyOn(console, 'error').mockImplementationOnce(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await plugin.openFromClipboard();
    expect(create).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
    expect(plugin.library).toBe(original);
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining('exactly one'));
    (console.warn as jest.Mock).mockRestore();
  });
});
