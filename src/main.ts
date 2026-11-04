import {
  FileSystemAdapter,
  normalizePath,
  Plugin,
  Notice,
  TFile,
} from 'obsidian';
import * as path from 'path';
import * as chokidar from 'chokidar';

import {
  compile as compileTemplate,
  TemplateDelegate as Template,
} from 'handlebars';

import CitationEvents from './events';
import { resolveZoteroLink } from './zotero';
import { renderZoteroTemplate } from './template-zotero';
import {
  InsertCitationModal,
  InsertNoteLinkModal,
  InsertNoteContentModal,
  OpenNoteModal,
  InsertZoteroLinkModal,
} from './modals';
import { CitationSettingTab, CitationsPluginSettings } from './settings';
import {
  Entry,
  EntryData,
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
  IIndexable,
  Library,
  loadEntries,
} from './types';
import {
  DISALLOWED_FILENAME_CHARACTERS_RE,
  Notifier,
  WorkerManager,
} from './util';
import LoadWorker from 'web-worker:./worker';

export interface CitationEditor {
  replaceSelection(text: string): void;
  getValue(): string;
  listSelections(): {
    anchor: { line: number; ch: number };
    head: { line: number; ch: number };
  }[];
}

function isCitationEditor(editor: CitationEditor): boolean {
  return (
    typeof editor?.replaceSelection === 'function' &&
    typeof editor?.getValue === 'function' &&
    typeof editor?.listSelections === 'function'
  );
}

function captureEditor(editor: CitationEditor, workspace: any): () => boolean {
  const owner =
    workspace.activeEditor?.editor === editor
      ? workspace.activeEditor
      : workspace.activeLeaf?.view?.editor === editor
      ? workspace.activeLeaf.view
      : null;
  const path = owner?.file?.path;
  const value = editor.getValue();
  const selections = JSON.stringify(editor.listSelections());
  return () => {
    if (
      value === editor.getValue() &&
      (!owner ||
        (owner.file?.path === path &&
          (workspace.activeEditor?.editor !== editor ||
            workspace.activeEditor.file?.path === path) &&
          (workspace.activeLeaf?.view?.editor !== editor ||
            workspace.activeLeaf.view.file?.path === path))) &&
      selections === JSON.stringify(editor.listSelections())
    )
      return true;
    new Notice(
      'Editor changed while resolving the citation. Insertion cancelled.',
    );
    return false;
  };
}

export default class CitationPlugin extends Plugin {
  settings: CitationsPluginSettings;
  library = new Library({});
  private watcher: chokidar.FSWatcher;
  private watchedPath: string;
  private loadQueue: Promise<Library> = Promise.resolve(this.library);
  private loading = false;
  private unloaded = false;

  // Template compilation options
  private templateSettings = {
    noEscape: true,
  };

  private loadWorker = new WorkerManager(new LoadWorker(), {
    blockingChannel: true,
  });

  events = new CitationEvents();

  loadErrorNotifier = new Notifier(
    'Unable to load citations. Please update Citations plugin settings.',
  );
  literatureNoteErrorNotifier = new Notifier(
    'Unable to access literature note. Please check that the literature note folder exists, or update the Citations plugin settings.',
  );

  get editor(): CitationEditor {
    const workspace = this.app.workspace as any;
    const active = workspace.activeEditor?.editor;
    if (isCitationEditor(active)) return active;
    const fallback = workspace.activeLeaf?.view?.editor;
    return isCitationEditor(fallback) ? fallback : null;
  }

