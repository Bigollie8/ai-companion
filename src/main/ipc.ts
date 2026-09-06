import { ipcMain, type BrowserWindow } from 'electron'
import { sendUpdate } from './watcher'
import { aggregateAllData } from './parser/aggregator'
import { exportSessionsCSV } from './csv'
export function setupIPC(window: BrowserWindow): void {
  ipcMain.on('data:refresh', () => sendUpdate(window))
  ipcMain.handle('export:csv', (_event, range, hidden: string[] = [], provider = 'all') => exportSessionsCSV(aggregateAllData(), range, hidden, provider))
}
