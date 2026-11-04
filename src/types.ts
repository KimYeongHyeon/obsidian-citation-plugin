import * as BibTeXParser from '@retorquere/bibtex-parser';
import { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';
// Also make EntryDataBibLaTeX available to other modules
export { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';

// Trick: allow string indexing onto object properties
export interface IIndexable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const databaseTypes = ['csl-json', 'biblatex'] as const;
export type DatabaseType = typeof databaseTypes[number];

export const TEMPLATE_VARIABLES = {
  citekey: 'Unique citekey',
  abstract: '',
  authorString: 'Comma-separated list of author names',
  editorString: 'Comma-separated list of editor names',
  type: '',
  keywords: 'Keywords',
  language: 'Language',
  ISBN: 'ISBN',
  issue: 'Issue number',
  issued: 'Date of issue in YYYY-MM-DD format',
  zoteroPdfHash: 'Zotero PDF attachment key',
  zoteroPdfURI: 'URI to open the PDF attachment in Zotero',
  containerTitle:
    'Title of the container holding the reference (e.g. book title for a book chapter, or the journal title for a journal article)',
  DOI: '',
  eprint: '',
  eprinttype: '',
  eventPlace: 'Location of event',
  note: '',
  page: 'Page or page range',
  publisher: '',
  publisherPlace: 'Location of publisher',
  title: '',
  titleShort: '',
  URL: '',
  year: 'Publication year',
  zoteroSelectURI: 'URI to open the reference in Zotero',
};

export class Library {
  constructor(public entries: { [citekey: string]: Entry }) {}

  get size(): number {
    return Object.keys(this.entries).length;
  }

  /**
   * For the given citekey, find the corresponding `Entry` and return a
   * collection of template variable assignments.
   */
  getTemplateVariablesForCitekey(citekey: string): Record<string, any> {
    const entry: Entry = this.entries[citekey];
    const shortcuts = {
      citekey: citekey,

      abstract: entry.abstract,
      authorString: entry.authorString,
      editorString: entry.editorString,
      type: entry.type,
      keywords: entry.keywords,
      language: entry.language,
      ISBN: entry.ISBN,
      issue: entry.issue,
      issued:
        entry.issuedDate && !isNaN(entry.issuedDate.getTime())
          ? entry.issuedDate.toISOString().slice(0, 10)
          : undefined,
      zoteroPdfHash: entry.zoteroPdfHash,
      zoteroPdfURI: entry.zoteroPdfURI,
      containerTitle: entry.containerTitle,
      DOI: entry.DOI,
      eprint: entry.eprint,
      eprinttype: entry.eprinttype,
      eventPlace: entry.eventPlace,
      note: entry.note,
      page: entry.page,
      publisher: entry.publisher,
      publisherPlace: entry.publisherPlace,
      title: entry.title,
      titleShort: entry.titleShort,
      URL: entry.URL,
      year: entry.year?.toString(),
      zoteroSelectURI: entry.zoteroSelectURI,
    };

    return { entry: entry.toJSON(), ...shortcuts };
  }
}

/**
 * Load reference entries from the given raw database data.
 *
 * Returns a list of `EntryData`, which should be wrapped with the relevant
 * adapter and used to instantiate a `Library`.
 */
export function loadEntries(
  databaseRaw: string,
  databaseType: DatabaseType,
): EntryData[] {
  let libraryArray: EntryData[];

  if (databaseType == 'csl-json') {
    libraryArray = JSON.parse(databaseRaw);
    if (!Array.isArray(libraryArray))
      throw new Error('CSL JSON must be an array of entries');
  } else if (databaseType == 'biblatex') {
    let warningCount = 0;
    const options: BibTeXParser.ParserOptions = {
      sentenceCase: false,
      verbatimFields: [
        /^citeulike-linkout-[0-9]+$/,
        ...BibTeXParser.fields.verbatim,
        'comment',
      ],
      errorHandler: () => {
        warningCount++;
      },
    };

    const parsed = BibTeXParser.parse(
      databaseRaw,
      options,
    ) as BibTeXParser.Bibliography;

    if (warningCount) {
      console.warn(
        `Citation plugin: ${warningCount} non-fatal BibLaTeX parser warnings`,
      );
    }
    parsed.errors.forEach((error) => {
      console.error(
        `Citation plugin: fatal error loading BibLaTeX entry` +
          ` (line ${error.line}, column ${error.column}):`,
        error.message,
      );
    });

    if (parsed.errors.length) {
      const error = parsed.errors[0];
      throw new Error(
        `Fatal BibLaTeX parse error at line ${error.line}, column ${error.column}: ${error.message}`,
      );
    }
    if (/[<>]/.test(databaseRaw)) {
      let marker = '\uE000';
      while (databaseRaw.includes(marker)) marker += '\uE000';
      const protectedRaw = databaseRaw.replace(/[<>]/g, (char) =>
        char === '<' ? `${marker}L` : `${marker}G`,
      );
      const protectedParsed = BibTeXParser.parse(protectedRaw, {
        ...options,
        errorHandler: () => undefined,
      }) as BibTeXParser.Bibliography;
      if (
        protectedParsed.errors.length ||
        protectedParsed.entries.length !== parsed.entries.length
      ) {
        throw new Error('Failed to preserve angle brackets in BibLaTeX notes');
      }
      const restore = (value: string) =>
        value.split(`${marker}L`).join('<').split(`${marker}G`).join('>');
      parsed.entries.forEach((entry, index) => {
        const protectedEntry = protectedParsed.entries[index];
        if (restore(protectedEntry.key) !== entry.key) {
          throw new Error(
            'Failed to match BibLaTeX entries while preserving notes',
          );
        }
        if (protectedEntry.fields.note) {
          entry.fields.note = protectedEntry.fields.note.map(restore);
        }
      });
    }
    libraryArray = parsed.entries;
  } else {
    throw new Error(`Unsupported bibliography format: ${databaseType}`);
  }

  const seen = new Map<string, EntryData>();
  for (const entry of libraryArray) {
    const id =
      databaseType === 'csl-json'
        ? (entry as EntryDataCSL)?.id
        : (entry as EntryDataBibLaTeX)?.key;
    if (typeof id !== 'string' || !id.trim())
      throw new Error('Bibliography entry is missing an ID');
    if (
      databaseType === 'csl-json' &&
      (typeof (entry as EntryDataCSL).type !== 'string' ||
        !(entry as EntryDataCSL).type.trim())
    )
      throw new Error(`CSL entry ${id} is missing a type`);
    if (databaseType === 'csl-json') {
      const csl = entry as EntryDataCSL;
      for (const role of ['author', 'editor'] as const) {
        const names = csl[role];
        if (
          names != null &&
          (!Array.isArray(names) ||
            names.some(
              (name) =>
                !name ||
                typeof name !== 'object' ||
                ['given', 'family', 'literal'].some(
                  (key) =>
                    (name as IIndexable)[key] != null &&
                    typeof (name as IIndexable)[key] !== 'string',
                ),
            ))
        ) {
          throw new Error(`CSL entry ${id} has invalid ${role} names`);
        }
      }
      if (
        csl.issued != null &&
        (typeof csl.issued !== 'object' ||
          Array.isArray(csl.issued) ||
          (csl.issued['date-parts'] != null &&
            (!Array.isArray(csl.issued['date-parts']) ||
              csl.issued['date-parts'].some(
                (parts) =>
                  !Array.isArray(parts) ||
                  parts.some(
                    (part) =>
                      typeof part !== 'number' || !Number.isFinite(part),
                  ),
              ))))
      ) {
        throw new Error(`CSL entry ${id} has invalid issued date-parts`);
      }
    }
    if (seen.has(id)) {
      const identical = canonicalJSON(seen.get(id)) === canonicalJSON(entry);
      console.warn(
        `Citation plugin: ${
          identical ? 'identical' : 'conflicting'
        } duplicate bibliography ID ${id}; library lookup uses the last entry`,
      );
    }
    seen.set(id, entry);
  }
  return libraryArray;
}

function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

export interface Author {
  given?: string;
  family?: string;
  literal?: string;
}

/**
 * An `Entry` represents a single reference in a reference database.
 * Each entry has a unique identifier, known in most reference managers as its
 * "citekey."
 */
function zoteroHTTPItemURI(value?: string): string {
  return typeof value === 'string' &&
    /^https?:\/\/(?:www\.)?zotero\.org\/(?:users\/(?:\d+|local\/[A-Z0-9]+)|groups\/\d+)\/items\/[A-Z0-9]{8}\/?$/i.test(
      value,
    )
    ? value
    : null;
}

function zoteroItemURI(value?: string): string {
  if (typeof value !== 'string') return null;
  const native = value.match(
    /^zotero:\/\/select\/(library|groups\/\d+)\/items\/([A-Z0-9]{8})$/i,
  );
  if (native)
    return `zotero://select/${native[1].toLowerCase()}/items/${native[2]}`;
  const match = value.match(
    /^https?:\/\/(?:www\.)?zotero\.org\/(users|groups)\/(\d+)\/items\/([A-Z0-9]{8})\/?$/i,
  );
  if (!match) return null;
  return match[1].toLowerCase() === 'groups'
    ? `zotero://select/groups/${match[2]}/items/${match[3]}`
    : null;
}

function selectZoteroIdentity(values: string[]): string {
  return values.find(zoteroHTTPItemURI) || values.find(zoteroItemURI) || null;
}

export abstract class Entry {
  /**
   * Unique identifier for the entry (also the citekey).
   */
  public abstract id: string;

  public abstract type: string;

  public abstract abstract?: string;
  public abstract author?: Author[];

  /**
   * A comma-separated list of authors, each of the format `<firstname> <lastname>`.
   */
  public abstract authorString?: string;
  public abstract editorString?: string;
  public abstract keywords?: string;
  public abstract language?: string;
  public abstract ISBN?: string;
  public abstract issue?: string;

  /**
   * The name of the container for this reference -- in the case of a book
   * chapter reference, the name of the book; in the case of a journal article,
   * the name of the journal.
   */
  public abstract containerTitle?: string;

  public abstract DOI?: string;
  public abstract files?: string[];

  /**
   * The date of issue. Many references do not contain information about month
   * and day of issue; in this case, the `issuedDate` will contain dummy minimum
   * values for those elements. (A reference which is only encoded as being
   * issued in 2001 is represented here with a date 2001-01-01 00:00:00 UTC.)
   */
  public abstract issuedDate?: Date;

  /**
   * Page or page range of the reference.
   */
  public abstract page?: string;
  public abstract title?: string;
  public abstract titleShort?: string;
  public abstract URL?: string;

  public abstract eventPlace?: string;

  public abstract publisher?: string;
  public abstract publisherPlace?: string;

  /**
   * BibLaTeX-specific properties
   */
  public abstract eprint?: string;
  public abstract eprinttype?: string;

  protected _year?: string;
  public get year(): number {
    return this._year
      ? parseInt(this._year)
      : this.issuedDate?.getUTCFullYear();
  }

  protected _note?: string[];

  public get note(): string {
    return this._note
      ?.map((el) =>
        el.replace(/<a\s+href=(["'])(.*?)\1>([\s\S]*?)<\/a>/gi, '[$3]($2)'),
      )
      .join('\n\n');
  }

  /**
   * A URI which will open the relevant entry in the Zotero client.
   */
  public get zoteroSelectURI(): string {
    return this.nativeZoteroURI || null;
  }

  protected get zoteroIdentity(): string {
    return null;
  }

  public get zoteroSourceURI(): string {
    return zoteroHTTPItemURI(this.zoteroIdentity);
  }

  protected get nativeZoteroURI(): string {
    return zoteroItemURI(this.zoteroIdentity);
  }

  public get zoteroPdfHash(): string {
    for (const file of this.files || []) {
      if (!/\.pdf(?:$|:)/i.test(file)) continue;
      const match = file.match(
        /(?:^|[\\/])storage[\\/]([A-Z0-9]{8})[\\/][^\\/]+\.pdf(?:$|:)/i,
      );
      if (match) return match[1];
    }
    return null;
  }

  public get zoteroPdfURI(): string {
    const library = this.nativeZoteroURI?.match(
      /^zotero:\/\/select\/(library|groups\/\d+)\/items\//,
    );
    return this.zoteroPdfHash && library
      ? `zotero://open-pdf/${library[1]}/items/${this.zoteroPdfHash}`
      : null;
  }

  toJSON(): Record<string, unknown> {
    const jsonObj: Record<string, unknown> = Object.assign({}, this);

    // add getter values
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== Object.prototype) {
      Object.entries(Object.getOwnPropertyDescriptors(proto))
        .filter(([, descriptor]) => typeof descriptor.get == 'function')
        .forEach(([key, descriptor]) => {
          if (
            descriptor &&
            key[0] !== '_' &&
            key !== 'nativeZoteroURI' &&
            key !== 'zoteroIdentity'
          ) {
            try {
              const val = (this as IIndexable)[key];
              jsonObj[key] = val;
            } catch (error) {
              return;
            }
          }
        });
      proto = Object.getPrototypeOf(proto);
    }

    return jsonObj;
  }
}

export type EntryData = EntryDataCSL | EntryDataBibLaTeX;

export interface EntryDataCSL {
  id: string;
  type: string;

  abstract?: string;
  author?: Author[];
  editor?: Author[];
  keyword?: string;
  language?: string;
  ISBN?: string;
  issue?: string;
  uri?: string;
  note?: string;
  'container-title'?: string;
  DOI?: string;
  'event-place'?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issued?: { 'date-parts': [any[]] };
  page?: string;
  publisher?: string;
  'publisher-place'?: string;
  title?: string;
  'title-short'?: string;
  URL?: string;
}

function formatCSLNames(names?: Author[]): string | null {
  return names
    ? names
        .map((a) => a.literal || [a.given, a.family].filter(Boolean).join(' '))
        .filter(Boolean)
        .join(', ')
    : null;
}

export class EntryCSLAdapter extends Entry {
  constructor(private data: EntryDataCSL) {
    super();
  }

  eprint: string = null;
  eprinttype: string = null;
  files: string[] = null;

  get id() {
    return this.data.id;
  }
  get type() {
    return this.data.type;
  }

  get abstract() {
    return this.data.abstract;
  }
  get author() {
    return this.data.author;
  }

  get authorString(): string | null {
    return formatCSLNames(this.data.author);
  }
  get editorString(): string | null {
    return formatCSLNames(this.data.editor);
  }
  get keywords(): string {
    return this.data.keyword;
  }
  get language(): string {
    return this.data.language;
  }
  get ISBN(): string {
    return this.data.ISBN;
  }
  get issue(): string {
    return this.data.issue;
  }
  protected get zoteroIdentity(): string {
    return selectZoteroIdentity([this.data.uri, this.data.id]);
  }
  get note(): string {
    return this.data.note;
  }

  get containerTitle() {
    return this.data['container-title'];
  }

  get DOI() {
    return this.data.DOI;
  }

  get eventPlace() {
    return this.data['event-place'];
  }

  get issuedDate() {
    if (
      !(
        this.data.issued &&
        Array.isArray(this.data.issued['date-parts']) &&
        Array.isArray(this.data.issued['date-parts'][0]) &&
        this.data.issued['date-parts'][0].length > 0
      )
    )
      return null;

    const [year, month = 1, day = 1] = this.data.issued['date-parts'][0];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? date
      : null;
  }

  get page() {
    return this.data.page;
  }

  get publisher() {
    return this.data.publisher;
  }

  get publisherPlace() {
    return this.data['publisher-place'];
  }

  get title() {
    return this.data.title;
  }

  get titleShort() {
    return this.data['title-short'];
  }

  get URL() {
    return this.data.URL;
  }
}

const BIBLATEX_PROPERTY_MAPPING: Record<string, string> = {
  abstract: 'abstract',
  booktitle: '_containerTitle',
  date: 'issued',
  doi: 'DOI',
  eprint: 'eprint',
  eprinttype: 'eprinttype',
  eventtitle: 'event',
  journal: '_containerTitle',
  journaltitle: '_containerTitle',
  location: 'publisherPlace',
  pages: 'page',
  shortjournal: 'containerTitleShort',
  title: 'title',
  shorttitle: 'titleShort',
  url: 'URL',
  venue: 'eventPlace',
  year: '_year',
  publisher: 'publisher',
  note: '_note',
};

// BibLaTeX parser returns arrays of property values (allowing for repeated
// property entries). For the following fields, just blindly take the first.
const BIBLATEX_PROPERTY_TAKE_FIRST: string[] = [
  'abstract',
  'booktitle',
  '_containerTitle',
  'date',
  'doi',
  'eprint',
  'eprinttype',
  'eventtitle',
  'journal',
  'journaltitle',
  'location',
  'pages',
  'shortjournal',
  'title',
  'shorttitle',
  'url',
  'venue',
  '_year',
  'publisher',
];

export class EntryBibLaTeXAdapter extends Entry {
  abstract?: string;
  _containerTitle?: string;
  containerTitleShort?: string;
  DOI?: string;
  eprint?: string;
  eprinttype?: string;
  event?: string;
  eventPlace?: string;
  issued?: string;
  page?: string;
  publisher?: string;
  publisherPlace?: string;
  title?: string;
  titleShort?: string;
  URL?: string;
  _year?: string;
  _note?: string[];

  constructor(private data: EntryDataBibLaTeX) {
    super();

    Object.entries(BIBLATEX_PROPERTY_MAPPING).forEach(
      (map: [string, string]) => {
        const [src, tgt] = map;
        if (src in this.data.fields) {
          let val: any = this.data.fields[src];
          if (BIBLATEX_PROPERTY_TAKE_FIRST.includes(src)) {
            val = (val as any[])[0];
          }

          if (
            (src === 'title' || src === 'shorttitle') &&
            typeof val === 'string'
          ) {
            val = val.replace(/<span class="nocase">([\s\S]*?)<\/span>/g, '$1');
          }
          (this as IIndexable)[tgt] = val;
        }
      },
    );
  }

  get id() {
    return this.data.key;
  }
  get type() {
    return this.data.type;
  }

  protected get zoteroIdentity(): string {
    return selectZoteroIdentity([
      this.data.fields.zotero?.[0],
      this.data.fields.uri?.[0],
      this.data.fields.id?.[0],
    ]);
  }

  get files(): string[] {
    const ret: string[] = [];
    for (const field of [this.data.fields.file, this.data.fields.files]) {
      for (const value of field || []) {
        for (let file of value.split(';')) {
          file = file.trim().replace(/:(?:pdf|application\/pdf)$/i, '');
          if (!/^[a-z]\\?:[\\/]/i.test(file)) {
            file = file.replace(/^[^:]*:(?=(?:[a-z]\\?:[\\/]|[\\/]))/i, '');
          }
          file = file.replace(/^([a-z])\\:/i, '$1:');
          if (file) ret.push(file);
        }
      }
    }

    return ret;
  }

  get authorString() {
    return this.formatNames('author');
  }
  get editorString() {
    return this.formatNames('editor');
  }
  get keywords() {
    return this.data.fields.keywords?.join(', ');
  }
  get language() {
    return this.data.fields.language?.[0];
  }
  get ISBN() {
    return this.data.fields.isbn?.[0];
  }
  get issue() {
    return this.data.fields.number?.[0];
  }

  private formatNames(role: 'author' | 'editor') {
    if (this.data.creators[role]) {
      const names = this.data.creators[role].map((name) => {
        if (name.literal) return name.literal;
        const parts = [name.firstName, name.prefix, name.lastName, name.suffix];
        // Drop any null parts and join
        return parts.filter((x) => x).join(' ');
      });
      return names.join(', ');
    } else {
      return this.data.fields[role]?.join(', ');
    }
  }

  get containerTitle() {
    if (this._containerTitle) {
      return this._containerTitle;
    } else if (this.data.fields.eprint) {
      const prefix = this.data.fields.eprinttype
        ? `${this.data.fields.eprinttype}:`
        : '';
      const suffix = this.data.fields.primaryclass
        ? ` [${this.data.fields.primaryclass}]`
        : '';
      return `${prefix}${this.data.fields.eprint}${suffix}`;
    }
  }

  get issuedDate() {
    if (!this.issued)
      return this._year ? new Date(`${this._year}-01-01T00:00:00Z`) : null;
    const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(this.issued);
    if (!match) return null;
    const year = Number(match[1]),
      month = Number(match[2] || 1),
      day = Number(match[3] || 1);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? date
      : null;
  }

  get author(): Author[] {
    return this.data.creators.author?.map((a) => ({
      given: a.firstName,
      family: a.lastName,
    }));
  }
}
