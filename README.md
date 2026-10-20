# 2026W1-Arkhive

An intelligent document processing application that converts photos of documents, receipts, forms, and tables into structured, exportable data. Users upload document images, extracted text/tables are processed via Optical Character Recognition (OCR), and an integrated Large Language Model (Google Gemini) enables real-time verification and refinement via interactive chat.

---

## 📋 Requirements & Prerequisites

### System Requirements

- **Operating System:** Windows 10/11, macOS 12+, or Linux (Ubuntu 20.04+)
- **Hardware:** Minimum 4GB RAM, 2GHz Dual-Core CPU (No dedicated GPU required)

### Dependencies & Cloud Accounts

Ensure the following software components and cloud service accounts are set up before proceeding:

- **Node.js:** `v24` or higher
- **Package Manager:** `npm` (v10.0.0+)
- **Cloud Accounts & Credentials:**
  - **Supabase Account:** For User Authentication and PostgreSQL database.
  - **Cloudflare Account:** Cloudflare R2 object storage enabled (S3-compatible) for document page storage.
  - **Google AI Studio:** Gemini API Key for interactive chat and table refinement.
  - **Microsoft Azure Account:** Azure Document Intelligence resource (API key + endpoint).

---

## 🛠️ Tech Stack

- **Frontend:** React.js, TypeScript, Vite, Tailwind CSS, DaisyUI, Lucide Icons, PDF.js
- **Backend:** Node.js, Express, TypeScript, AWS SDK (S3 client for R2), OpenCV (`@techstark/opencv-js`), Sharp
- **Database & Authentication:** Supabase (PostgreSQL with Row-Level Security, Supabase Auth)
- **Object Storage:** Cloudflare R2 (S3-compatible bucket with direct client-side presigned uploads)
- **OCR Engine:** Azure Document Intelligence (`prebuilt-layout`) with OpenCV Unsharp Masking & Profile-Driven Extraction
- **LLM Engine:** Google Gemini Flash Lite (`gemini-flash-lite-latest` & `gemini-3.5-flash-lite`)
- **Testing:** Vitest, Testing Library, Supertest, Playwright (E2E), Husky

---

## ✨ Features

- **Document Ingestion:** Multi-format file upload supporting JPG, PNG, HEIC, HEIF, and multi-page PDF files up to 10MB.
- **Client-Side Page Splitting:** In-browser PDF-to-image conversion and preview before uploading.
- **Direct Cloud Storage:** Secure, high-performance direct browser-to-R2 image uploads using presigned URLs.
- **Project & Document Management:** Persistent user workspaces with projects, documents, and individual page tracking.
- **Authentication & User Profiles:** Supabase Auth supporting Email/Password, Google OAuth, and isolated Guest mode.
- **Intelligent Pre-OCR Filtering:** OpenCV-powered Unsharp Masking and grayscale noise reduction to crispen text strokes and table lines.
- **Profile-Driven OCR Pipeline:** Specialized profiles (`table`, `receipt`, `invoice`, `generic`) combining Azure Document Intelligence with Gemini Flash Lite for field extraction, floating tables, and parent-child row hierarchies.
- **Real-Time OCR Progress Tracking:** Background tracking across document pages with persistent toasts and status dialogs.
- **Interactive AI Chat:** Side-by-side verification allowing users to ask Google Gemini Flash Lite questions to refine columns, fix formatting, or resolve review queue issues.
- **Reprocessing & Granular Control:** Re-run OCR on specific document pages without re-uploading.
- **Modular Data Export:** Export verified data into CSV, formatted Excel (`.XLSX`), JSON, or raw TXT with customizable business templates.

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
   3. `backend/supabase/migrations/20260928093858_add_review_state.sql` (adds `review_state` JSONB column for validation issue tracking)
   4. `backend/supabase/migrations/20261004_add_quality_flags.sql` (adds `quality_flags` JSONB column for OpenCV/Sharp image quality warnings)

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

### 3. Root, Backend & Frontend Setup

1. **Install root developer tooling (Husky hooks, ESLint, Prettier):**

   ```bash
   npm install
   ```