  async loadSettings(): Promise<void> {
    this.settings = new CitationsPluginSettings();

    const loadedSettings = await this.loadData();
    if (!loadedSettings) return;

    const toLoad = [
      'citationExportPath',
      'citationExportFormat',
      'literatureNoteTitleTemplate',
      'literatureNoteFolder',
      'literatureNoteContentTemplate',
      'markdownCitationTemplate',
      'alternativeMarkdownCitationTemplate',
    ];
    toLoad.forEach((setting) => {
      if (setting in loadedSettings) {
        (this.settings as IIndexable)[setting] = loadedSettings[setting];
      }
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.init();
  }

  onunload(): void {
    this.unloaded = true;
    this.watcher?.close();
    this.loadWorker.terminate();
    this.loadErrorNotifier.unload();
    this.literatureNoteErrorNotifier.unload();
  }

  async init(): Promise<void> {
    await this.loadLibrary();

    this.addCommand({
      id: 'open-literature-note',
      name: 'Open literature note',
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'o' }],
      callback: () => {
        const modal = new OpenNoteModal(this.app, this);
        modal.open();
      },
    });

    this.addCommand({
      id: 'update-bib-data',
      name: 'Refresh citation database',
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'r' }],
      callback: () => {
        this.loadLibrary();
      },
    });

    this.addCommand({
      id: 'insert-citation',
      name: 'Insert literature note link',
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'e' }],
      callback: () => {
        const modal = new InsertNoteLinkModal(this.app, this);
        modal.open();
      },
    });

    this.addCommand({
      id: 'insert-literature-note-content',
      name: 'Insert literature note content in the current pane',
      callback: () => {
        const modal = new InsertNoteContentModal(this.app, this);
        modal.open();
      },
    });

    this.addCommand({
      id: 'insert-markdown-citation',
      name: 'Insert Markdown citation',
      callback: () => {
        const modal = new InsertCitationModal(this.app, this);
        modal.open();
      },
    });

    this.addCommand({
      id: 'insert-zotero-link',
      name: 'Insert Zotero link',
      callback: () => new InsertZoteroLinkModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'note-from-clipboard',
      name: 'Create literature note from clipboard',
      callback: () => {
        this.openFromClipboard();
      },
    });

    this.addSettingTab(new CitationSettingTab(this.app, this));
  }

  /**
   * Resolve a provided library path, allowing for relative paths rooted at
   * the vault directory.
   */
  resolveLibraryPath(rawPath: string): string {
    const vaultRoot =
      this.app.vault.adapter instanceof FileSystemAdapter
        ? this.app.vault.adapter.getBasePath()
        : '/';
    return path.resolve(vaultRoot, rawPath);
  }

  private libraryFromEntries(entries: EntryData[], format: string): Library {
    const adapter: new (data: EntryData) => Entry =
      format === 'biblatex' ? EntryBibLaTeXAdapter : EntryCSLAdapter;
    const idKey = format === 'biblatex' ? 'key' : 'id';
    return new Library(
      Object.fromEntries(
        entries.map((entry) => [
          (entry as IIndexable)[idKey],
          new adapter(entry),
        ]),
      ),
    );
  }

  async openFromClipboard(): Promise<void> {
    try {
      const raw = await navigator.clipboard.readText();
      const format = raw.trimStart().startsWith('@') ? 'biblatex' : 'csl-json';
      const entries = loadEntries(raw, format);
      if (entries.length !== 1)
        throw new Error('Clipboard must contain exactly one reference.');
      const library = this.libraryFromEntries(entries, format);
      const citekey = Object.keys(library.entries)[0];
      if (!citekey || citekey === 'undefined')
        throw new Error('Clipboard reference has no citation key.');
      const file = await this.getOrCreateLiteratureNoteFile(citekey, library);
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (error) {
      console.error(error);
      new Notice(`Unable to create literature note: ${error.message}`);
    }
  }

  loadLibrary(): Promise<Library> {
    const rawPath = this.settings.citationExportPath;
    const format = this.settings.citationExportFormat;
    const resolved = rawPath ? this.resolveLibraryPath(rawPath) : '';
    if (resolved !== this.watchedPath) {
      this.watcher?.close();
      this.watcher = null;
      this.watchedPath = resolved;
      if (resolved) {
        try {
          this.watcher = chokidar
            .watch(resolved, {
              awaitWriteFinish: { stabilityThreshold: 500 },
              ignoreInitial: true,
            })
            .on('change', () => {
              this.loadLibrary();
            })
            .on('add', () => {
              this.loadLibrary();
            })
            .on('unlink', () => {
              this.loadLibrary();
            });
          this.watcher.on('error', (error) => {
            console.error(error);
            this.loadErrorNotifier.show();
          });
        } catch (error) {
          console.error(error);
          this.loadErrorNotifier.show();
        }
      }
    }
    this.loading = true;
    this.events.trigger('library-load-start');
    const run = this.loadQueue.then(async () => {
      if (this.unloaded) return this.library;
      try {
        if (!resolved) {
          this.library = new Library({});
          return this.library;
        }
        const buffer = await FileSystemAdapter.readLocalFile(resolved);
        const value = new TextDecoder('utf8').decode(new DataView(buffer));
        const entries = await this.loadWorker.post<EntryData[]>({
          databaseRaw: value,
          databaseType: format,
        });
        if (this.unloaded) return this.library;
        this.library = this.libraryFromEntries(entries, format);
        this.loadErrorNotifier.hide();
      } catch (error) {
        if (!this.unloaded) {
          console.error(error);
          this.loadErrorNotifier.show();
        }
        return null;
      }
      return this.library;
    });
    this.loadQueue = run;
    run.finally(() => {
      if (!this.unloaded && this.loadQueue === run) {
        this.loading = false;
        this.events.trigger('library-load-complete');
      }
    });
    return run;
  }

  get isLibraryLoading(): boolean {
    return this.loading;
  }

  get literatureNoteTitleTemplate(): Template {
    return compileTemplate(
      this.settings.literatureNoteTitleTemplate,
      this.templateSettings,
    );
  }

  get literatureNoteContentTemplate(): Template {
    return compileTemplate(
      this.settings.literatureNoteContentTemplate,
      this.templateSettings,
    );
  }

  get markdownCitationTemplate(): Template {
    return compileTemplate(
      this.settings.markdownCitationTemplate,
      this.templateSettings,
    );
  }

  get alternativeMarkdownCitationTemplate(): Template {
    return compileTemplate(
      this.settings.alternativeMarkdownCitationTemplate,
      this.templateSettings,
    );
  }

  async getTitleForCitekey(
    citekey: string,
    library = this.library,
  ): Promise<string> {
    const unsafeTitle = await renderZoteroTemplate(
      this.settings.literatureNoteTitleTemplate,
      this.literatureNoteTitleTemplate,
      library.getTemplateVariablesForCitekey(citekey),
    );
    return unsafeTitle.replace(DISALLOWED_FILENAME_CHARACTERS_RE, '_');
  }

  async getPathForCitekey(
    citekey: string,
    library = this.library,
  ): Promise<string> {
    const title = await this.getTitleForCitekey(citekey, library);
    return path.join(this.settings.literatureNoteFolder, `${title}.md`);
  }

  async getInitialContentForCitekey(
    citekey: string,
    library = this.library,
  ): Promise<string> {
    return renderZoteroTemplate(
      this.settings.literatureNoteContentTemplate,
      this.literatureNoteContentTemplate,
      library.getTemplateVariablesForCitekey(citekey),
    );
  }

  async getMarkdownCitationForCitekey(citekey: string): Promise<string> {
    return renderZoteroTemplate(
      this.settings.markdownCitationTemplate,
      this.markdownCitationTemplate,
      this.library.getTemplateVariablesForCitekey(citekey),
    );
  }

  async getAlternativeMarkdownCitationForCitekey(
    citekey: string,
  ): Promise<string> {
    return renderZoteroTemplate(
      this.settings.alternativeMarkdownCitationTemplate,
      this.alternativeMarkdownCitationTemplate,
      this.library.getTemplateVariablesForCitekey(citekey),
    );
  }

  /**
   * Return the configured literature note, creating it if needed.
   */
  async getOrCreateLiteratureNoteFile(
    citekey: string,
    library = this.library,
  ): Promise<TFile> {
    try {
      const folder = this.settings.literatureNoteFolder.replace(/\\/g, '/');
      if (
        folder.startsWith('/') ||
        /^[A-Za-z]:/.test(folder) ||
        folder.split('/').includes('..')
      ) {
        throw new Error(
          'Literature note folder must be a path inside the vault.',
        );
      }
      const title = await this.getTitleForCitekey(citekey, library);
      if (!title || title === '.' || title === '..')
        throw new Error('Literature note title is empty or invalid.');
      const target = normalizePath(path.posix.join(folder, `${title}.md`));
      const exact = this.app.vault.getAbstractFileByPath(target);
      if (exact) {
        if (!(exact instanceof TFile))
          throw new Error('Literature note path is not a file.');
        return exact;
      }
      const matches = this.app.vault
        .getMarkdownFiles()
        .filter((file) => file.path.toLowerCase() === target.toLowerCase());
      if (matches.length > 1)
        throw new Error(`Multiple literature notes match ${target}.`);
      if (matches.length === 1) return matches[0];
      const parts = target.split('/');
      parts.pop();
      let current = '';
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!this.app.vault.getAbstractFileByPath(current))
          await this.app.vault.createFolder(current);
      }
      return await this.app.vault.create(
        target,
        await this.getInitialContentForCitekey(citekey, library),
      );
    } catch (error) {
      this.literatureNoteErrorNotifier.show(error.message);
      throw error;
    }
  }

  async openLiteratureNote(citekey: string, newPane: boolean): Promise<void> {
    const file = await this.getOrCreateLiteratureNoteFile(citekey);
    await this.app.workspace.getLeaf(newPane).openFile(file);
  }

  async insertLiteratureNoteLink(
    citekey: string,
    editor = this.editor,
  ): Promise<void> {
    if (!isCitationEditor(editor)) {
      new Notice(
        'No compatible editor. Open a note or canvas text editor first.',
      );
      return;
    }
    const unchanged = captureEditor(editor, this.app.workspace);
    const sourcePath =
      (this.app.workspace as any).activeEditor?.file?.path || '';
    const file = await this.getOrCreateLiteratureNoteFile(citekey);
    if (!unchanged()) return;
    const useMarkdown = (this.app.vault as any).getConfig('useMarkdownLinks');
    const link = (this.app.fileManager.generateMarkdownLink as any)(
      file,
      sourcePath,
      '',
      useMarkdown ? citekey : undefined,
    );
    editor.replaceSelection(link);
  }

  async insertLiteratureNoteContent(
    citekey: string,
    editor = this.editor,
  ): Promise<void> {
    if (!isCitationEditor(editor)) {
      new Notice(
        'No compatible editor. Open a note or canvas text editor first.',
      );
      return;
    }
    const unchanged = captureEditor(editor, this.app.workspace);
    const content = await this.getInitialContentForCitekey(citekey);
    if (unchanged()) editor.replaceSelection(content);
  }

  async insertMarkdownCitation(
    citekey: string,
    alternative = false,
    editor = this.editor,
  ): Promise<void> {
    if (!isCitationEditor(editor)) {
      new Notice(
        'No compatible editor. Open a note or canvas text editor first.',
      );
      return;
    }
    const unchanged = captureEditor(editor, this.app.workspace);
    const citation = alternative
      ? await this.getAlternativeMarkdownCitationForCitekey(citekey)
      : await this.getMarkdownCitationForCitekey(citekey);
    if (unchanged()) editor.replaceSelection(citation);
  }

  async getEntryZoteroLinkForCitekey(citekey: string): Promise<string> {
    return (
      this.library.entries[citekey].zoteroSelectURI ||
      resolveZoteroLink(
        citekey,
        false,
        this.library.entries[citekey].zoteroSourceURI,
      )
    );
  }

  async getPdfZoteroLinkForCitekey(citekey: string): Promise<string> {
    return (
      this.library.entries[citekey].zoteroPdfURI ||
      resolveZoteroLink(
        citekey,
        true,
        this.library.entries[citekey].zoteroSourceURI,
      )
    );
  }

  async insertZoteroLink(
    citekey: string,
    pdf = false,
    editor = this.editor,
  ): Promise<void> {
    if (!isCitationEditor(editor)) {
      new Notice(
        'No compatible editor. Open a note or canvas text editor first.',
      );
      return;
    }
    const unchanged = captureEditor(editor, this.app.workspace);
    const link = pdf
      ? await this.getPdfZoteroLinkForCitekey(citekey)
      : await this.getEntryZoteroLinkForCitekey(citekey);
    if (!link) {
      new Notice('This reference has no Zotero link.');
      return;
    }
    if (unchanged()) editor.replaceSelection(link);
  }
}
