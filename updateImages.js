const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/reeltalk_db');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const updateImages = async () => {
  try {
    const Product = require('./models/Product');
    const products = await Product.find({ images: { $exists: true, $ne: [] } });
    
    for (const product of products) {
      const updatedImages = product.images.map(img => {
        if (img.startsWith('marketplace/')) {
          return img;
        } else {
          return `marketplace/${img}`;
        }
      });
      
      if (JSON.stringify(updatedImages) !== JSON.stringify(product.images)) {
        product.images = updatedImages;
        await product.save();
        console.log(`Updated product ${product._id}: ${product.images}`);
      }
    }
    
    console.log('Image paths updated successfully');
  } catch (error) {
    console.error('Error updating images:', error);
  } finally {
    mongoose.connection.close();
  }
};

connectDB().then(updateImages);