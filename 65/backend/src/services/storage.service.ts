import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

const BUCKET_NAME = process.env.S3_BUCKET || 'specimen-images';

export const storageService = {
  async uploadFile(fileBuffer: Buffer, fileName: string, contentType: string): Promise<string> {
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: contentType,
      ACL: 'public-read'
    };

    try {
      const result = await s3.upload(params).promise();
      return result.Location;
    } catch (error) {
      logger.error('文件上传失败:', error);
      throw new Error('文件上传失败');
    }
  },

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const key = fileUrl.split('/').pop();
      if (!key) throw new Error('无效的文件URL');

      await s3.deleteObject({
        Bucket: BUCKET_NAME,
        Key: key
      }).promise();
    } catch (error) {
      logger.error('文件删除失败:', error);
      throw new Error('文件删除失败');
    }
  },

  getFileUrl(fileName: string): string {
    const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    return `${endpoint}/${BUCKET_NAME}/${fileName}`;
  },

  async generatePresignedUrl(fileName: string, expiresIn: number = 3600): Promise<string> {
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Expires: expiresIn
    };

    return s3.getSignedUrlPromise('getObject', params);
  },

  async ensureBucketExists(): Promise<void> {
    try {
      await s3.headBucket({ Bucket: BUCKET_NAME }).promise();
    } catch (error: any) {
      if (error.statusCode === 404) {
        await s3.createBucket({ Bucket: BUCKET_NAME }).promise();
        logger.info(`存储桶 ${BUCKET_NAME} 创建成功`);
      } else {
        throw error;
      }
    }
  }
};
