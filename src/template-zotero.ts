import { parse, compile } from 'handlebars';
import { resolveZoteroLink } from './zotero';

type Variables = Record<string, any>;

export async function renderZoteroTemplate(
  source: string,
  template: ReturnType<typeof compile>,
  variables: Variables,
  resolve = resolveZoteroLink,
): Promise<string> {
  const used = new Set<string>();
  function visit(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'PathExpression') {
      for (const part of node.parts) used.add(part);
    }
    if (node.type === 'StringLiteral') used.add(node.value);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (typeof value === 'object') visit(value);
    }
  }
  visit(parse(source));
  for (const [name, pdf] of [
    ['zoteroSelectURI', false],
    ['zoteroPdfURI', true],
  ] as const) {
    if (used.has(name) && !variables[name]) {
      const link = await resolve(variables.citekey, pdf);
      variables[name] = link;
      variables.entry[name] = link;
    }
  }
  return template(variables);
}
