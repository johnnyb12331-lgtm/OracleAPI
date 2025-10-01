const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Set ffmpeg path to static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Optimizes an image by compressing it and converting to WebP format
 * @param {Buffer} imageBuffer - The image buffer
 * @param {string} filename - Original filename
 * @param {string} uploadDir - Directory to save optimized image
 * @returns {Promise<string>} - Path to the optimized image
 */
const optimizeImage = async (imageBuffer, filename, uploadDir = 'uploads') => {
  try {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const baseName = path.parse(filename).name;
    const optimizedFilename = `${baseName}_${timestamp}.webp`;
    const optimizedPath = path.join(uploadDir, optimizedFilename);

    // Ensure upload directory exists
    await fs.mkdir(uploadDir, { recursive: true });

    // Optimize image: convert to WebP, compress, and resize if too large
    await sharp(imageBuffer)
      .webp({ quality: 80 }) // Convert to WebP with 80% quality
      .resize(1920, 1080, { // Max dimensions for posts
        fit: 'inside',
        withoutEnlargement: true
      })
      .toFile(optimizedPath);

    console.log(`✅ Image optimized: ${filename} -> ${optimizedFilename}`);
    return optimizedFilename; // Return relative path for database storage
  } catch (error) {
    console.error('❌ Image optimization failed:', error);
    throw new Error('Failed to optimize image');
  }
};

/**
 * Validates image file type and size
 * @param {Buffer} buffer - Image buffer
 * @param {string} mimetype - MIME type
 * @returns {boolean} - Whether the image is valid
 */
const validateImage = (buffer, mimetype) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml', 'image/avif', 'image/heic', 'image/heif'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!allowedTypes.includes(mimetype)) {
    throw new Error('Invalid image type. Only JPEG, PNG, GIF, WebP, BMP, TIFF, SVG, AVIF, HEIC, and HEIF are allowed.');
  }

  if (buffer.length > maxSize) {
    throw new Error('Image too large. Maximum size is 10MB.');
  }

  return true;
};

/**
 * Optimizes a video by compressing it and converting to MP4 format
 * @param {Buffer} videoBuffer - The video buffer
 * @param {string} filename - Original filename
 * @param {string} uploadDir - Directory to save optimized video
 * @returns {Promise<string>} - Path to the optimized video
 */
const optimizeVideo = async (videoBuffer, filename, uploadDir = 'uploads') => {
  return new Promise(async (resolve, reject) => {
    try {
      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const baseName = path.parse(filename).name;
      const optimizedFilename = `${baseName}_${timestamp}.mp4`;
      const inputPath = path.join(uploadDir, `temp_${timestamp}_${filename}`);
      const outputPath = path.join(uploadDir, optimizedFilename);

      // Ensure upload directory exists
      await fs.mkdir(uploadDir, { recursive: true });

      // Write buffer to temporary file
      await fs.writeFile(inputPath, videoBuffer);

      // Compress video using ffmpeg
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264', // Use H.264 codec
          '-preset medium', // Encoding preset (faster, medium quality)
          '-crf 28', // Constant Rate Factor (higher = more compression)
          '-c:a aac', // Audio codec
          '-b:a 128k', // Audio bitrate
          '-movflags +faststart', // Enable fast start for web playback
          '-vf scale=-2:720' // Scale to 720p height, maintain aspect ratio
        ])
        .output(outputPath)
        .on('end', async () => {
          try {
            // Clean up temporary file
            await fs.unlink(inputPath);
            console.log(`✅ Video optimized: ${filename} -> ${optimizedFilename}`);
            resolve(optimizedFilename);
          } catch (cleanupError) {
            console.warn('⚠️ Failed to clean up temporary video file:', cleanupError);
            resolve(optimizedFilename); // Still resolve since optimization succeeded
          }
        })
        .on('error', async (err) => {
          try {
            // Clean up files on error
            await fs.unlink(inputPath);
          } catch (cleanupError) {
            console.warn('⚠️ Failed to clean up temporary video file on error:', cleanupError);
          }
          console.error('❌ Video optimization failed:', err);
          reject(new Error('Failed to optimize video'));
        })
        .run();
    } catch (error) {
      console.error('❌ Video optimization setup failed:', error);
      reject(new Error('Failed to setup video optimization'));
    }
  });
};

/**
 * Validates video file type and size
 * @param {Buffer} buffer - Video buffer
 * @param {string} mimetype - MIME type
 * @returns {boolean} - Whether the video is valid
 */
const validateVideo = (buffer, mimetype) => {
  const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'];
  const maxSize = 50 * 1024 * 1024; // 50MB for videos

  if (!allowedTypes.includes(mimetype)) {
    throw new Error('Invalid video type. Only MP4, AVI, MOV, WMV, FLV, WebM, and MKV are allowed.');
  }

  if (buffer.length > maxSize) {
    throw new Error('Video too large. Maximum size is 50MB.');
  }

  return true;
};

/**
 * Handles data URL images by decoding and optimizing them
 * @param {string} dataUrl - The data URL string
 * @param {string} filename - Original filename
 * @param {string} uploadDir - Directory to save optimized image
 * @returns {Promise<string>} - Path to the optimized image
 */
const handleDataUrlImage = async (dataUrl, filename, uploadDir = 'uploads') => {
  try {
    // Check if it's a valid data URL
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error('Invalid data URL format');
    }

    // Extract MIME type and base64 data
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
      throw new Error('Invalid data URL format');
    }

    const header = dataUrl.substring(0, commaIndex);
    const base64Data = dataUrl.substring(commaIndex + 1);

    // Extract MIME type
    const mimeMatch = header.match(/data:image\/([^;]+)/);
    if (!mimeMatch) {
      throw new Error('Invalid data URL MIME type');
    }
    const mimeType = `image/${mimeMatch[1]}`;

    // Decode base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Validate the image
    validateImage(imageBuffer, mimeType);

    // Optimize the image
    return await optimizeImage(imageBuffer, filename, uploadDir);
  } catch (error) {
    console.error('❌ Data URL image processing failed:', error);
    throw new Error('Failed to process data URL image');
  }
};

module.exports = {
  optimizeImage,
  validateImage,
  validateVideo,
  optimizeVideo,
  handleDataUrlImage
};