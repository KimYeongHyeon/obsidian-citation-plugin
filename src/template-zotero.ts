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
  const unconditional = new Set<string>();
  const names = ['zoteroSelectURI', 'zoteroPdfURI'];
  const ast: any = parse(source);
  let needsProbe = false;
  function isZoteroPath(path: any): boolean {
    return (
      path.type === 'PathExpression' &&
      names.includes(path.parts[path.parts.length - 1])
    );
  }
  function ownerPath(path: any): any {
    const parts = path.parts.slice(0, -1);
    return {
      type: 'PathExpression',
      data: path.data,
      depth: path.depth,
      parts,
      original:
        (path.data ? '@' : '') +
        '../'.repeat(path.depth) +
        (parts.join('.') || 'this'),
    };
  }
  function visit(node: any, conditional = false): void {
    if (!node || typeof node !== 'object') return;
    if (node.path?.original === '__zoteroProbe') return;
    if (node.type === 'BlockStatement') {
      visit(node.program, true);
      visit(node.inverse, true);
      return;
    }
    if (Array.isArray(node.params)) {
      node.params = node.params.map((param: any) => {
        const name =
          param.type === 'PathExpression' &&
          param.parts[param.parts.length - 1];
        if (!isZoteroPath(param)) return param;
        needsProbe = true;
        return {
          type: 'SubExpression',
          loc: param.loc,
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['__zoteroProbe'],
            original: '__zoteroProbe',
          },
          params: [
            param,
            { type: 'StringLiteral', value: name, original: name },
            ownerPath(param),
            {
              type: 'BooleanLiteral',
              value: !conditional,
              original: !conditional,
            },
          ],
          hash: undefined,
        };
      });
    }
    if (
      (node.type === 'MustacheStatement' || node.type === 'SubExpression') &&
      node.path.original === 'lookup'
    ) {
      needsProbe = true;
      node.params.push({
        type: 'BooleanLiteral',
        value: !conditional,
        original: !conditional,
      });
      node.path.original = '__zoteroLookup';
      node.path.parts = ['__zoteroLookup'];
    }
    if (
      node.type === 'MustacheStatement' &&
      node.path.type === 'PathExpression'
    ) {
      const name = node.path.parts[node.path.parts.length - 1];
      if (isZoteroPath(node.path) && node.params.length === 0) {
        needsProbe = true;
        node.params = [
          node.path,
          { type: 'StringLiteral', value: name, original: name },
          ownerPath(node.path),
          {
            type: 'BooleanLiteral',
            value: !conditional,
            original: !conditional,
          },
        ];
        node.path = {
          type: 'PathExpression',
          data: false,
          depth: 0,
          parts: ['__zoteroProbe'],
          original: '__zoteroProbe',
        };
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value))
        value.forEach((child) => visit(child, conditional));
      else if (typeof value === 'object') visit(value, conditional);
    }
  }
  visit(ast);
  if (!needsProbe) return template(variables);
  const probe = compile(ast);
  for (let i = 0; i < names.length; i++) {
    used.clear();
    unconditional.clear();
    probe(variables, {
      helpers: {
        __zoteroLookup(
          object: any,
          name: string,
          required: boolean,
          options: any,
        ) {
          const value =
            object == null ? object : options.lookupProperty(object, name);
          if (
            (object === variables || object === variables.entry) &&
            names.includes(name) &&
            !value
          ) {
            used.add(name);
            if (required) unconditional.add(name);
          }
          return value;
        },
        __zoteroProbe(value: any, name: string, owner: any, required: boolean) {
          if (!value && (owner === variables || owner === variables.entry)) {
            used.add(name);
            if (required) unconditional.add(name);
          }
          return value;
        },
      },
    });
    const name =
      names.find(
        (candidate) => unconditional.has(candidate) && !variables[candidate],
      ) ||
      names.find((candidate) => used.has(candidate) && !variables[candidate]);
    if (!name) break;
    const link = await resolve(
      variables.citekey,
      name === 'zoteroPdfURI',
      variables.entry.zoteroSourceURI,
    );
    variables[name] = link;
    variables.entry[name] = link;
  }
  return template(variables);
}
