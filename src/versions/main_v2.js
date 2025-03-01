const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');

// Set app metadata
app.setName('Loon Browser');
app.setAppUserModelId('com.loonbrowser.app');

// Keep a global reference of the window object and active view
let mainWindow;
let activeView;

// Keep track of all browser views
const tabViews = new Map();

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Loon Browser',
    backgroundColor: '#1A5F7A',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });

  // Load the index.html file
  const indexPath = path.join(__dirname, 'index.html');
  console.log('Loading index.html from:', indexPath);
  mainWindow.loadFile(indexPath);

  // Allow time for the UI to render before adding the BrowserView
  setTimeout(() => {
    // Create the default tab
    const defaultTabId = 'default-tab';
    createBrowserView(defaultTabId, 'https://www.google.com');
    console.log('Default tab created with ID:', defaultTabId);
  }, 500);

  // Handle window resize
  mainWindow.on('resize', () => {
    if (activeView) {
      updateViewBounds();
    }
  });

  // Handle window close
  mainWindow.on('closed', () => {
    tabViews.clear();
    mainWindow = null;
  });
}

// Create a browser view for a tab
function createBrowserView(tabId, url) {
  if (!mainWindow) return;

  console.log(`Creating browser view for tab ID: ${tabId} with URL: ${url}`);

  // Create a new browser view
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  // Store the view in our tab map
  tabViews.set(tabId, view);
  console.log(`Added tab to tabViews. Current tabs: ${Array.from(tabViews.keys()).join(', ')}`);
  
  // Set as active view
  if (activeView) {
    mainWindow.removeBrowserView(activeView);
  }
  
  activeView = view;
  mainWindow.setBrowserView(activeView);
  
  // Position the view below the UI
  updateViewBounds();
  
  // Load the URL
  view.webContents.loadURL(url);
  
  // Add event listeners
  view.webContents.on('did-start-loading', () => {
    mainWindow.webContents.send('page-loading-start');
  });
  
  view.webContents.on('did-stop-loading', () => {
    mainWindow.webContents.send('page-loading-stop');
  });
  
  view.webContents.on('did-navigate', (event, url) => {
    mainWindow.webContents.send('update-url', url);
  });
  
  view.webContents.on('did-navigate-in-page', (event, url) => {
    mainWindow.webContents.send('update-url', url);
  });
  
  view.webContents.on('page-title-updated', (event, title) => {
    mainWindow.webContents.send('update-title', title);
  });
  
  return tabId;
}

// Update the bounds of the active view
function updateViewBounds() {
  if (!mainWindow || !activeView) return;
  
  const bounds = mainWindow.getBounds();
  activeView.setBounds({
    x: 0,
    y: 80, // Height of browser UI (tab bar + address bar)
    width: bounds.width,
    height: bounds.height - 80
  });
}

// Create a new tab
function createNewTab(url = 'https://www.google.com') {
  if (!mainWindow) return;
  
  const tabId = `tab-${Date.now()}`;
  createBrowserView(tabId, url);
  return tabId;
}

// Switch to a different tab
function switchToTab(tabId) {
  console.log(`Switching to tab with ID: ${tabId}`);
  
  if (!mainWindow) {
    console.error('No mainWindow found');
    return;
  }
  
  const view = tabViews.get(tabId);
  if (!view) {
    console.error(`Tab not found with ID: ${tabId}`);
    console.log('Available tabs:', Array.from(tabViews.keys()));
    return;
  }
  
  console.log('Found view for tab, switching...');
  
  // Remove current view
  if (activeView) {
    mainWindow.removeBrowserView(activeView);
  }
  
  // Set new active view
  activeView = view;
  mainWindow.setBrowserView(activeView);
  updateViewBounds();
  
  // Update UI
  const url = view.webContents.getURL();
  const title = view.webContents.getTitle();
  
  console.log(`Tab switched. URL: ${url}, Title: ${title}`);
  
  if (url) {
    mainWindow.webContents.send('update-url', url);
  }
  
  if (title) {
    mainWindow.webContents.send('update-title', title);
  }
}

// Handle IPC events from renderer
ipcMain.on('navigate', (event, url) => {
  console.log(`Navigating to: ${url}`);
  if (activeView) {
    activeView.webContents.loadURL(url).catch(err => {
      console.error('Failed to load URL:', err);
      
      // If URL loading fails, try searching Google
      if (!url.startsWith('https://www.google.com/search')) {
        activeView.webContents.loadURL(
          `https://www.google.com/search?q=${encodeURIComponent(url)}`
        );
      }
    });
  }
});

ipcMain.on('go-back', () => {
  if (activeView && activeView.webContents.canGoBack()) {
    activeView.webContents.goBack();
  }
});

ipcMain.on('go-forward', () => {
  if (activeView && activeView.webContents.canGoForward()) {
    activeView.webContents.goForward();
  }
});

ipcMain.on('refresh', () => {
  if (activeView) {
    activeView.webContents.reload();
  }
});

ipcMain.on('new-tab', (event, url = 'https://www.google.com') => {
  console.log('Creating new tab with URL:', url);
  const tabId = createNewTab(url);
  event.reply('tab-created', {
    id: tabId,
    url: url,
    title: 'New Tab'
  });
});

ipcMain.on('switch-tab', (event, tabId) => {
  console.log('Received switch-tab event for ID:', tabId);
  switchToTab(tabId);
});

// App lifecycle events
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});