2. **Install Backend dependencies and configure environment variables:**

   ```bash
   cd backend
   npm install
   ```

   Create a `.env` file in the `backend/` directory (refer to `.env.example` in the root directory) and populate it with your credentials (You may also use a secrets manager for this):

   ```env
   # LLM & OCR Service Credentials
   GEMINI_API_KEY=your_gemini_api_key_here
   AZURE_CLOUD_API_KEY=your_azure_api_key_here
   endpoint=your_azure_endpoint_url_here

   # Supabase Configuration (Backend uses the SERVICE_ROLE_KEY to bypass RLS for admin DB tasks)
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

   # Cookie signing. Required in production (the server will not start without it).
   # Local development can leave this unset and will use a built-in dev default.
   SESSION_SECRET=session_secret_here

   # Cloudflare R2 Credentials
   R2_ACCOUNT_ID=your_cloudflare_account_id_here
   R2_ACCESS_KEY_ID=your_r2_access_key_id_here
   R2_SECRET_ACCESS_KEY=your_r2_secret_access_key_here
   R2_BUCKET_NAME=your_r2_bucket_name_here
   ```

3. **Install Frontend dependencies and configure environment variables:**

   ```bash
   cd ../frontend
   npm install
   ```

   Create a `.env` file in the `frontend/` directory and populate it with your public Supabase credentials:

   ```env
   # Supabase Configuration
   # NOTE: Use the public anonymous (anon) key ONLY. Never put the service role key here.
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   ```

---

## 📖 Usage, Deployment & Development

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

### Production Deployment (Docker & Google Cloud Run)

Arkhive includes a multi-stage [`Dockerfile`](./Dockerfile) and Google Cloud Build configuration ([`cloudbuild.yaml`](./cloudbuild.yaml)) that compiles the React frontend into static assets served directly by the Express backend on port `3000`.

1. **Build and Run with Docker:**

   ```bash
   docker build \
     --build-arg VITE_SUPABASE_URL=https://your-project-ref.supabase.co \
     --build-arg VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here \
     -t arkhive:latest .

   docker run -p 3000:3000 --env-file backend/.env arkhive:latest
   ```

2. **Automated Cloud Deployment (Google Cloud Run):**
   - Triggered via Google Cloud Build using [`cloudbuild.yaml`](./cloudbuild.yaml).
   - Builds the production image with `_VITE_SUPABASE_URL` and `_VITE_SUPABASE_ANON_KEY` substitution variables, pushes `${_IMAGE}:${COMMIT_SHA}` to Google Container Registry / Artifact Registry, and deploys the service to Google Cloud Run (`gcloud run deploy`).

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
- **Frontend Unit Tests:**
  ```bash
  cd frontend && npm test
  ```
- **Frontend Integration Tests:**
  ```bash
  cd frontend && npm run test:integration
  ```
- **Frontend End-to-End Tests (Playwright):**
  ```bash
  cd frontend && npm run test:e2e
  ```
- **Typechecking & Linting:**
  ```bash
  cd backend && npm run typecheck && npm run lint
  cd ../frontend && npm run build && npm run lint
  ```

---

### Using the Application Workflow

1. **Create or Open a Project:** Create a new project in the dashboard to organize your uploaded files, or use **Guest Mode** / **Mobile QR Capture** for quick ephemeral sessions.
2. **Upload Documents:** Upload single or multi-page documents (PDF, JPG, PNG, HEIC, HEIF up to 10MB). The frontend splits PDFs into individual page previews, checks image quality (blur/glare/contrast), and uploads each page to Cloudflare R2 (or local session storage for guests).
3. **Run OCR & Table Extraction:** Select documents or specific pages and trigger processing. Review extracted tables and bounding boxes alongside the original document in the side-by-side viewer. Background progress is tracked in real-time across pages.
4. **Interactive Verification & Chat:** Use Google Gemini Flash Lite in the verification chat to refine detected column headers, query specific rows, or resolve low-confidence cells in the review queue.
5. **Export:** Export finalized tabular data to `.CSV`, `.XLSX`, `.JSON`, or `.TXT` using modular templates.

---

