// server.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const axios = require("axios");
const cloudinary = require("cloudinary");
const bodyParser = require("body-parser");
const streamifier = require("streamifier");
const SkribbleService = require("./services/SkribbleService");
const { getSkribbleConfig } = require("./services/SkribbleService");
const SignatureRequest = require("./models/SignatureRequest");

dotenv.config();

// Get polling interval from .env (in minutes), fallback to 5 min
const LOOP_TIME =
  (process.env.POLL_INTERVAL_MIN
    ? parseFloat(process.env.POLL_INTERVAL_MIN)
    : 5) *
  60 *
  1000; // convert minutes --> milliseconds

console.log(`Polling every ${LOOP_TIME / 60000} minutes`);

async function startServer() {
  const downloadPdf = process.env.SKRIBBLE_DOWNLOAD == "true";
  console.log("downloadPdf: ", downloadPdf);

  const PQueue = (await import("p-queue")).default;

  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  // ------------------- Mongo -------------------
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");

  // ------------------- Cloudinary -------------------
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // ------------------- Skribble -------------------
  const skribble = new SkribbleService(getSkribbleConfig());
  const queue = new PQueue({ concurrency: 3, intervalCap: 5, interval: 1000 });
  const activeChecks = new Set();

  // ------------------- Cloudinary Upload from Buffer -------------------
  async function uploadBufferToCloudinary(buffer, publicId) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.v2.uploader.upload_stream(
        {
          folder: "skribble_signed_docs",
          public_id: publicId,
          use_filename: true,
          unique_filename: false,
          resource_type: "auto",
        },
        (error, result) => {
          if (error) return reject(error);

          const viewableUrl = downloadPdf
            ? result.secure_url.replace(
                "/upload/",
                "/upload/fl_attachment:false/"
              )
            : result.secure_url;
          console.log(`Uploaded to Cloudinary: ${viewableUrl}`);
          resolve({ ...result, viewableUrl });
        }
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  // ------------------- Processing Signed PDF Logic -------------------
  async function processSignedDocument(signatureRequestId) {
    try {
      const doc = await SignatureRequest.findOne({
        documentId: signatureRequestId,
      });
      if (!doc || doc.status === "signed") return;

      console.log(`Processing signed document: ${signatureRequestId}`);

      const accessToken = await skribble.getAccessToken();

      // Get signature request info --> real document_id
      const srResponse = await axios.get(
        `${skribble.config.baseUrl}/v2/signature-requests/${signatureRequestId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "CompanioxApp/1.0",
          },
        }
      );

      const documentId = srResponse.data.document_id;
      if (!documentId) throw new Error("No document_id found for this request");

      // Download PDF binary directly
      const pdfResponse = await fetch(
        `${skribble.config.baseUrl}/v2/documents/${documentId}/content`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "CompanioxApp/1.0",
          },
        }
      );

      if (!pdfResponse.ok)
        throw new Error(`Failed to download PDF: ${pdfResponse.status}`);

      const signedPdf = Buffer.from(await pdfResponse.arrayBuffer());

      // Upload directly to Cloudinary
      const uploadRes = await uploadBufferToCloudinary(
        signedPdf,
        signatureRequestId
      );

      // Update DB
      doc.status = "signed";
      doc.signedAt = new Date();
      doc.pdfPath = uploadRes.viewableUrl;
      await doc.save();

      console.log(`Uploaded & saved document: ${uploadRes.viewableUrl}`);
    } catch (err) {
      console.error(`Error processing ${signatureRequestId}:`, err.message);
    }
  }

  // ------------------- API Routes -------------------
  app.get("/", (_, res) =>
    res.json({ success: true, message: "Server is running" })
  );

  app.get("/ping", (_, res) => res.json({ pong: true }));

  // get all documents in db
  app.get("/api/get-all-documents", async (req, res) => {
    try {
      const allRequests = await SignatureRequest.find();
      res.json({ success: true, data: allRequests });
    } catch (err) {
      console.error("Error fetching signing requests:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // save documents
  app.post("/api/signing-request", async (req, res) => {
    try {
      const {
        userName,
        userEmail,
        sessionId,
        applicationDocumentId,
        signingUrl,
        isNewToSwitzerland,
        documentType,
      } = req.body;

      if (
        !userName ||
        !userEmail ||
        !sessionId ||
        !applicationDocumentId ||
        !signingUrl
      )
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields" });

      const record = new SignatureRequest({
        userName,
        userEmail,
        sessionId,
        documentId: applicationDocumentId,
        signingUrl,
        isNewToSwitzerland,
        documentType,
      });
      await record.save();
      console.log(`Saved signing request: ${record.documentId}`);
      res.status(201).json({ success: true, data: record });
    } catch (err) {
      console.error("Error saving signing request:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------- Webhook -------------------
  app.post("/api/skribble/webhook", async (req, res) => {
    try {
      const payload = req.body;
      const result = await skribble.handleWebhook(payload);
      if (result.processed && result.documentId) {
        await processSignedDocument(result.documentId);
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------- Polling -------------------
  async function checkPendingDocuments() {
    const pendingDocs = await SignatureRequest.find({
      status: { $in: ["pending", "opened"] },
    });
    if (!pendingDocs.length) return;

    console.log(`Checking ${pendingDocs.length} pending documents...`);
    for (const doc of pendingDocs) {
      if (activeChecks.has(doc.documentId)) continue;
      activeChecks.add(doc.documentId);

      queue.add(async () => {
        try {
          const statusData = await skribble.getDocumentStatus(doc.documentId);
          const currentStatus =
            statusData?.status_overall?.toUpperCase?.() || "UNKNOWN";

          console.log(` ${doc.documentId}: ${currentStatus}`);

          if (["SIGNED", "COMPLETED", "DONE"].includes(currentStatus)) {
            await processSignedDocument(doc.documentId);
          } else if (currentStatus === "OPEN" && doc.status !== "opened") {
            doc.status = "opened";
            await doc.save();
          } else if (["CANCELLED", "DECLINED"].includes(currentStatus)) {
            doc.status = "cancelled";
            await doc.save();
          }
        } catch (err) {
          console.error(`Error checking ${doc.documentId}:`, err.message);
        } finally {
          activeChecks.delete(doc.documentId);
        }
      });
    }
  }

  setInterval(checkPendingDocuments, LOOP_TIME);

  // Watch DB for new docs
  SignatureRequest.watch().on("change", async (change) => {
    if (change.operationType === "insert") {
      console.log(`New request detected: ${change.fullDocument.documentId}`);
      await checkPendingDocuments();
    }
  });

  // ------------------- Start -------------------
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer().catch((err) => console.error("Startup error:", err));
