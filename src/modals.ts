import {
  App,
  EventRef,
  FuzzyMatch,
  FuzzySuggestModal,
  Notice,
  renderMatches,
  SearchMatches,
  SearchMatchPart,
} from 'obsidian';
import { pathToFileURL } from 'url';
import * as path from 'path';
import CitationPlugin from './main';
import { Entry } from './types';

// Stub some methods we know are there..
interface FuzzySuggestModalExt<T> extends FuzzySuggestModal<T> {
  chooser: ChooserExt;
  updateSuggestions(): void;
}
interface ChooserExt {
  useSelectedItem(evt: MouseEvent | KeyboardEvent): void;
}

class SearchModal extends FuzzySuggestModal<Entry> {
  plugin: CitationPlugin;
  limit = 50;

  loadingEl: HTMLElement;

  eventRefs: EventRef[];
  private keyTimer: ReturnType<typeof setTimeout>;
  private chosen = false;
  protected editor: CitationPlugin['editor'];
  private keydown = (ev: KeyboardEvent) => this.onInputKeydown(ev);
  private keyup = (ev: KeyboardEvent) => this.onInputKeyup(ev);

  constructor(app: App, plugin: CitationPlugin) {
    super(app);
    this.plugin = plugin;
    this.editor = plugin.editor;

    this.resultContainerEl.addClass('zoteroModalResults');

    this.inputEl.setAttribute('spellcheck', 'false');

    this.loadingEl = this.resultContainerEl.parentElement.createEl('div', {
      cls: 'zoteroModalLoading',
    });
    this.loadingEl.createEl('div', { cls: 'zoteroModalLoadingAnimation' });
    this.loadingEl.createEl('p', {
      text: 'Loading citation database. Please wait...',
    });
  }

  onOpen() {
    super.onOpen();

    this.chosen = false;
    this.eventRefs = [
      this.plugin.events.on('library-load-start', () => {
        this.setLoading(true);
      }),

      this.plugin.events.on('library-load-complete', () => {
        this.setLoading(false);
      }),
    ];

    this.setLoading(this.plugin.isLibraryLoading);

    // Don't immediately register keyevent listeners. If the modal was triggered
    // by an "Enter" keystroke (e.g. via the Obsidian command dialog), this event
    // will be received here erroneously.
    this.keyTimer = setTimeout(() => {
      this.inputEl.addEventListener('keydown', this.keydown);
      this.inputEl.addEventListener('keyup', this.keyup);
    }, 200);
  }

  onClose() {
    clearTimeout(this.keyTimer);
    this.inputEl.removeEventListener('keydown', this.keydown);
    this.inputEl.removeEventListener('keyup', this.keyup);
    this.eventRefs?.forEach((e) => this.plugin.events.offref(e));
    super.onClose();
  }

  getItems(): Entry[] {
    if (this.plugin.isLibraryLoading) {
      return [];
    }

    return Object.values(this.plugin.library?.entries || {});
  }

  getItemText(item: Entry): string {
    return [
      item.title,
      item.authorString,
      item.editorString,
      item.id,
      item.year,
    ]
      .map((value) => value ?? '')
      .join(' ');
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.loadingEl.removeClass('d-none');
      this.inputEl.disabled = true;
      this.resultContainerEl.empty();
    } else {
      this.loadingEl.addClass('d-none');
      this.inputEl.disabled = false;
      this.inputEl.focus();

      ((this as unknown) as FuzzySuggestModalExt<Entry>).updateSuggestions();
    }
  }

  protected choose(): boolean {
    if (this.chosen) return false;
    this.chosen = true;
    this.close();
    return true;
  }

  protected reportError(error: unknown): void {
    console.error(error);
    new Notice('Citation action failed. See the console for details.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChooseItem(item: Entry, evt: MouseEvent | KeyboardEvent): void {
    if (!this.choose()) return;
    this.plugin
      .openLiteratureNote(item.id, false)
      .catch((error) => this.reportError(error));
  }

  renderSuggestion(match: FuzzyMatch<Entry>, el: HTMLElement): void {
    el.empty();
    const entry = match.item;
    const entryTitle = entry.title || '';

    const container = el.createEl('div', { cls: 'zoteroResult' });
    const titleEl = container.createEl('span', {
      cls: 'zoteroTitle',
    });
    const citekeyEl = container.createEl('span', { cls: 'zoteroCitekey' });

    const authorsCls = entry.authorString
      ? 'zoteroAuthors'
      : 'zoteroAuthors zoteroAuthorsEmpty';
    const authorsEl = container.createEl('span', {
      cls: authorsCls,
    });

    // Prepare to highlight string matches for each part of the search item.
    // Compute offsets of each rendered element's content within the string
    // returned by `getItemText`.
    const allMatches = match.match.matches;
    const authorStringOffset = 1 + entryTitle.length;

    // Filter a match list to contain only the relevant matches for a given
    // substring, and with match indices shifted relative to the start of that
    // substring
    const shiftMatches = (
      matches: SearchMatches,
      start: number,
      end: number,
    ) => {
      return matches
        .filter(
          ([matchStart, matchEnd]) => matchStart < end && matchEnd > start,
        )
        .map(
          ([matchStart, matchEnd]) =>
            [
              Math.max(matchStart, start) - start,
              Math.min(matchEnd, end) - start,
            ] as SearchMatchPart,
        );
    };

    // Now highlight matched strings within each element
    renderMatches(
      titleEl,
      entryTitle,
      shiftMatches(allMatches, 0, entryTitle.length),
    );
    const citekeyOffset =
      authorStringOffset +
      (entry.authorString || '').length +
      1 +
      (entry.editorString || '').length +
      1;
    renderMatches(
      citekeyEl,
      entry.id,
      shiftMatches(allMatches, citekeyOffset, citekeyOffset + entry.id.length),
    );
    if (entry.authorString) {
      renderMatches(
        authorsEl,
        entry.authorString,
        shiftMatches(
          allMatches,
          authorStringOffset,
          authorStringOffset + entry.authorString.length,
        ),
      );
    }
  }

  onInputKeydown(ev: KeyboardEvent) {
    if (ev.key == 'Tab') {
      ev.preventDefault();
    }
  }

  onInputKeyup(ev: KeyboardEvent) {
    if (!this.chosen && (ev.key == 'Enter' || ev.key == 'Tab')) {
      ((this as unknown) as FuzzySuggestModalExt<Entry>).chooser.useSelectedItem(
        ev,
      );
    }
  }
}

