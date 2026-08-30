# 2026W1-Arkhive

An intelligent document processing application that converts photos of documents, receipts, forms, and tables into structured, exportable data. Users upload document images, extracted text/tables are processed via Optical Character Recognition (OCR), and an integrated Large Language Model (Google Gemini) enables real-time verification and refinement via interactive chat.

---

## 📋 Requirements & Prerequisites

### System Requirements
* **Operating System:** Windows 10/11, macOS 12+, or Linux (Ubuntu 20.04+)
* **Hardware:** Minimum 4GB RAM, 2GHz Dual-Core CPU (No dedicated GPU required)

### Dependencies
Ensure the following software components are installed on your environment before proceeding:
* **Node.js:** `v20.19.0` or higher
* **Package Manager:** `npm` (v10.0.0+)
* **Cloud Credentials:** 
  * Microsoft Azure Account with **Azure Document Intelligence** enabled
  * Google AI Studio **Gemini API Key**

---

## 🛠️ Tech Stack

* **Frontend:** React.js, Tailwind CSS
* **Backend:** Node.js, TypeScript
* **OCR Engine:** Azure Document Intelligence
* **LLM Engine:** Google Gemini API
* **Testing:** Vitest
* **Storage / Persistence:** Memory-only (Session-based, no persistent database)

---

## ✨ Features
Key features as per project requirements are as follows:
- Image upload interface supporting JPG, PNG, HEIC, HEIF formats with 10MB file size limit
- Client-side image preview before processing
- OCR text extraction engine with confidence scoring display
- Table detection and structure extraction identifying rows and columns
- Display extracted raw text and structured tables in readable format
- Session-based conversation without persistent storage
- AI chat interface where AI asks users questions to ensure the AI understands extracted data correctly (e.g., AI: "What are the columns?" – User:"The columns are X,Y,Z".)
- Side-by-side view showing original image and extracted data simultaneously
- Data export to:
    - CSV format with column headers
    - Raw text export as TXT file download
- Loading states during OCR processing and error handling for failed uploads

---

## 🚀 Installation & Setup Guide

### 1. Repository Setup
```bash
git clone https://github.com/your-org/2026W1-Arkhive.git
cd 2026W1-Arkhive
```

### 2. Backend Setup
1. Navigate to the backend directory:
```bash
cd backend
```
2. Install dependencies:
```bash
npm install
```
3. Configure environment variables:
Create a `.env` file in the `backend` directory and add your API keys and endpoints:
```env
GEMINI_API_KEY=your_gemini_api_key_here
AZURE_CLOUD_API_KEY=your_azure_api_key_here
endpoint=your_azure_endpoint_url_here
```
*(Note: Azure Document Intelligence requires setting your specific API key and endpoint URL).*

### 3. Frontend Setup
1. Open a new terminal and navigate to the frontend directory from the project root:
```bash
cd frontend
```
2. Install dependencies:
```bash
npm install
```

---

## 📖 Usage

### Running the Application

**1. Start the Backend Server**
From the `backend` directory, run:
```bash
npm run dev
```
*(The server will start using `tsx` in watch mode)*

**2. Start the Frontend Development Server**
From the `frontend` directory, run:
```bash
npm run dev
```
*(This will start the Vite server. Open the provided localhost URL in your browser to view the app)*

---

### Using the Application

1. **Upload a Document:** Open the web app and upload an image (JPG, PNG, HEIC, or HEIF) up to 10MB. You'll see a side-by-side preview.
2. **Review Extraction:** The system automatically runs OCR and table detection. Review the extracted raw text, structured tables, and confidence scores.
3. **Verify & Refine with AI:** Use the built-in chat interface to interact with Google Gemini. You can ask it to format data, verify columns, or extract specific information (e.g., *"What are the column headers?"* or *"Format the totals as currency"*).
4. **Export Data:** Once you're satisfied with the results, download the extracted text as a `.TXT` file or the structured tables as a `.CSV` file.

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

*This README was developed with assistance from Google Gemini.*
