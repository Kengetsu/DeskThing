/**
 * Manages application lifecycle events
 */
import { app, BrowserWindow } from 'electron'
import { setupProtocolHandler } from '../system/protocol'
import { setupTray } from '../system/tray'
import { setupDock } from '../system/dock'
import { setupIpcHandlers } from '../ipc/ipcManager'
import { loadModules } from './moduleLoader'
import { closeLoadingWindow, buildMainWindow } from '../windows/windowManager'
import { nextTick } from 'node:process'
import { updateLoadingStatus } from '@server/windows/loadingWindow'

/**
 * Initialize the application lifecycle
 */
export async function initializeAppLifecycle(): Promise<void> {
  // Set up protocol handler
  setupProtocolHandler()

  // Set up platform-specific UI elements
  if (process.platform === 'darwin') {
    setupDock()
  }

  setupTray()

  // Set app ID for Windows
  app.setAppUserModelId('com.deskthing')

  // Optimize window shortcuts
  app.on('browser-window-created', async (_, window) => {
    const { optimizer } = await import('@electron-toolkit/utils')
    optimizer.watchWindowShortcuts(window)
  })

  // Load modules and set up IPC handlers
  nextTick(async () => {
    await loadModules()
    await setupIpcHandlers()

    updateLoadingStatus('Creating main window')

    // Create main window after loading is complete
    const mainWindow = buildMainWindow()

    // Close loading window once main window is ready
    mainWindow.once('ready-to-show', () => {
      closeLoadingWindow()
      updateLoadingStatus('Finishing Up...')
      mainWindow.show()
    })
  })

  // Handle window recreation on macOS
  app.on('activate', function () {
    console.log('Handling recreation on MacOS')
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
      buildMainWindow()
    } else {
      console.log(`Not creating due to ${windows.length} already existing. The window is `, windows.map((w) => w.getTitle()))
    }
  })

  // Handle window closure
  app.on('window-all-closed', async () => {
    const { storeProvider } = await import('../stores/storeProvider')
    const settingsStore = await storeProvider.getStore('settingsStore')
    const settings = await settingsStore.getSettings()
    if (settings?.minimizeApp) {
      // Clear cache from everywhere
      const { default: cacheManager } = await import('../services/cache/cacheManager')
      await cacheManager.hibernateAll()
    } else {
      app.quit()
    }
  })
}
