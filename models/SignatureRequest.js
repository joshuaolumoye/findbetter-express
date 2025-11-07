// model/SignatureRequest.js
const mongoose = require("mongoose");

const signatureRequestSchema = new mongoose.Schema(
  {
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    userId: { type: String, required: true, default: "" },
    sessionId: { type: String, required: true },
    documentId: { type: String, required: true },
    signingUrl: { type: String, required: true },
    isNewToSwitzerland: { type: Boolean, default: false },
    documentType: { type: String },
    status: {
      type: String,
      enum: ["pending", "opened", "signed"],
      default: "pending",
    },
    signedAt: { type: Date },
    pdfPath: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SignatureRequest", signatureRequestSchema);
