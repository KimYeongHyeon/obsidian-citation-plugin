jest.mock('electron', () => ({ shell: {} }), { virtual: true });
jest.mock(
  'obsidian',
  () => {
    class Element {
      parentElement: Element;
      disabled = false;
      children: Element[] = [];
      constructor(parent?: Element) {
        this.parentElement = parent || this;
      }
      createEl(): Element {
        const child = new Element(this);
        this.children.push(child);
        return child;
      }
      addClass = jest.fn();
      removeClass = jest.fn();
      empty = jest.fn();
      focus = jest.fn();
      setAttribute = jest.fn();
      addEventListener = jest.fn();
      removeEventListener = jest.fn();
    }
    class FuzzySuggestModal {
      inputEl = new Element();
      resultContainerEl = new Element();
      chooser = { useSelectedItem: jest.fn() };
      close = jest.fn();
      setInstructions = jest.fn();
      onOpen = jest.fn();
      onClose = jest.fn();
    }
    return {
      FuzzySuggestModal,
      Notice: jest.fn(),
      renderMatches: jest.fn(),
      PluginSettingTab: class {},
    };
  },
  { virtual: true },
);

import { renderMatches } from 'obsidian';
import { compile } from 'handlebars';
import { InsertCitationModal, OpenNoteModal } from '../modals';
import { CitationsPluginSettings } from '../settings';

class KeyboardEventMock {
  constructor(public key: string, public shiftKey = false) {}
}
(global as any).KeyboardEvent = KeyboardEventMock;
(global as any).MouseEvent = class {};

function plugin(): any {
  return {
    editor: { replaceSelection: jest.fn() },
    events: { on: jest.fn(), offref: jest.fn() },
    insertMarkdownCitation: jest.fn().mockResolvedValue(undefined),
  };
}

test('empty library is safe and search includes editor and citekey', () => {
  const modal = new OpenNoteModal({} as any, plugin());
  expect(modal.getItems()).toEqual([]);
  expect(
    modal.getItemText({
      title: 'Title',
      authorString: 'Author',
      editorString: 'Editor',
      id: 'key',
      year: 2020,
    } as any),
  ).toBe('Title Author Editor key 2020');
});

test('highlight clips a match crossing the title and author boundary', () => {
  const modal = new OpenNoteModal({} as any, plugin());
  const el = (modal as any).resultContainerEl;
  modal.renderSuggestion(
    {
      item: {
        title: 'Title',
        authorString: 'Author',
        editorString: '',
        id: 'key',
      },
      match: { matches: [[3, 9]] },
    } as any,
    el,
  );
  expect(renderMatches).toHaveBeenCalledWith(expect.anything(), 'Title', [
    [3, 5],
  ]);
  expect(renderMatches).toHaveBeenCalledWith(expect.anything(), 'Author', [
    [0, 3],
  ]);
});

test('selection is handled once with the editor captured on opening', () => {
  const owner = plugin();
  const original = owner.editor;
  const modal = new InsertCitationModal({} as any, owner);
  owner.editor = {};
  const event = new KeyboardEventMock('Enter', true) as any;
  modal.onChooseItem({ id: 'key' } as any, event);
  modal.onChooseItem({ id: 'key' } as any, event);
  expect(owner.insertMarkdownCitation).toHaveBeenCalledTimes(1);
  expect(owner.insertMarkdownCitation).toHaveBeenCalledWith(
    'key',
    true,
    original,
  );
});

test('default YAML quotes and escapes title and authors', () => {
  const template = new CitationsPluginSettings().literatureNoteContentTemplate;
  expect(
    compile(template, { noEscape: true })({
      title: 'A "quote"\nnext',
      authorString: 'A: B',
    }),
  ).toContain('title: "A \\"quote\\"\\nnext"\nauthors: "A: B"');
});
