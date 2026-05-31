const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

class VideoRenderer {
  constructor(exportDir) {
    this.exportDir = exportDir;
    this.browser = null;
    this.ensureExportDir();
  }

  ensureExportDir() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  async launchBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--use-gl=egl',
          '--enable-features=WebGL2ComputeContext'
        ],
        ignoreDefaultArgs: ['--mute-audio']
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async renderVideo(options) {
    const {
      jobId,
      initialState,
      operations,
      startTime,
      endTime,
      fps = 30,
      resolution = '1920x1080',
      filename,
      onProgress
    } = options;

    const startTimeRender = Date.now();
    const [width, height] = resolution.split('x').map(Number);

    const frameDir = path.join(this.exportDir, `frames_${jobId}`);
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const browser = await this.launchBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      
      const renderPagePath = path.join(__dirname, 'render-page.html');
      await page.goto(`file://${renderPagePath}`);

      await page.evaluate((data) => {
        return window.initRenderer(data);
      }, {
        initialState,
        operations,
        startTime,
        endTime,
        fps,
        width,
        height
      });

      const duration = (endTime - startTime) / 1000;
      const totalFrames = Math.ceil(duration * fps);

      if (onProgress) onProgress(10, `准备渲染 ${totalFrames} 帧...`);

      const batchSize = 10;
      let renderedFrames = 0;

      for (let i = 0; i < totalFrames; i += batchSize) {
        const batchEnd = Math.min(i + batchSize, totalFrames);
        const frameBatch = [];

        for (let frameIndex = i; frameIndex < batchEnd; frameIndex++) {
          const frameTime = startTime + (frameIndex / fps) * 1000;
          
          const frameData = await page.evaluate((time) => {
            return window.renderFrame(time);
          }, frameTime);

          if (frameData) {
            frameBatch.push({ index: frameIndex, data: frameData });
          }
        }

        for (const { index, data } of frameBatch) {
          const framePath = path.join(frameDir, `frame_${String(index).padStart(6, '0')}.png`);
          const base64Data = data.replace(/^data:image\/png;base64,/, '');
          fs.writeFileSync(framePath, base64Data, 'base64');
          renderedFrames++;
        }

        const progress = 10 + (renderedFrames / totalFrames) * 70;
        if (onProgress) {
          onProgress(progress, `渲染帧: ${renderedFrames}/${totalFrames}`);
        }
      }

      if (onProgress) onProgress(82, '正在合成视频...');

      const outputPath = path.join(this.exportDir, filename);
      
      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-framerate', String(fps),
          '-i', path.join(frameDir, 'frame_%06d.png'),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          outputPath
        ], { timeout: 120000 });
      } catch (ffmpegError) {
        console.warn('ffmpeg failed, trying fallback method:', ffmpegError.message);
        throw new Error('ffmpeg not available. Please install ffmpeg for video export.');
      }

      if (onProgress) onProgress(95, '清理临时文件...');

      fs.rmSync(frameDir, { recursive: true, force: true });

      const stats = fs.statSync(outputPath);
      const renderDuration = (Date.now() - startTimeRender) / 1000;

      if (onProgress) onProgress(100, `完成! 耗时 ${renderDuration.toFixed(1)}s`);

      return {
        success: true,
        filename,
        filePath: outputPath,
        duration: renderDuration,
        fileSize: stats.size,
        framesRendered: renderedFrames
      };

    } catch (error) {
      if (fs.existsSync(frameDir)) {
        fs.rmSync(frameDir, { recursive: true, force: true });
      }
      throw error;
    } finally {
      await page.close();
    }
  }
}

module.exports = VideoRenderer;
