import { gql, baseUrl } from './gql'
import type { StorageInfo, DatabaseBackup, BackupImportResult } from '$lib/server-adapters/types'

const STORAGE_FIELDS = `
	usedBytes totalBytes freeBytes dataDir mediaDir databasePath
	categories { key label path bytes fileCount clearable }
`
const BACKUP_FIELDS = `name path bytes createdAt kind`

export const storage = {
	async storageInfo(): Promise<StorageInfo> {
		const data = await gql<{ storageInfo: StorageInfo }>(
			`query StorageInfo { storageInfo { ${STORAGE_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.storageInfo
	},

	async clearStorageCategory(key: string): Promise<StorageInfo> {
		const data = await gql<{ clearStorageCategory: StorageInfo }>(
			`mutation ClearStorageCategory($key: String!) {
				clearStorageCategory(key: $key) { ${STORAGE_FIELDS} }
			}`,
			{ key },
			baseUrl(),
		)
		return data.clearStorageCategory
	},

	async relocateDownloads(newPath: string, migrate: boolean): Promise<{ newPath: string; migrated: boolean; movedFiles: number; movedBytes: number }> {
		const data = await gql<{ relocateDownloads: { newPath: string; migrated: boolean; movedFiles: number; movedBytes: number } }>(
			`mutation RelocateDownloads($newPath: String!, $migrate: Boolean!) {
				relocateDownloads(newPath: $newPath, migrate: $migrate) { newPath migrated movedFiles movedBytes }
			}`,
			{ newPath, migrate },
			baseUrl(),
		)
		return data.relocateDownloads
	},

	async relocateLocalSource(newPath: string, migrate: boolean): Promise<{ newPath: string; migrated: boolean; movedFiles: number; movedBytes: number }> {
		const data = await gql<{ relocateLocalSource: { newPath: string; migrated: boolean; movedFiles: number; movedBytes: number } }>(
			`mutation RelocateLocalSource($newPath: String!, $migrate: Boolean!) {
				relocateLocalSource(newPath: $newPath, migrate: $migrate) { newPath migrated movedFiles movedBytes }
			}`,
			{ newPath, migrate },
			baseUrl(),
		)
		return data.relocateLocalSource
	},

	async migrateMangaDownloadFormat(target: 'loose' | 'cbz'): Promise<{ chaptersMigrated: number; pagesMigrated: number }> {
		const data = await gql<{ migrateMangaDownloadFormat: { chaptersMigrated: number; pagesMigrated: number } }>(
			`mutation MigrateMangaDownloadFormat($target: String!) {
				migrateMangaDownloadFormat(target: $target) { chaptersMigrated pagesMigrated }
			}`,
			{ target },
			baseUrl(),
		)
		return data.migrateMangaDownloadFormat
	},

	async databaseBackups(): Promise<DatabaseBackup[]> {
		const data = await gql<{ databaseBackups: DatabaseBackup[] }>(
			`query DatabaseBackups { databaseBackups { ${BACKUP_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.databaseBackups
	},

	async createDatabaseBackup(): Promise<DatabaseBackup> {
		const data = await gql<{ createDatabaseBackup: DatabaseBackup }>(
			`mutation CreateDatabaseBackup { createDatabaseBackup { ${BACKUP_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.createDatabaseBackup
	},

	async deleteDatabaseBackup(name: string): Promise<boolean> {
		const data = await gql<{ deleteDatabaseBackup: boolean }>(
			`mutation DeleteDatabaseBackup($name: String!) { deleteDatabaseBackup(name: $name) }`,
			{ name },
			baseUrl(),
		)
		return data.deleteDatabaseBackup
	},

	async exportMihonBackup(): Promise<DatabaseBackup> {
		const data = await gql<{ exportMihonBackup: DatabaseBackup }>(
			`mutation ExportMihonBackup { exportMihonBackup { ${BACKUP_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.exportMihonBackup
	},

	async importMihonBackup(name: string): Promise<BackupImportResult> {
		const data = await gql<{ importMihonBackup: BackupImportResult }>(
			`mutation ImportMihonBackup($name: String!) {
				importMihonBackup(name: $name) { mangaImported mangaSkipped categoriesImported trackingImported warnings }
			}`,
			{ name },
			baseUrl(),
		)
		return data.importMihonBackup
	},
}
