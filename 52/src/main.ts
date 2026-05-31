import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = 'TheaterAudioArray2024!SecretKey';
const FILE_MAGIC = 'TAP1';
const FILE_VERSION = 2;
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        title: '剧场音响阵列布局与音效预演系统 v2.0',
        backgroundColor: '#1a1a2e'
    });

    mainWindow.loadFile('index.html');
    
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.handle('save-project', async (event, projectData: any) => {
    try {
        const result = await dialog.showSaveDialog({
            title: '保存工程文件',
            defaultPath: (projectData.name || '未命名工程') + '.tap',
            filters: [
                { name: '剧场音响工程文件', extensions: ['tap'] },
                { name: '所有文件', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }

        const encrypted = encryptProject(projectData);
        fs.writeFileSync(result.filePath, encrypted, 'utf8');
        
        return { success: true, filePath: result.filePath };
    } catch (error) {
        console.error('Save project error:', error);
        return { success: false, error: (error as Error).message };
    }
});

ipcMain.handle('open-project', async () => {
    try {
        const result = await dialog.showOpenDialog({
            title: '打开工程文件',
            filters: [
                { name: '剧场音响工程文件', extensions: ['tap'] },
                { name: '所有文件', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, canceled: true };
        }

        const filePath = result.filePaths[0];
        const stats = fs.statSync(filePath);
        
        let projectData: any;
        
        if (stats.size > LARGE_FILE_THRESHOLD) {
            projectData = await loadLargeProject(filePath);
        } else {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            projectData = decryptProject(fileContent);
        }
        
        return { success: true, projectData, filePath, fileSize: stats.size };
    } catch (error) {
        console.error('Open project error:', error);
        return { success: false, error: (error as Error).message };
    }
});

async function loadLargeProject(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
        let fileContent = '';
        
        stream.on('data', (chunk) => {
            fileContent += chunk;
        });
        
        stream.on('end', () => {
            try {
                const projectData = decryptProject(fileContent);
                resolve(projectData);
            } catch (error) {
                reject(error);
            }
        });
        
        stream.on('error', (error) => {
            reject(error);
        });
    });
}

ipcMain.handle('get-project-info', async (event, filePath: string) => {
    try {
        const stats = fs.statSync(filePath);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        let headerInfo: any = { size: stats.size, modified: stats.mtime };
        
        try {
            const parsed = JSON.parse(fileContent);
            if (parsed.magic === FILE_MAGIC) {
                headerInfo.version = parsed.version;
                headerInfo.encrypted = true;
                
                try {
                    const bytes = CryptoJS.AES.decrypt(parsed.data, ENCRYPTION_KEY, {
                        mode: CryptoJS.mode.CBC,
                        padding: CryptoJS.pad.Pkcs7
                    });
                    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                    const projectData = JSON.parse(decrypted);
                    headerInfo.name = projectData.name;
                    headerInfo.speakerCount = projectData.speakers?.length || 0;
                    headerInfo.createdAt = projectData.createdAt;
                    headerInfo.updatedAt = projectData.updatedAt;
                } catch (e) {
                    headerInfo.previewError = '无法预览加密内容';
                }
            }
        } catch (e) {
            headerInfo.format = 'legacy';
        }
        
        return { success: true, info: headerInfo };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
});

ipcMain.handle('export-report', async (event, reportData: any) => {
    try {
        const result = await dialog.showSaveDialog({
            title: '导出声场分析报告',
            defaultPath: '声场分析报告.txt',
            filters: [
                { name: '文本文件', extensions: ['txt'] },
                { name: '所有文件', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }

        fs.writeFileSync(result.filePath, reportData, 'utf8');
        return { success: true, filePath: result.filePath };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
});

function encryptProject(data: any): string {
    try {
        const jsonString = JSON.stringify(data);
        
        const encrypted = CryptoJS.AES.encrypt(jsonString, ENCRYPTION_KEY, {
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        
        const ciphertext = encrypted.toString();
        
        const hash = CryptoJS.SHA256(jsonString).toString();
        
        const fileContent = {
            magic: FILE_MAGIC,
            version: FILE_VERSION,
            hash: hash,
            data: ciphertext
        };
        
        return JSON.stringify(fileContent);
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('工程文件加密失败');
    }
}

function decryptProject(fileContent: string): any {
    try {
        if (!fileContent || fileContent.trim().length === 0) {
            throw new Error('文件内容为空');
        }

        let encryptedData: string;
        let expectedHash: string | null = null;

        try {
            const parsed = JSON.parse(fileContent);
            
            if (parsed.magic === FILE_MAGIC) {
                if (parsed.version > FILE_VERSION) {
                    console.warn(`File version newer: ${parsed.version}, expected: ${FILE_VERSION}`);
                }
                encryptedData = parsed.data;
                expectedHash = parsed.hash;
            } else {
                encryptedData = fileContent;
            }
        } catch (e) {
            encryptedData = fileContent;
        }

        let decrypted: string;
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY, {
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
            decrypted = bytes.toString(CryptoJS.enc.Utf8);
        } catch (decryptError) {
            try {
                const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
                decrypted = bytes.toString(CryptoJS.enc.Utf8);
            } catch (e2) {
                throw new Error('解密失败，请检查文件密码或文件完整性');
            }
        }

        if (!decrypted || decrypted.trim().length === 0) {
            throw new Error('解密结果为空，文件可能已损坏');
        }

        if (expectedHash) {
            const actualHash = CryptoJS.SHA256(decrypted).toString();
            if (actualHash !== expectedHash) {
                console.warn('Hash mismatch: file may have been modified');
            }
        }

        const projectData = JSON.parse(decrypted);
        
        if (!projectData || typeof projectData !== 'object') {
            throw new Error('无效的工程文件格式');
        }

        if (!projectData.regions) {
            projectData.regions = [];
        }
        if (!projectData.version) {
            projectData.version = 1;
        }

        return projectData;
    } catch (error) {
        console.error('Decryption error:', error);
        
        if (error instanceof SyntaxError) {
            throw new Error('文件格式错误，无法解析JSON数据');
        }
        
        throw error;
    }
}