## 🏗️ System Architecture & Developer Onboarding

For an in-depth technical reference on how Arkhive is structured and how data flows across the system, see **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** and the companion system topology diagram (**[`ARCHITECTURE_DIAGRAM.mmd`](./ARCHITECTURE_DIAGRAM.mmd)** / **[`ARCHITECTURE_DIAGRAM.pdf`](./ARCHITECTURE_DIAGRAM.pdf)**).

New developers joining the project should review **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** for:

- **Repository Layout & Directory Roles:** Detailed breakdown of [`frontend/`](./frontend) (`pages`, `components`, `context`, `hooks`, `services/export`, `utils`, `models`, `e2e`) and [`backend/`](./backend) (`middleware`, `routes`, `controller`, `services/ocr/pipeline`, `services/llm`, `supabase/migrations`).
- **State Management & API Conventions:** How [`AuthProvider`](./frontend/src/context/AuthProvider.tsx) manages Supabase JWTs and Guest sessions, how [`OcrProgressProvider`](./frontend/src/context/OcrProgressProvider.tsx) coordinates background page tasks, how custom hooks (`useTableEditor`, `useUndoRedo`, `useReviewQueue`) manage local state, and how `frontend/src/services/` communicates with the Express backend.
- **Modular OCR & Computer Vision Pipeline:** How images are preprocessed via Sharp and OpenCV unsharp masking, analyzed via Azure Document Intelligence (`prebuilt-layout`), and structured using profile-driven extractors with **Google Gemini Flash Lite** (`gemini-flash-lite-latest` and `gemini-3.5-flash-lite`).
- **Dual Workflow Architecture:** Comparison between the **Authenticated Cloud Pipeline** (Supabase PostgreSQL with Row-Level Security + Cloudflare R2 persistent storage) and the **Ephemeral Guest & Mobile QR Pipeline** (`express-session` + temporary disk storage with automated 12-hour cleanup).
- **"Where Do I Put...?" Decision Matrix:** A practical cheat sheet in [Section 7 of `ARCHITECTURE.md`](./ARCHITECTURE.md#7-where-do-i-put-decision-matrix) answering where to add new API endpoints, UI screens, database migrations, document profiles, export formats/templates, OpenCV heuristics, and Gemini LLM tools.

---

## 🏷️ Versioning Strategy

Arkhive follows **[Semantic Versioning 2.0.0 (SemVer)](https://semver.org/)** for all releases, formatted as **`MAJOR.MINOR.PATCH`** (e.g., `v1.2.0`):

| Version Component     | Increment Trigger                                                                                                                 | Examples in Arkhive                                                                                                                                             |
| :-------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`MAJOR` (`X.0.0`)** | Incompatible REST API changes, breaking database schema alterations, or major architectural overhauls requiring manual migration. | Removing or renaming `/api/documents` endpoints, breaking changes to `TableData` JSON schemas stored in Supabase, or replacing core authentication providers.   |
| **`MINOR` (`0.X.0`)** | Backwards-compatible new features, endpoints, or user-facing workflows.                                                           | Adding mobile QR code upload, adding new export formats (e.g., Excel/JSON), introducing OpenCV quality heuristics, or adding new Gemini assistant capabilities. |
| **`PATCH` (`0.0.X`)** | Backwards-compatible bug fixes, security patches, performance optimizations, or documentation updates.                            | Fixing cell-editor text overlap, resolving APCA contrast ratios, updating dependencies flagged by Trivy security scans, or refining OCR prompt formatting.      |

### Release & Tagging Workflow

1. **Pre-Release Identifiers:** Major milestone drafts or staging builds undergoing User Acceptance Testing (UAT) on the `dev` branch may be suffixed with `-alpha.N`, `-beta.N`, or `-rc.N` (e.g., `v1.0.0-rc.1`).
2. **Version Synchronization:** Before cutting a release, version numbers in `backend/package.json` and `frontend/package.json` are bumped in lockstep using `npm version <major|minor|patch>`.
3. **Git Tagging & GitHub Releases:** Once a release PR from `dev` is merged into `main` and passes all CI checks, an annotated Git tag is created and pushed:
   ```bash
   git checkout main && git pull origin main
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```
   A corresponding GitHub Release is published summarizing new features, database migrations required, and bug fixes since the previous tag.

---

## 🔀 Pull Request (PR) Strategy & Contribution Guide

To maintain code quality, stability, and security across the full stack, all contributions must follow the branching and Pull Request workflow outlined below.

### 1. Branching Strategy

- **`main`:** Protected production branch containing stable, release-ready code. Direct pushes to `main` are prohibited; updates only occur via release PRs from `dev` or critical hotfix PRs.
- **`dev`:** Primary integration branch where completed features and bug fixes are merged and verified together.
- **Topic / Feature Branches:** All development work must take place on a dedicated branch created from the latest `dev` branch using descriptive naming prefixes:
  - `feat-<scope>-<short-description>` — New features (e.g., `feat-team2-phone-camera-QR-upload`, `feat-simon-column-rename`)
  - `fix--<short-description>` — Bug fixes (e.g., `fix--undo-redo-validation`, `fix--upload-security`)
  - `refactor-<scope>` — Code restructuring without changing external behavior
  - `docs-<scope>` — Documentation-only additions or updates

### 2. Commit Message Conventions

Follow the **[Conventional Commits](https://www.conventionalcommits.org/)** specification so git history remains readable and auditable:

- `feat: <description>` — Introduces a new feature
- `fix: <description>` — Patches a bug
- `refactor: <description>` — Refactors existing code
- `test: <description>` — Adds or updates unit/integration tests
- `docs: <description>` — Updates `README.md`, `ARCHITECTURE.md`, or inline docs
- `chore: <description>` — Updates build scripts, dependencies, or CI configuration

### 3. Local Pre-Push Verification

The repository uses **Husky** ([`.husky/pre-push`](./.husky/pre-push)) and **lint-staged** ([`package.json`](./package.json)) to enforce code formatting (Prettier) and quality checks locally before code reaches GitHub. Before opening a PR, ensure all checks pass locally:

1. **Frontend Lint, Typecheck, Build & Tests:**
   ```bash
   cd frontend
   npm run lint
   npm run build
   npm test
   npm run test:integration
   ```
2. **Backend Lint, Typecheck & Tests:**
   ```bash
   cd ../backend
   npm run lint
   npm run typecheck
   npm test
   npm run test:integration
   ```

### 4. Submitting a Pull Request

1. **Sync with `dev`:** Pull the latest changes from `origin/dev` into your feature branch and resolve any merge conflicts locally:
   ```bash
   git fetch origin
   git merge origin/dev
   ```
2. **Push Your Branch:**
   ```bash
   git push -u origin <your-branch-name>
   ```
3. **Open the Pull Request on GitHub:**
   - Set the **base branch** to `dev` (or `main` only for approved release/hotfix merges) and the **compare branch** to your feature branch.
   - Provide a clear title and include the following in the PR description:
     - **Summary of Changes:** What was added, modified, or fixed and why.
     - **Architecture / Database Impact:** Note any new environment variables added to `.env.example` or new SQL migrations added to `backend/supabase/migrations/`.
     - **Verification & Testing:** List new unit/integration tests added and manual verification steps performed (attach screenshots or screen recordings for UI changes).

### 5. CI Pipeline & Code Review Requirements

A Pull Request can only be merged once it satisfies **all** of the following criteria:

- **Automated CI Pipeline Passes ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)):**
  - `frontend-tests`: ESLint, TypeScript build check, and Vitest unit tests pass.
  - `backend-tests`: ESLint, `tsc --noEmit` typecheck, and Vitest unit tests pass.
  - `backend-integration-tests` & `frontend-integration-tests`: End-to-end API and component integration suites pass.
  - `docker-build`: Multi-stage Docker image builds cleanly and passes **Aquasecurity Trivy** container and filesystem vulnerability scans.
- **Peer Code Review:** At least **one approval** from another team member who did not author the PR, with all review comments and discussions resolved.
- **Clean Merge State:** The branch must be up-to-date with the target branch with zero merge conflicts before merging.

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
