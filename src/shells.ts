import * as vscode from 'vscode';

export class Terminals {
    private static terminal: vscode.Terminal | undefined;
    private static invisibleTerminal: vscode.Terminal | undefined;
    private static channel: vscode.OutputChannel | undefined;
    
    static async terminalSendCommand(args: string[]) {
        if (!Terminals.terminal || Terminals.terminal.exitStatus) {
            Terminals.terminal = vscode.window.createTerminal('Verilog Project');
        }
        Terminals.terminal.show();
        Terminals.terminal.sendText(args.reduce((pre, cur) => pre + ' ' + cur));
    }

    private static async invisibleTerminalSendCommand(args: string[]): Promise<string[]> {
        if (!Terminals.invisibleTerminal || Terminals.invisibleTerminal.exitStatus) {
            Terminals.invisibleTerminal = vscode.window.createTerminal('Verilog Project');
        }
        Terminals.invisibleTerminal.hide();
        Terminals.invisibleTerminal.sendText(args.reduce((pre, cur) => pre + ' ' + cur));
        return [];
    }

    static async outputSendCommand(args: string[]) {
        if (!Terminals.channel) {
            Terminals.channel = vscode.window.createOutputChannel('Verilog Project');
        }
        Terminals.channel.show();
        Terminals.channel.appendLine(args.reduce((pre, cur) => pre + ' ' + cur));
    }
}
