import * as vscode from 'vscode';

export class Globals {
    static compileOutputFile: string;
    static vvpOutputFile: string;

    static async readConfig() {
        Globals.compileOutputFile = '"' + vscode.workspace.getConfiguration().get('verilog-project-tree.compileOutputFile')! + '"';
        Globals.vvpOutputFile = vscode.workspace.getConfiguration().get('verilog-project-tree.vvpOutputFile')!;
        if (Globals.vvpOutputFile !== '') {
            Globals.vvpOutputFile = '"' + Globals.vvpOutputFile + '"';
        }
    }
}
