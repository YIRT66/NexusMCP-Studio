import ts from 'typescript';
import { promises as fs } from 'node:fs';
const source = await fs.readFile(new URL('../migration-reference/page-control.ts', import.meta.url), 'utf8');
await fs.writeFile(new URL('../preserved-mcp/page-control.mjs', import.meta.url), '// 从迁移保留的 TypeScript 页面控制逻辑编译。\n' + ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
