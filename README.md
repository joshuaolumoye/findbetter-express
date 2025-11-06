# Skribble Webhook & Document Processor

This Node.js server handles Skribble signature requests, stores them in MongoDB, and uploads signed PDFs to Cloudinary.

---

## Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Create a .env file in the root directory:**
PORT=3001
MONGO_URI=<your-mongodb-connection-string>
CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
SKRIBBLE_API_KEY=<your-skribble-api-key>
SKRIBBLE_DOWNLOAD=true
POLL_INTERVAL_MIN=5


3. **Start the server:**
npm run dev

## API ENDPOINT
To Get All Documents

**Endpoint:** GET {baseUrl}/api/get-all-documents

[Response]

{
  "success": true,
  "data": [
    {
      "_id": "64ff7a...",
      "userName": "John Doe",
      "userEmail": "john@example.com",
      "documentId": "doc123",
      "signingUrl": "https://sign.skribble.com/...",
      "status": "pending",
      "pdfPath": "https://res.cloudinary.com/...",
      "createdAt": "2025-11-06T00:00:00.000Z",
      "updatedAt": "2025-11-06T00:05:00.000Z"
    }
  ]
}



