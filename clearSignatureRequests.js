// clearSignatureRequests.js
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const SignatureRequest = require("./models/SignatureRequest");

dotenv.config();

// goal: empty db 
async function clearSignatureRequests() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const result = await SignatureRequest.deleteMany({});
    console.log(`Deleted ${result.deletedCount} documents from SignatureRequest collection`);

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  } catch (err) {
    console.error("Error clearing SignatureRequest collection:", err);
    process.exit(1);
  }
}

clearSignatureRequests();
