import * as path from 'path';
import * as vscode from 'vscode';
import { Project, Module } from './module';

// TreeView虚节点
export abstract class TreeNode extends vscode.TreeItem {
	abstract localCompare(other: TreeNode): number;
}

// Module模块节点
export class ModuleNode extends TreeNode {

	constructor(public module: Module, name?: string) {
		super((name ?? '') + module.name + ' (' + module.filename + ')',
			module.subModule.length ?
				vscode.TreeItemCollapsibleState.Collapsed :
				vscode.TreeItemCollapsibleState.None);
		this.resourceUri = module.fileUri;
		this.contextValue = !name ? 'topModule' : 'module';
	}

	iconPath = vscode.ThemeIcon.File;
	// iconPath = {
	// 	light: path.join(__filename, '..', '..', 'resources', 'light', 'verilog.svg'),
	// 	dark: path.join(__filename, '..', '..', 'resources', 'dark', 'verilog.svg')
	// };

	localCompare(other: TreeNode): number {
		if (other instanceof IncludeNode) {
			return 1;
		} else if (other instanceof ModuleNode) {
			if (this.module.name < other.module.name) { return -1; }
			else if (this.module.name > other.module.name) { return 1; }
			else { return 0; }
		} else {
			return -1;
		}
	}
}

// Include文件节点
export class IncludeNode extends TreeNode {
	constructor(uri: vscode.Uri | undefined, public type: vscode.FileType, label: string) {
		super(label, type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		this.iconPath = type === vscode.FileType.Directory ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File;
		this.resourceUri = uri;
	}

	localCompare(other: TreeNode): number {
		if (other instanceof ModuleNode) {
			return -1;
		} else if (other instanceof IncludeNode) {
			if (this.label! < other.label!) { return -1; }
			else if (this.label! > other.label!) { return 1; }
			else { return 0; }
		} else {
			return -1;
		}
	}
}

// 树的内容组织管理
export class TreeNodeProvider implements vscode.TreeDataProvider<TreeNode>
{
	private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | void> = new vscode.EventEmitter<TreeNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | void> = this._onDidChangeTreeData.event;

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

	getTreeItem(element: TreeNode): TreeNode | Thenable<TreeNode> {
		if (element instanceof IncludeNode && element.type === vscode.FileType.File) {
			element.command = { command: 'verilog-project-tree.openFile', title: "Open File", arguments: [element.resourceUri] };
			element.contextValue = 'file';
		} else if (element instanceof ModuleNode) {
			element.command = { command: 'verilog-project-tree.openFile', title: "Open File", arguments: [element.resourceUri] };
		}
		return element;
	}

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		if (element) { // 子节点
			if (element instanceof IncludeNode && element.type === vscode.FileType.Directory) {
				return this.projects!.includeFiles.map(
					(value) => new IncludeNode(value[1], vscode.FileType.File, value[0])
				).sort((a, b) => a.localCompare(b));
			} else if (element instanceof ModuleNode) {
				return element.module.subModule.map(
					(value) => new ModuleNode(value[1], value[0] + "  -  ")
				).sort((a, b) => a.localCompare(b));
			} else {
				return [];
			}
		} else if (this.projects) { // 根节点
			await this.projects.waitForAccomplish();
			// console.log(this.projects.rootModules);
			const result: TreeNode[] = this.projects.rootModules.map((value) => new ModuleNode(value));
			if (this.projects.includeFiles.length) {
				result.push(new IncludeNode(undefined, vscode.FileType.Directory, '`Includes'));
			}
			if (!result.length) {
				vscode.window.showInformationMessage('No verilog project in this workspace');
				return [];
			}
			return result.sort((a, b) => a.localCompare(b));
		} else { // 啥也没有
			vscode.window.showInformationMessage('No verilog project in this workspace');
			return [];
		}
	}
}
