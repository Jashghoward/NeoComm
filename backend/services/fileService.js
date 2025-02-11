const AWS = require('aws-sdk');
const multer = require('multer');
const path = require('path');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Add allowed file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

const fileService = {
  uploadFile: async (file, userId) => {
    const key = `uploads/${userId}/${Date.now()}-${file.originalname}`;
    
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private'
    };

    try {
      await s3.upload(params).promise();
      return key;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw error;
    }
  },

  getSignedUrl: async (key) => {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Expires: 3600 // URL expires in 1 hour
    };

    try {
      return await s3.getSignedUrlPromise('getObject', params);
    } catch (error) {
      console.error('S3 signed URL error:', error);
      throw error;
    }
  }
};

module.exports = { fileService, upload }; 