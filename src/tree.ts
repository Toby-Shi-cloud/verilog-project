import * as path from 'path';
import * as vscode from 'vscode';
import { Project, Module, Folder } from './module';

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
		if (other instanceof FileNode) {
			return other.type === vscode.FileType.Directory ? 1 : -1;
		} else if (other instanceof ModuleNode) {
			if (this.module.name < other.module.name) { return -1; }
			else if (this.module.name > other.module.name) { return 1; }
			else { return 0; }
		} else {
			return -1;
		}
	}
}

// File文件节点
export class FileNode extends TreeNode {
	type: vscode.FileType;

	constructor(uri: vscode.Uri | undefined, label: string, public folder?: Folder) {
		super(label, folder ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		this.iconPath = folder ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File;
		this.type = folder ? vscode.FileType.Directory : vscode.FileType.File;
		this.contextValue = folder ? 'folder' : 'file';
		this.resourceUri = uri;
	}

	localCompare(other: TreeNode): number {
		if (other instanceof ModuleNode) {
			return this.type === vscode.FileType.Directory ? -1 : 1;
		} else if (other instanceof FileNode) {
			if (this.type !== other.type) {
				return this.type === vscode.FileType.Directory ? -1 : 1;
			} else if (!this.resourceUri && other.resourceUri) {
				return 1;
			} else if (this.resourceUri && !other.resourceUri) {
				return -1;
			}
			if (this.label! < other.label!) { return -1; }
			else if (this.label! > other.label!) { return 1; }
			else { return 0; }
		} else {
			return -1;
		}
	}
}

// 树的内容组织管理
export class TreeNodeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.FileSystemProvider {
	private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | void> = new vscode.EventEmitter<TreeNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | void> = this._onDidChangeTreeData.event;
	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]> = new vscode.EventEmitter<vscode.FileChangeEvent[]>;
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

	private projects: Project | undefined;

	constructor(private rootPath: string | undefined) {
		console.log('rootPath = ' + rootPath);
		if (!rootPath) {
			vscode.window.showInformationMessage('No project in empty workspace');
		} else {
			this.projects = new Project(rootPath);
		}
	}

	watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
		throw new Error('Method not implemented.');
	}

	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		throw new Error('Method not implemented.');
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		throw new Error('Method not implemented.');
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		throw new Error('Method not implemented.');
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	delete(uri: vscode.Uri, options: { readonly recursive: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}
	
	copy?(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	async refresh() {
		await this.projects?.clear();
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TreeNode): TreeNode | Thenable<TreeNode> {
		if (element instanceof FileNode && element.type === vscode.FileType.File) {
			element.command = { command: 'vscode.openFolder', title: "Open File", arguments: [element.resourceUri] };
		} else if (element instanceof ModuleNode) {
			element.command = { command: 'verilog-project-tree.openModule', title: "Open File", arguments: [element.resourceUri, element.module.line] };
		}
		return element;
	}

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		if (element) { // 子节点
			if (element instanceof FileNode && element.folder) {
				await element.folder.readdir();
				return element.folder.map(
					(value) => value[0] instanceof Folder ?
						new FileNode(value[1], value[0].name, value[0]) :
						new FileNode(value[1], value[0])
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
			result.push(...this.projects.noneZeroFolders.map((folder) => new FileNode(folder.uri, folder.name, folder)));
			result.push(...this.projects.otherFolders.map((folder) => new FileNode(folder.uri, folder.name, folder)));
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
