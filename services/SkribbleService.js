// services/SkribbleService.js
const axios = require("axios");

class SkribbleService {
  constructor(config) {
    this.config = config;
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  // ------------------- Authentication -------------------
  async login() {
    const { username, apiKey, baseUrl } = this.config;
    try {
      const res = await axios.post(
        `${baseUrl}/v2/access/login`,
        { username, "api-key": apiKey },
        { headers: { "Content-Type": "application/json" }, responseType: "text" }
      );
      this.accessToken = res.data.trim();
      this.tokenExpiry = Date.now() + 18 * 60 * 1000; // 18min token life
      return this.accessToken;
    } catch (err) {
      throw new Error(`Skribble login error: ${err.message}`);
    }
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
    return await this.login();
  }

  // ------------------- Get Document Status -------------------
  async getDocumentStatus(documentId) {
    const token = await this.getAccessToken();
    try {
      const res = await axios.get(
        `${this.config.baseUrl}/v2/signature-requests/${documentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    } catch (err) {
      if (err.response?.status === 404) {
        const fallback = await axios.get(
          `${this.config.baseUrl}/v2/documents/${documentId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return fallback.data;
      }
      throw new Error(`Failed to fetch document status: ${err.message}`);
    }
  }


  // ------------------- Webhook Handler -------------------
  async handleWebhook(payload) {
    const eventType = payload.event_type;
    const signatureRequestId = payload.signature_request?.id;
    if (eventType === "signature_request.completed" && signatureRequestId) {
      const token = await this.getAccessToken();
      const srRes = await axios.get(
        `${this.config.baseUrl}/v2/signature-requests/${signatureRequestId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return {
        processed: true,
        documentId: srRes.data.document_id,
        action: eventType,
      };
    }
    return { processed: true, action: eventType };
  }
}

const getSkribbleConfig = () => {
  const config = {
    apiKey: process.env.SKRIBBLE_API_KEY,
    username: process.env.SKRIBBLE_USERNAME,
    baseUrl: process.env.SKRIBBLE_BASE_URL || "https://api.skribble.com",
    environment: process.env.SKRIBBLE_ENVIRONMENT || "sandbox",
  };
  if (!config.apiKey || !config.username)
    throw new Error("Missing Skribble credentials");
  return config;
};

module.exports = SkribbleService;
module.exports.getSkribbleConfig = getSkribbleConfig;
