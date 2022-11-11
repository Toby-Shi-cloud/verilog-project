import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

namespace funcs {
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

    function analyzeFiles(dir: string, files: string[]): string[] {
        return files.filter((item) =>
            item.endsWith('.v') &&
            fs.lstatSync(path.join(dir, item)).isFile()
        );
    }

    export async function readdir(path: string): Promise<string[]> {
        const $value = await new Promise<string[]>((resolve, reject) => {
            fs.readdir(path, (error, files) => handleResult(resolve, reject, error, files));
        });
        return analyzeFiles(path, $value);
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

export class Project {
    verilogFiles: string[] = [];
    verilogModules: Map<string, [Module, boolean]> = new Map;
    rootModules: Module[] = [];
    includeFiles: [string, vscode.Uri][] = [];
    private actionState = 0;

    constructor(private rootPath: string) { }

    async readModuleFromFile(name: string) {
        const uri = vscode.Uri.file(path.join(this.rootPath, name));
        // console.log('reading ' + uri.fsPath);
        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();
        const regex = /module\s+([a-zA-Z_][a-zA-Z_\d]*)\s*(\([\s\S]*?\))?\s*;([\s\S]*?)endmodule/g;
        getMatches(content, regex).forEach((item) => {
            this.verilogModules.set(item[1], [new Module(item[1], item[3], name, uri), true]);
        });

        const regexInc = /`include "(.*?)"/g;
        getMatches(content, regexInc).forEach((item) => {
            if (this.verilogFiles.indexOf(item[1]) !== -1) {
                var flag = true;
                for (let inc of this.includeFiles) {
                    if (inc[0] === item[1]) {
                        flag = false;
                        break;
                    }
                }
                flag && this.includeFiles.push([item[1], vscode.Uri.file(path.join(this.rootPath, item[1]))]);
            }
        });
    }

    async analyzeModuleDependence(module: Module) {
        // console.log('analyzing ' + module.name);
        const regex = /^\s+([a-zA-Z_][a-zA-Z_\d]*)\s*\([\s\S]*?\)\s*;/;
        this.verilogModules.forEach((value, key) => {
            findAll(module.content, key).forEach((idx) => {
                const matcher = regex.exec(module.content.substring(idx + key.length));
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
        this.verilogFiles = await funcs.readdir(this.rootPath);
        // console.log(this.verilogFiles);

        const group1: Promise<void>[] = [];
        for (let item of this.verilogFiles) {
            group1.push(this.readModuleFromFile(item));
        }
        for (let task of group1) {
            await task;
        }
        // console.log(this.verilogModules);

        const group2: Promise<void>[] = [];
        for (let item of this.verilogModules) {
            group2.push(this.analyzeModuleDependence(item[1][0]));
        }
        for (let task of group2) {
            await task;
        }
        for (let item of this.verilogModules) {
            if (item[1][1]) {
                this.rootModules.push(item[1][0]);
            }
        }
        this.actionState = 1;
        // console.log('analyze over!');
    }

    async clear() {
        this.verilogFiles = [];
        this.verilogModules = new Map;
        this.rootModules = [];
        this.includeFiles = [];
        this.actionState = 0;
    }
}

export class Module {
    subModule: [string, Module][] = [];

    constructor(public name: string, public content: string, public filename: string, public fileUri: vscode.Uri) { }
}
