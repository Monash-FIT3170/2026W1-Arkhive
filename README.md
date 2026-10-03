# 2026W1-Arkhive

An intelligent document processing application that converts photos of documents, receipts, forms, and tables into structured, exportable data. Users upload document images, extracted text/tables are processed via Optical Character Recognition (OCR), and an integrated Large Language Model (Google Gemini) enables real-time verification and refinement via interactive chat.

---

## 📋 Requirements & Prerequisites

### System Requirements

- **Operating System:** Windows 10/11, macOS 12+, or Linux (Ubuntu 20.04+)
- **Hardware:** Minimum 4GB RAM, 2GHz Dual-Core CPU (No dedicated GPU required)

### Dependencies & Cloud Accounts

Ensure the following software components and cloud service accounts are set up before proceeding:

- **Node.js:** `v20.19.0` or higher (`v22` recommended)
- **Package Manager:** `npm` (v10.0.0+)
- **Cloud Accounts & Credentials:**
  - **Supabase Account:** For User Authentication and PostgreSQL database.
  - **Cloudflare Account:** Cloudflare R2 object storage enabled (S3-compatible) for document page storage.
  - **Google AI Studio:** Gemini API Key for interactive chat and table refinement.
  - **Microsoft Azure Account:** Azure Document Intelligence resource (API key + endpoint).

---

## 🛠️ Tech Stack

- **Frontend:** React.js, TypeScript, Vite, Tailwind CSS, DaisyUI, Lucide Icons, PDF.js
- **Backend:** Node.js, Express, TypeScript, AWS SDK (S3 client for R2)
- **Database & Authentication:** Supabase (PostgreSQL with Row-Level Security, Supabase Auth)
- **Object Storage:** Cloudflare R2 (S3-compatible bucket with direct client-side presigned uploads)
- **OCR Engine:** Azure Document Intelligence
- **LLM Engine:** Google Gemini API
- **Testing:** Vitest, Testing Library, Supertest

---

## ✨ Features

- **Document Ingestion:** Multi-format file upload supporting JPG, PNG, HEIC, HEIF, and multi-page PDF files up to 10MB.
- **Client-Side Page Splitting:** In-browser PDF-to-image conversion and preview before uploading.
- **Direct Cloud Storage:** Secure, high-performance direct browser-to-R2 image uploads using presigned URLs.
- **Project & Document Management:** Persistent user workspaces with projects, documents, and individual page tracking.
- **Authentication & User Profiles:** Supabase Auth supporting Email/Password, Google OAuth, and isolated Guest mode.
- **Intelligent OCR & Table Extraction:** Extraction of raw text, tabular structures (rows/columns), and per-cell confidence scoring.
- **Interactive AI Chat:** Side-by-side verification allowing users to ask Google Gemini questions to refine columns, fix formatting, or extract specific metrics.
- **Reprocessing & Granular Control:** Re-run OCR on specific document pages without re-uploading.
- **Flexible Data Export:** Export verified data into CSV (with headers) or raw TXT formats.

---

