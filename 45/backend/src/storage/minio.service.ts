import * as Minio from 'minio';
import dotenv from 'dotenv';

dotenv.config();

class MinioService {
  private client: Minio.Client;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.MINIO_BUCKET || 'fossil-models';
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
    });
    this.initBucket();
  }

  private async initBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName, '');
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucketName}/*`]
            }
          ]
        };
        await this.client.setBucketPolicy(this.bucketName, JSON.stringify(policy));
        console.log(`MinIO 存储桶 ${this.bucketName} 创建成功`);
      }
    } catch (err) {
      console.warn('MinIO 初始化失败（如果未启动MinIO服务可忽略）:', (err as Error).message);
    }
  }

  async uploadFile(
    fileId: string,
    fileStream: any,
    fileSize: number,
    contentType: string
  ): Promise<string> {
    await this.client.putObject(
      this.bucketName,
      fileId,
      fileStream,
      fileSize,
      { 'Content-Type': contentType }
    );
    return this.getFileUrl(fileId);
  }

  async getFileUrl(fileId: string): Promise<string> {
    return this.client.presignedGetObject(this.bucketName, fileId, 24 * 60 * 60);
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.client.removeObject(this.bucketName, fileId);
  }

  async getFileStream(fileId: string): Promise<any> {
    return this.client.getObject(this.bucketName, fileId);
  }

  async fileExists(fileId: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucketName, fileId);
      return true;
    } catch {
      return false;
    }
  }
}

export default new MinioService();
