# Citations — maintained fork

This is an independent maintenance fork of [Jon Gauthier's Citations plugin](https://github.com/hans/obsidian-citation-plugin), retaining its MIT license and plugin ID. It is not an official upstream release.

## Release withdrawn — do not install yet

Version 0.5.0 and its release assets were removed after independent review reproduced regressions. The 0.5.1 source is a development candidate and is not approved for release. Do not install it through BRAT while the fixes are under review. Existing installations should not treat the version number as a stability guarantee.

See the separate [resolution and release status matrix](docs/STATUS.md) and [maintenance record](docs/MAINTENANCE.md). Source tags are retained as review evidence; they do not indicate an available or recommended release.

## Original plugin


This plugin for [Obsidian](https://obsidian.md) integrates your academic reference manager with the Obsidian editing experience.

![](screenshot.png)

The plugin supports reading bibliographies in [BibTeX / BibLaTeX `.bib` format][4] and [CSL-JSON format][1].

## Setup

The original plugin is listed in the Obsidian community plugin catalog. For this fork, use the BRAT instructions above, then toggle Citations on under **Community plugins**.

Once the plugin is installed, you must provide it with a bibliography file:

- If you use **Zotero** with [Better BibTeX][2]:
  - Select a collection in Zotero's left sidebar that you want to export.
  - Click `File` -> `Export library ...`. Select `Better BibLaTeX` or `Better CSL JSON` as the format. (We recommend using the BibLaTeX export unless you experience performance issues. The BibLaTeX format includes more information that you can reference from Obsidian, such as associated PDF attachments, but loads more slowly than the JSON export.)
  - You can optionally choose "Keep updated" to automatically re-export the collection -- this is recommended!
- If you use other reference managers, check their documentation for BibLaTeX or CSL-JSON export support. We plan to officially support other managers in the future.

Now open Obsidian **Settings → Community plugins → Citations**. Paste the path to the exported file (`.bib` or `.json`, depending on the format you chose) in the text field labeled "Citation export path." After closing the settings dialog, you should now be able to search your references from within Obsidian!

## Usage

Available commands:

1. **Open literature note** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>): automatically create or open a literature note for a particular reference. The title, folder, and initial content of the note can be configured in the plugin settings.
2. **Insert literature note reference** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>): insert a link to the literature note corresponding to a particular reference.
3. **Insert literature note content in the current pane** (no hotkey by default): insert content describing a particular reference into the current pane. (This can be useful for updating literature notes you already have but which are missing reference information.)
4. **Insert Markdown citation** (no hotkey by default): insert a [Pandoc-style citation][3] for a particular reference. (The exact format of the citation can be configured in the plugin settings.)

5. **Insert Zotero link**: insert an item URI, or a PDF URI when attachment identity and library context are available.
6. **Create literature note from clipboard**: accept exactly one BibTeX or CSL JSON reference without replacing the loaded bibliography.

### Templates
You can set up your own template for both the title and content of literature notes. The following variables can be used:

```
* {{citekey}}
* {{abstract}}
* {{authorString}}
* {{containerTitle}}
* {{DOI}}
* {{eprint}}
* {{eprinttype}}
* {{eventPlace}}
* {{page}}
* {{publisher}}
* {{publisherPlace}}
* {{title}}
* {{titleShort}}
* {{URL}}
* {{year}}
* {{zoteroSelectURI}}
* {{editorString}}
* {{type}}
* {{keywords}}
* {{issued}}
* {{ISBN}}
* {{language}}
* {{issue}}
* {{zoteroPdfHash}}
* {{zoteroPdfURI}}
```
For example, your literature note title template can simply be `@{{citekey}}` and the content template can look like:
```
---
title: {{yaml title}}
authors: {{yaml authorString}}
year: {{year}}
---
{{abstract}}
```

## Template and workflow notes

- Use `{{yaml title}}`, `{{yaml authorString}}`, or `{{yaml containerTitle}}` for YAML property values. The helper quotes and escapes colons, quotes, backslashes, and newlines. Existing custom templates are preserved; quoting a value manually does not escape embedded quotes.
- BibLaTeX title capitalization is preserved. Export with **Better BibLaTeX** or **Better CSL JSON**, and enable the exporter's **Keep updated** option. This plugin watches the export file; it does not read Zotero's database directly.
- Loading a bibliography makes it searchable through the **Citations** commands. It does not import every entry as a note automatically.
- `{{issued}}` is an ISO calendar date when a valid issue date is present. A year-only date uses January 1; a missing day uses the first day of that month. Missing or invalid dates remain empty.
- `{{zoteroSelectURI}}` uses an explicit native Zotero URI when available. Otherwise, commands and templates resolve the exact citekey through a running Zotero with Better BibTeX on localhost. Missing or ambiguous matches produce an error instead of guessing an item key. Templates without Zotero URI variables remain offline; exporting a native URI avoids that lookup.
- Zotero PDF links use explicit attachment identity when exported, or Better BibTeX attachment lookup when Zotero is running. Local PDF paths are opened only if they exist. Missing PDFs and failed launches produce an error.
- Existing literature notes are reused, including moved notes. The configured path takes priority; otherwise a single matching filename anywhere in the vault is reused. Filename matching cannot distinguish an unrelated note with that name. Multiple matches produce an error. Citations does not overwrite existing note content.
- Duplicate citation IDs produce a warning and retain the last record, matching the original plugin. If their titles or DOIs differ, earlier values are excluded from the loaded library; resolve the duplicate in your reference manager. Nonfatal BibTeX parser warnings are summarized without logging bibliography contents. Fatal parse errors preserve the previously loaded library.
- BibTeX notes preserve literal angle brackets, Spanish punctuation, and existing TeX formatting/link conversion. Input containing angle brackets uses a second parser pass, which increases bibliography loading time.
- This is a desktop plugin. Mobile support, live citation rendering, and third-party view compatibility are not implied by the release.

## License

MIT License.

## Contributors

- Jon Gauthier ([hans](https://github.com/hans))
- [raineszm](https://github.com/raineszm)
- [Luke Murray](https://lukesmurray.com/)
- [valmaev](https://github.com/valmaev)

[1]: https://github.com/citation-style-language/schema#csl-json-schema
[2]: https://retorque.re/zotero-better-bibtex/
[3]: https://pandoc.org/MANUAL.html#extension-citations
[4]: http://www.bibtex.org/

See the [upstream issue and pull request status](docs/STATUS.md) for implementation, release, and verification details.