export class OpenNoteModal extends SearchModal {
  constructor(app: App, plugin: CitationPlugin) {
    super(app, plugin);

    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to open literature note' },
      { command: 'ctrl ↵', purpose: 'to open literature note in a new pane' },
      { command: 'tab', purpose: 'open in Zotero' },
      { command: 'shift tab', purpose: 'open PDF' },
      { command: 'esc', purpose: 'to dismiss' },
    ]);
  }

  onChooseItem(item: Entry, evt: MouseEvent | KeyboardEvent): void {
    if (!this.choose()) return;
    if (evt instanceof MouseEvent || evt.key == 'Enter') {
      const newPane =
        evt instanceof KeyboardEvent && (evt as KeyboardEvent).ctrlKey;
      this.plugin
        .openLiteratureNote(item.id, newPane)
        .catch((error) => this.reportError(error));
    } else if (evt.key == 'Tab') {
      if (evt.shiftKey) {
        const files = item.files || [];
        const pdfPath = files.find(
          (file) => path.isAbsolute(file) && /\.pdf$/i.test(file),
        );
        if (item.zoteroPdfURI) {
          open(item.zoteroPdfURI);
        } else if (!pdfPath) {
          new Notice('This reference has no associated PDF files.');
        } else {
          open(pathToFileURL(pdfPath).href);
        }
      } else {
        open(item.zoteroSelectURI);
      }
    }
  }
}

export class InsertNoteLinkModal extends SearchModal {
  constructor(app: App, plugin: CitationPlugin) {
    super(app, plugin);

    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert literature note reference' },
      { command: 'esc', purpose: 'to dismiss' },
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChooseItem(item: Entry, evt: unknown): void {
    if (!this.choose()) return;
    this.plugin
      .insertLiteratureNoteLink(item.id, this.editor)
      .catch((error) => this.reportError(error));
  }
}

export class InsertNoteContentModal extends SearchModal {
  constructor(app: App, plugin: CitationPlugin) {
    super(app, plugin);

    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      {
        command: '↵',
        purpose: 'to insert literature note content in active pane',
      },
      { command: 'esc', purpose: 'to dismiss' },
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChooseItem(item: Entry, evt: unknown): void {
    if (!this.choose()) return;
    this.plugin
      .insertLiteratureNoteContent(item.id, this.editor)
      .catch((error) => this.reportError(error));
  }
}

export class InsertCitationModal extends SearchModal {
  constructor(app: App, plugin: CitationPlugin) {
    super(app, plugin);

    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert Markdown citation' },
      { command: 'shift ↵', purpose: 'to insert secondary Markdown citation' },
      { command: 'esc', purpose: 'to dismiss' },
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChooseItem(item: Entry, evt: MouseEvent | KeyboardEvent): void {
    if (!this.choose()) return;
    const isAlternative = evt instanceof KeyboardEvent && evt.shiftKey;
    this.plugin
      .insertMarkdownCitation(item.id, isAlternative, this.editor)
      .catch((error) => this.reportError(error));
  }
}

export class InsertZoteroLinkModal extends SearchModal {
  constructor(app: App, plugin: CitationPlugin) {
    super(app, plugin);
    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert Zotero PDF link' },
      { command: 'shift ↵', purpose: 'to insert Zotero item link' },
      { command: 'esc', purpose: 'to dismiss' },
    ]);
  }

  onChooseItem(item: Entry, evt: MouseEvent | KeyboardEvent): void {
    if (!this.choose()) return;
    const pdf = !(evt instanceof KeyboardEvent && evt.shiftKey);
    this.plugin
      .insertZoteroLink(item.id, pdf, this.editor)
      .catch((error) => this.reportError(error));
  }
}
