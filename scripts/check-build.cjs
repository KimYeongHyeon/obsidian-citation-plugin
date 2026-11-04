const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');

const file = process.argv[2] || 'main.js';
const bundle = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
for (const [name, base] of Object.entries({
  CitationPlugin: 'Plugin',
  SearchModal: 'FuzzySuggestModal',
  CitationSettingTab: 'PluginSettingTab',
  NoticeExt: 'Notice',
  CitationEvents: 'Events',
})) {
  const classes = bundle.statements.filter(statement => ts.isClassDeclaration(statement) && statement.name?.text === name);
  assert.strictEqual(classes.length, 1, `Missing native class ${name}`);
  const heritage = classes[0].heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
  assert(heritage && ts.isPropertyAccessExpression(heritage) && heritage.expression.getText(bundle) === 'obsidian' && heritage.name.text === base, `${name} must extend obsidian.${base}`);
}
console.log('Obsidian subclasses retain native class syntax.');
