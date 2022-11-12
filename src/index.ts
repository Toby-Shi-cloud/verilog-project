// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TreeNodeProvider, ModuleNode } from './tree';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "verilog-project" is now active!');

	// Workspace Folder
	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

	const projectTreeProvider = new TreeNodeProvider(rootPath);
	vscode.window.registerTreeDataProvider('verilog-project-tree', projectTreeProvider);
	vscode.commands.registerCommand('verilog-project-tree.refreshEntry', () => projectTreeProvider.refresh());
	vscode.commands.registerCommand('verilog-project-tree.openFile', (resource) => vscode.window.showTextDocument(resource));
	vscode.commands.registerCommand('verilog-project-tree.compile', (node: ModuleNode) => node.module.compile());
	// vscode.window.registerTerminalProfileProvider('verilog-project-compile', {
	// 	provideTerminalProfile(
	// 		token: vscode.CancellationToken
	// 	): vscode.ProviderResult<vscode.TerminalProfile> {
	// 		return new vscode.TerminalProfile({shellPath: 'echo', shellArgs: ['Hello']});
	// 	}
	// });
}

// // This method is called when your extension is deactivated
// export function deactivate() {
// 	console.log('Bad news, your extension "verilog-project" is NOT active!');
// }
