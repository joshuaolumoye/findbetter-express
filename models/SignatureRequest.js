// models/SignatureRequest.js
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
      enum: ["pending", "opened", "signed", "cancelled"],
      default: "pending",
    },
    signedAt: { type: Date },
    pdfPath: { type: String },
    
    // Track cancellation document info
    cancellationSigningUrl: { type: String, default: null },
    cancellationDocumentId: { type: String, default: null },
    cancellationStatus: {
      type: String,
      enum: ["pending", "opened", "signed", "cancelled", null],
      default: null,
    },
    cancellationSignedAt: { type: Date },
    cancellationPdfPath: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SignatureRequest", signatureRequestSchema);
