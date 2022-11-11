import * as path from 'path';
import * as vscode from 'vscode';
import { Project, Module } from './module';

// 模块节点
class ModuleNode extends vscode.TreeItem {
	uri: vscode.Uri | undefined;

	constructor(public module: Module, name?: string) {
		super((name ?? '') + module.name + ' (' + module.filename + ')',
			module.subModule.length ?
				vscode.TreeItemCollapsibleState.Collapsed :
				vscode.TreeItemCollapsibleState.None);
		this.uri = module.fileUri;
		// this.iconPath = "resources\\V.svg";
	}

	iconPath = path.join(__filename, '..', '..', 'resources', 'V.svg');
}

// 文件与文件夹节点
class FileNode extends vscode.TreeItem {
	constructor(public uri: vscode.Uri | undefined, public type: vscode.FileType, label: string) {
		super(label, type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		this.iconPath =  type === vscode.FileType.Directory ? {
			light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
			dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
		} : path.join(__filename, '..', '..', 'resources', 'V.svg');
	}
}

// 树的内容组织管理
export class TreeNodeProvider implements vscode.TreeDataProvider<vscode.TreeItem>
{
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	private projects: Project | undefined;

	constructor(private rootPath: string | undefined) {
		console.log('rootPath = ' + rootPath);
		if (!rootPath) {
			vscode.window.showInformationMessage('No project in empty workspace');
		} else {
			this.projects = new Project(rootPath);
		}
	}

	async refresh() {
		console.log('fresh!');
		await this.projects?.clear();
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		if (element instanceof ModuleNode || element instanceof FileNode && element.type === vscode.FileType.File) {
			element.command = { command: 'verilog-project-tree.openFile', title: "Open File", arguments: [element.uri] };
			element.contextValue = 'file';
		}
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (element) { // 子节点
			if (element instanceof FileNode) {
				return this.projects!.includeFiles.map(
					(value) => new FileNode(value[1], vscode.FileType.File, value[0])
				).sort((a, b) => {
					if (a.label! < b.label!) { return -1; }
					else if (a.label! > b.label!) { return 1; }
					else { return 0; }
				});
			} else if (element instanceof ModuleNode) {
				return element.module.subModule.map(
					(value) => new ModuleNode(value[1], value[0] + "  -  ")
				).sort((a, b) => {
					if (a.module.name < b.module.name) { return -1; }
					else if (a.module.name > b.module.name) { return 1; }
					else { return 0; }
				});
			} else {
				return [];
			}
		} else if (this.projects) { // 根节点
			await this.projects.waitForAccomplish();
			// console.log(this.projects.rootModules);
			const result: vscode.TreeItem[] = this.projects.rootModules.map((value) => new ModuleNode(value));
			if (this.projects.includeFiles.length) {
				result.push(new FileNode(undefined, vscode.FileType.Directory, '`Includes'));
			}
			if (!result.length) {
				vscode.window.showInformationMessage('No verilog project in this workspace');
				return [];
			}
			return result.sort((a, b) => {
				if (a instanceof FileNode) { return -1; }
				else if (b instanceof FileNode) { return 1; }
				else { return 0; }
			});
		} else { // 啥也没有
			vscode.window.showInformationMessage('No verilog project in this workspace');
			return [];
		}
	}
}
