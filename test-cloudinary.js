// ✅ Load environment variables
require('dotenv').config();

// ✅ Import Cloudinary SDK
const cloudinary = require('cloudinary').v2;
console.log("ENV:", process.env.CLOUDINARY_CLOUD_NAME);


// ✅ Configure Cloudinary using .env values
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Test connection to Cloudinary
async function testConnection() {
  try {
    const res = await cloudinary.api.ping();
    console.log("✅ Cloudinary Connected Successfully!");
    console.log(res);
  } catch (err) {
    console.error("❌ Cloudinary Connection Failed:");
    console.error(err);
  }
}

testConnection();