## 🚀 Installation & Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/Monash-FIT3170/2026W1-Arkhive.git
cd 2026W1-Arkhive
```

---

### 2. External Services Setup

#### A. Supabase (Database & Auth)

1. **Create a Supabase Project:**
   - Sign in to Supabase and create a new project.
   - Note down your **Project URL**, **Anon (Public) Key**, and **Service Role (Secret) Key** from **Project Settings > API**.

2. **Apply Database Migrations:**
   Navigate to the **SQL Editor** in your Supabase project dashboard, open the following migration files in order, and run their SQL contents:
   1. `backend/supabase/migrations/20260908100628_create_projects_and_documents.sql` (creates `projects`, `documents` tables and RLS policies)
   2. `backend/supabase/migrations/20260911051055_create_document_pages.sql` (creates `document_pages` table and per-page tracking)

3. **Configure Authentication Redirects:**
   - In the Supabase Dashboard, go to **Authentication > URL Configuration**.
   - Set **Site URL** to:
     ```
     http://localhost:5173
     ```
   - Add to **Redirect URLs**:
     ```
     http://localhost:5173/**
     ```
   - _(Optional)_ To enable Google Login, configure the Google provider under **Authentication > Providers > Google** with your Google Cloud OAuth Client credentials.

---

#### B. Cloudflare R2 (Object Storage)

1. **Create an R2 Bucket:**
   - Go to the Cloudflare Dashboard > **R2 Object Storage**.
   - Click **Create bucket** and specify a bucket name (e.g. `arkhive-storage`).

2. **Generate API Tokens:**
   - In the R2 Overview, click **Manage R2 API Tokens** > **Create API Token**.
   - Set permissions to **Object Read & Write** and restrict to your bucket (or all buckets).
   - Note down the generated:
     - **Account ID** (visible on the R2 Overview page)
     - **Access Key ID**
     - **Secret Access Key**

3. **Configure Bucket CORS (Important!):**
   Because the frontend uploads page images directly to Cloudflare R2 presigned URLs from the browser, your bucket **must** have CORS enabled.
   - Go to your bucket > **Settings** > **CORS Policy** > **Edit CORS Policy**.
   - Paste the following JSON policy and save:
     ```json
     [
       {
         "AllowedOrigins": ["http://localhost:5173", "http://localhost:3000"],
         "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"],
         "AllowedHeaders": ["*"],
         "ExposeHeaders": ["ETag"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```

---

### 3. Backend Setup

1. **Navigate to the backend directory and install dependencies:**

   ```bash
   cd backend
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the `backend/` directory:

   Populate `backend/.env` with your credentials:

   ```env
   # LLM & OCR Service Credentials
   GEMINI_API_KEY=your_gemini_api_key_here
   AZURE_CLOUD_API_KEY=your_azure_api_key_here
   endpoint=your_azure_endpoint_url_here

   # Supabase Configuration (Backend uses the SERVICE_ROLE_KEY to bypass RLS for admin DB tasks)
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

   # Cloudflare R2 Credentials
   R2_ACCOUNT_ID=your_cloudflare_account_id_here
   R2_ACCESS_KEY_ID=your_r2_access_key_id_here
   R2_SECRET_ACCESS_KEY=your_r2_secret_access_key_here
   R2_BUCKET_NAME=your_r2_bucket_name_here
   ```

---

### 4. Frontend Setup

1. **Navigate to the frontend directory and install dependencies:**

   ```bash
   cd ../frontend
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the `frontend/` directory:

   Populate `frontend/.env` with your public Supabase credentials:

   ```env
   # Supabase Configuration
   # NOTE: Use the public anonymous (anon) key ONLY. Never put the service role key here.
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   ```

---

## 📖 Usage & Development

### Running the Application Locally

1. **Start the Backend Server:**
   From the `backend/` directory:

   ```bash
   npm run dev
   ```

   _(Server starts at `http://localhost:3000` with hot-reloading via `tsx`)_

2. **Start the Frontend Development Server:**
   From the `frontend/` directory in a new terminal:

   ```bash
   npm run dev
   ```

   _(Vite starts at `http://localhost:5173` and automatically proxies `/api` calls to port 3000)_

3. **Open the App:**
   Visit `http://localhost:5173` in your browser. You can sign up with email, sign in with Google, or click **Continue as Guest** to test the platform immediately.

---

### Running Tests & Verification

- **Backend Unit Tests:**
  ```bash
  cd backend && npm test
  ```
- **Backend Integration Tests:**
  ```bash
  cd backend && npm run test:integration
  ```
- **Frontend Tests:**
  ```bash
  cd frontend && npm test
  ```
- **Typechecking & Linting:**
  ```bash
  cd backend && npm run typecheck && npm run lint
  cd ../frontend && npm run build && npm run lint
  ```

---

### Using the Application Workflow

1. **Create or Open a Project:** Create a new project in the dashboard to organize your uploaded files.
2. **Upload Documents:** Upload single or multi-page documents (PDF, JPG, PNG, HEIC, HEIF up to 10MB). The frontend splits PDFs into individual page previews and uploads each page securely to Cloudflare R2.
3. **Run OCR & Table Extraction:** Select documents or specific pages and trigger processing. Review extracted tables alongside the original document in the side-by-side viewer.
4. **Interactive Verification & Chat:** Use Google Gemini in the verification chat to refine detected column headers, query specific rows, or correct formatting.
5. **Export:** Export finalized tabular data to `.CSV` or `.TXT`.

---

## 📄 License

This project is licensed under the [MIT License](https://opensource.org/license/MIT).

---

## 👥 Members

- Mubashar Ali Doostizadah - mubashardoostizadah@gmail.com
- Aryan Punekar - aryanpunekarwork@gmail.com
- Muhammad Mubashir Shah - 2004mubashir@gmail.com
- Ronak - tahronak2005@gmail.com
- Frank Fang Shi - frank2004au@gmail.com
- Harsha Vardhan Sharma - harsha.sharma2105@gmail.com
- Simon Katsiamakis - skatsi07@icloud.com
- Vanrick Nguyen - vanricknguyen@gmail.com
- Aryan Cyrus - Aryan.m10@yahoo.com
- Jasper Wan - jasperwan1508@gmail.com
- Lii Gang Hah - liiganghah24@gmail.com
- Gautam kumar - gautam.work.kumar@gmail.com
- Kanishk Srivastava - kanishk.srivastava4@gmail.com

---

## 🙌 Acknowledgements

_This README was developed with assistance from Google Gemini._
