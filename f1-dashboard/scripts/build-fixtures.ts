import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// These files are type-checked with the full suite; the verification image only
// needs their JavaScript, importing the same compiled server as production.
for (const file of ['support/container-fixture.ts', 'fixtures/providers.ts']) {
  const source = await readFile(path.join('tests', file), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true,
    },
    fileName: file,
  });
  const target = path.join('build-fixtures', file.replace(/\.ts$/, '.js'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, output.outputText);
}
