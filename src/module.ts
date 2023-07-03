import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Terminals } from './shells';
import { Globals } from './configuration';

namespace _ {
    export function massageError(error: Error & { code?: string }): Error {
        if (error.code === 'ENOENT') {
            return vscode.FileSystemError.FileNotFound();
        }

        if (error.code === 'EISDIR') {
            return vscode.FileSystemError.FileIsADirectory();
        }

        if (error.code === 'EEXIST') {
            return vscode.FileSystemError.FileExists();
        }

        if (error.code === 'EPERM' || error.code === 'EACCESS') {
            return vscode.FileSystemError.NoPermissions();
        }

        return error;
    }

    export function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
        if (error) {
            reject(massageError(error));
        } else {
            resolve(result);
        }
    }

    export async function readdir(path: string): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            fs.readdir(path, (error, files) => handleResult(resolve, reject, error, files));
        });
    }

    export function exists(path: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            fs.exists(path, exists => handleResult(resolve, reject, null, exists));
        });
    }

    export function normalizeNFC(items: string): string;
    export function normalizeNFC(items: string[]): string[];
    export function normalizeNFC(items: string | string[]): string | string[] {
        if (process.platform !== 'darwin') {
            return items;
        }

        if (Array.isArray(items)) {
            return items.map(item => item.normalize('NFC'));
        }

        return items.normalize('NFC');
    }
}

function getMatches(target: string, rExp: RegExp, matches: Array<RegExpExecArray> = []) {
    const matchIfAny = rExp.exec(target);
    matchIfAny && matches.push(matchIfAny) && getMatches(target, rExp, matches);
    return matches;
}

function findAll(context: string, target: string, index?: number, matches: number[] = []) {
    const find = context.indexOf(target, index);
    find !== -1 && matches.push(find) && findAll(context, target, find + 1, matches);
    return matches;
}

function strEndWith(context: string, target: string[]) {
    for (const ext of target) {
        if (context.endsWith(ext)) {
            return true;
        }
    }
    return false;
}

function whichLine(context: string) {
    var count = 0;
    for (const c of context) {
        if (c === '\n') {
            count += 1;
        }
    }
    return count;
}

export class Project {
    verilogFiles: string[] = [];
    verilogModules: Map<[string, string], [Module, boolean]> = new Map;
    rootModules: Module[] = [];
    noneZeroFolders: Folder[] = [];
    otherFolders: Folder[] = [];
    private includeFolder: Folder = new Folder('`includes');
    private docFolder: Folder = new Folder('Documents');
    private testFolder: Folder = new Folder('TestCases');
    private toolFolder: Folder = new Folder('Tools');
    private vcdFolder: Folder = new Folder('VCDs');
    private otherFilesFolder: Folder = new Folder('OtherFiles');
    private actionState = 0;

    async clear() {
        this.verilogFiles = [];
        this.rootModules = [];
        this.otherFolders = [];
        this.noneZeroFolders = [];
        this.otherFilesFolder.clear();
        this.verilogModules.clear();
        this.includeFolder.clear();
        this.docFolder.clear();
        this.testFolder.clear();
        this.toolFolder.clear();
        this.vcdFolder.clear();
        this.actionState = 0;
    }

    constructor(private rootPath: string) { }

