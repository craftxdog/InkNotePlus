import { contextBridge, ipcRenderer } from 'electron';

import { createInkNoteApi } from './preload/api';

contextBridge.exposeInMainWorld('inkNote', createInkNoteApi(ipcRenderer));