    async readModuleFromFile(filename: string) {
        const uri = vscode.Uri.file(path.join(this.rootPath, filename));
        // console.log('reading ' + uri.fsPath);
        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();
        const regex = /module\s+([a-zA-Z_][a-zA-Z_\d]*)\s*(\([\s\S]*?\))?\s*;([\s\S]*?)endmodule/g;
        getMatches(content, regex).forEach((item) => {
            const line = whichLine(content.substring(0, item.index));
            this.verilogModules.set([item[1], filename], [new Module(item[1], item[3], filename, uri, line), true]);
        });

        const regexInc = /`include "(.*?)"/g;
        getMatches(content, regexInc).forEach((item) => {
            if (this.verilogFiles.indexOf(item[1]) !== -1) {
                var flag = true;
                for (let inc of this.includeFolder) {
                    if (inc[0] === item[1]) {
                        flag = false;
                        break;
                    }
                }
                flag && this.includeFolder.push([item[1], vscode.Uri.file(path.join(this.rootPath, item[1]))]);
            }
        });
    }

    async analyzeModuleDependence(module: Module) {
        // console.log('analyzing ' + module.name);
        const regex = /^\s+([a-zA-Z_][a-zA-Z_\d]*)\s*\([\s\S]*?\)\s*;/;
        this.verilogModules.forEach((value, key) => {
            findAll(module.content, key[0]).forEach((idx) => {
                if (idx > 0 && module.content[idx-1].match(/[0-9a-zA-Z_]/)) {
                    return;
                } // 如果前面有东西，就不是名字
                const found = module.content.substring(idx + key[0].length);
                const paramMatch = /^\s*#\s*\(/.exec(found);
                var ready = found;
                if (paramMatch) {
                    const stack: number[] = [];
                    var cur = paramMatch[0].length;
                    stack.push(cur);
                    while (++cur < found.length && stack.length) {
                        if (found[cur] === '(') { stack.push(cur); }
                        else if (found[cur] === ')') { stack.pop(); }
                    }
                    if (stack.length) { return; }
                    ready = ' ' + found.substring(cur);
                }
                const matcher = regex.exec(ready);
                if (matcher) {
                    module.subModule.push([matcher[1], value[0]]);
                    value[1] = false;
                }
            });
        });
    }

    async waitForAccomplish() {
        if (this.actionState) {
            return;
        }
        this.actionState = -1;

        const rootFiles = await _.readdir(this.rootPath);
        console.log('Hello from verilog-project');
        for (const file of rootFiles) {
            if (fs.lstatSync(path.join(this.rootPath, file)).isFile()) {
                if (strEndWith(file, ['.pdf', '.md', '.doc', '.docx', '.xls', '.xlsx'])) {
                    this.docFolder.push([file, vscode.Uri.file(path.join(this.rootPath, file))]);
                } else if (file.startsWith('code')) {
                    this.testFolder.push([file, vscode.Uri.file(path.join(this.rootPath, file))]);
                } else if (strEndWith(file, ['.v', '.vh'])) {
                    this.verilogFiles.push(file);
                } else if (strEndWith(file, ['.py', '.c', '.cpp', '.cc', 'java'])) {
                    this.toolFolder.push([file, vscode.Uri.file(path.join(this.rootPath, file))]);
                } else if (file.endsWith('.vcd')) {
                    this.vcdFolder.push([file, vscode.Uri.file(path.join(this.rootPath, file))]);
                } else {
                    this.otherFilesFolder.push([file, vscode.Uri.file(path.join(this.rootPath, file))]);
                }
            } else {
                this.otherFolders.push(new Folder(file, vscode.Uri.file(path.join(this.rootPath, file))));
            }
        }
        // console.log(this.verilogFiles);
        // console.log(this.docFolder);
        // console.log(this.testFolder);

        const group1: Promise<void>[] = [];
        for (let item of this.verilogFiles) {
            group1.push(this.readModuleFromFile(item));
        }
        for await (let _ of group1) { }
        // console.log(this.verilogModules);

        const group2: Promise<void>[] = [];
        for (let item of this.verilogModules) {
            group2.push(this.analyzeModuleDependence(item[1][0]));
        }
        for await (let _ of group2) { }
        for (let item of this.verilogModules) {
            if (item[1][1]) {
                this.rootModules.push(item[1][0]);
            }
        }

        this.noneZeroFolders = [this.includeFolder, this.docFolder, this.testFolder, this.toolFolder, this.vcdFolder, this.otherFilesFolder]
            .filter((folder) => folder.length !== 0);
        this.actionState = 1;
        // console.log('analyze over!');
    }
}

export class Module {
    subModule: [string, Module][] = [];

    constructor(public name: string, public content: string, public filename: string, public fileUri: vscode.Uri, public line: number) { }

    async getCompileSet(): Promise<Set<string>> {
        const fileSet: Set<string> = new Set;
        fileSet.add(this.fileUri.fsPath);
        for (const [_, sub] of this.subModule) {
            if (fileSet.has(sub.fileUri.fsPath)) { continue; }
            for (const name of await sub.getCompileSet()) {
                fileSet.add(name);
            }
        }
        return fileSet;
    }

    async check() {
        const args = ['iverilog', '-s', this.name, '-t', 'null', '-Wall', '*.v'];
        Terminals.terminalSendCommand(args);
    }

    async compile() {
        const args = ['iverilog', '-s', this.name, '-Wall', '-o', Globals.compileOutputFile, '*.v'];
        Terminals.terminalSendCommand(args);
    }

    async run() {
        const args1 = ['iverilog', '-s', this.name, '-Wall', '-o', Globals.compileOutputFile, '*.v'];
        var args2 = ['vvp', Globals.compileOutputFile];
        if (Globals.vvpOutputFile !== '') {
            args2 = args2.concat('>', Globals.vvpOutputFile);
        }
        if (vscode.env.shell.endsWith('.exe')) {
            Terminals.terminalSendCommand(args1.concat('; if($?) { ', args2, ' }'));
        } else {
            Terminals.terminalSendCommand(args1.concat(' && ', args2));
        }
    }
}

export class Folder extends Array<[Folder | string, vscode.Uri | undefined]> {
    constructor(public name: string, public uri?: vscode.Uri, ...items: [Folder | string, vscode.Uri | undefined][]) {
        super(...items);
    }

    clear() {
        while (this.length) {
            this.pop();
        }
    }

    async readdir() {
        if (this.uri) {
            const files = await _.readdir(this.uri.fsPath);
            for (const filename of files) {
                const filepath = path.join(this.uri.fsPath, filename);
                fs.lstatSync(filepath).isDirectory() ?
                this.push([new Folder(filename, vscode.Uri.file(filepath)), vscode.Uri.file(filepath)]):
                this.push([filename, vscode.Uri.file(filepath)]);
            }
        }
    }
}
