# SignatureFlow Final Project Report

## 1. Executive Summary

SignatureFlow is a full-stack digital document signing platform designed for secure, auditable, multi-party PDF signing workflows.

The project delivers:
- Owner-side document upload, signer configuration, and manual field placement
- Public signer access through secure tokenized links
- OTP-based signer verification before signing
- Multi-signer sequential signing orchestration
- Signed PDF output generation with embedded signature and text fields
- Audit logging for traceability and compliance support
- Optional AI-assisted document analysis

Current state: production-ready handoff with manual drag-and-drop field placement, stable signing workflows, and complete documentation.

## 2. Business Problem and Solution

### Problem
Organizations need legally reliable, user-friendly electronic signing without complex enterprise software overhead.

Typical pain points:
- Manual back-and-forth for signatures
- No clear signer progression visibility
- Weak auditability
- Inconsistent signature capture and document finalization

### Solution
SignatureFlow provides a guided signing pipeline:
1. Owner uploads PDF
2. Owner manually places signing fields (no auto field injection)
3. Owner generates secure signing links
4. Signers verify identity via OTP
5. Signers fill assigned fields and sign
6. Platform embeds signatures and text fields into signed PDF
7. Owner downloads final file with complete audit history

## 3. Product Scope and Core Modules

The system consists of two core applications:

1. Client application
- React + TypeScript frontend
- Dashboard, document editor, public signing UI

2. Server application
- Node.js + Express API
- MongoDB persistence and PDF processing services

## 4. Detailed Tech Stack

### 4.1 Frontend Stack

1. React 18
- Component-driven UI architecture
- Hooks for state and lifecycle

2. TypeScript
- Strong typing across UI, API models, and data flow
- Reduced runtime errors via compile-time checks

3. Vite
- Fast development server and modern build pipeline
- Optimized production output

4. React Router
- Route-based navigation for dashboard and signer pages

5. Axios
- API communication layer with centralized service wrappers

6. Tailwind CSS
- Utility-first styling for responsive, consistent UI

7. Supporting libraries
- lucide-react for icons
- react-hot-toast for user feedback
- uuid for client-side field identity generation
- react-pdf and pdfjs-dist for PDF rendering support

### 4.2 Backend Stack

1. Node.js + Express
- REST API services
- Modular routes, controllers, and middleware layers

2. MongoDB + Mongoose
- Document-centric data modeling
- Flexible schema support for signer and field metadata

3. Authentication and security
- jsonwebtoken for access and refresh tokens
- bcryptjs for password hashing
- helmet for security headers
- express-rate-limit for brute-force and abuse mitigation
- cors for origin restriction controls

4. File handling and PDF processing
- multer for secure upload intake
- pdf-lib for server-side signed PDF generation
- pdf-parse utilities for analysis support

5. Messaging and verification
- nodemailer for signing and OTP emails
- Mock mode fallback when SMTP is not configured

6. AI integration
- @google/generative-ai for optional document analysis workflows

## 5. Architecture and Data Flow

### 5.1 High-Level Architecture

1. Browser client communicates with API via REST
2. API persists business objects in MongoDB
3. Uploaded and signed files are stored under server uploads path
4. Email provider sends signing links and OTP communications
5. Optional AI provider processes document analysis requests

### 5.2 Request Lifecycle

1. User action in UI triggers service request
2. Server middleware validates authentication and request boundaries
3. Controller applies business logic and validation
4. Model layer persists changes
5. Service layer performs external operations (email, PDF embedding)
6. API response updates frontend state and UI feedback

## 6. Feature-by-Feature Detailed Explanation

### 6.1 Authentication and Session Management

What it does:
- Supports user registration, login, token refresh, logout, and profile retrieval

How it works:
1. User registers with email and password
2. Password is hashed before persistence
3. Login returns access and refresh tokens
4. Protected routes validate access token
5. Refresh endpoint issues new access token when needed

Security controls:
- Short-lived access token
- Separate refresh token policy
- Password hashing via bcrypt

### 6.2 Dashboard and Document Management

What it does:
- Lists documents with status and tracking data
- Provides create, open, and delete operations

How it works:
1. Owner uploads a PDF
2. System stores document metadata and file reference
3. Dashboard fetches documents filtered by status
4. Document detail page shows signer progress and available actions

### 6.3 PDF Upload and Rendering

What it does:
- Handles secure PDF ingestion and browser preview

How it works:
1. Upload endpoint accepts multipart file payload
2. Server validates type and stores file
3. Frontend loads PDF for visual editing and review

### 6.4 Manual Field Placement Editor

What it does:
- Allows owner to drag and drop fields onto the PDF

Field types supported:
- signature
- initials
- stamp
- name
- date
- text

How it works:
1. Owner opens document editor
2. Owner chooses field type from panel
3. Field is placed on current page and can be repositioned
4. Owner configures field settings such as label and required flag
5. Owner saves field layout to server

Important final behavior:
- Fields are not auto-created on upload
- Owner controls placement manually

### 6.5 Signature Modal and Capture Methods

What it does:
- Captures signature content for signature-like fields

Modes:
- Typed signature
- Drawn signature
- Uploaded image
- Stamp upload handling

How it works:
1. User selects signature-capable field
2. Modal opens with capture options
3. Chosen artifact is stored in local state and submitted with field mapping

### 6.6 Signing Link Generation and Signer Assignment

What it does:
- Creates secure signer entry points and signer sequencing

How it works:
1. Owner submits signer list with order
2. Backend validates unique emails and signer completeness
3. Backend ensures manual field coverage rules are satisfied
4. Signing token is generated for the active signer
5. Email notification is sent to active signer

### 6.7 Public Signing Experience

What it does:
- Enables external signer completion without account login

How it works:
1. Signer opens tokenized URL
2. API resolves active signer context from token
3. UI displays only assigned fields for that signer order
4. Signer fills text-like fields and applies signature artifacts
5. Signer can sign or reject document

Validation behavior:
- Required fields must be completed
- Missing assigned signature fields are blocked

### 6.8 OTP Verification for Signers

What it does:
- Adds second-factor gate before sign action

How it works:
1. Signer requests OTP
2. OTP record is generated with expiry
3. Email sends OTP code
4. Signer submits OTP for verification
5. Verified state allows signing action

Fallback behavior:
- In development without SMTP, OTP emails are mocked in server logs

### 6.9 Multi-Signer Sequential Orchestration

What it does:
- Advances document to next signer after each successful sign

How it works:
1. Current signer submits signed payload
2. System marks signer as signed with timestamp and metadata
3. If next signer exists, new token is generated and issued
4. Document remains pending until final signer completes
5. Last signer completion sets document status to signed

### 6.10 Signed PDF Generation and Download

What it does:
- Produces final signed PDF containing all applied content

How it works:
1. Server loads source PDF (original or latest signed version)
2. Signature artifacts are embedded at assigned coordinates
3. Text-like field values (name, date, text) are embedded
4. Certification footer is added
5. New signed file is persisted and exposed for download

Result:
- Download endpoint returns signed file when available

### 6.11 Audit Logging

What it does:
- Records user and signer actions for traceability

Logged events include:
- document opened
- signing link generated
- signature placed
- document signed
- document rejected
- document downloaded

Metadata captured:
- actor identity details
- IP address
- user agent
- event-specific payload context

### 6.12 AI Document Analysis

What it does:
- Provides optional AI analysis endpoints for contract insight workflows

How it works:
1. Client submits analyze request
2. Server sanitizes and constrains input
3. AI provider generates analysis
4. Optional heuristic fallback can be enabled via env controls

## 7. Data Model Overview

### 7.1 Document Entity

Contains:
- title and file metadata
- owner reference
- status lifecycle: pending, signed, rejected, expired
- signers array for ordered signer workflow
- signatureFields array for layout and value metadata
- token and expiry tracking
- signed file path and completion timestamps

### 7.2 Signer Subdocument

Contains:
- signer identity (name and email)
- sequence order
- status and signed timestamp
- token and token expiry
- rejection details
- IP capture

### 7.3 Signature Field Structure

Contains:
- unique field id
- field type
- signerOrder assignment
- page and percentage-based coordinates
- dimensions
- required flag
- label and value (for text-like fields)

### 7.4 OTP Entity

Contains:
- token association
- email
- one-time code
- expiry timestamp
- verification flag

## 8. API Surface Summary

Auth routes:
- /api/auth/register
- /api/auth/login
- /api/auth/refresh
- /api/auth/logout
- /api/auth/profile

Document routes:
- /api/docs/upload
- /api/docs
- /api/docs/:id
- /api/docs/:id/signers
- /api/docs/:id/fields
- /api/docs/:id/signing-link
- /api/docs/:id/download
- /api/docs/:id

Signature routes:
- /api/signatures
- /api/signatures/:id
- /api/signatures/finalize

Audit route:
- /api/audit/:docId

Public routes:
- /api/public/sign/:token
- /api/public/otp/send
- /api/public/otp/verify

AI routes:
- /api/ai/analyze/:id
- /api/ai/analyze-public/:token

Health route:
- /api/health

## 9. Security and Compliance Posture

Implemented controls:
- JWT-based route protection for owner APIs
- Password hashing with bcrypt
- Helmet hardening
- CORS allowlist via CLIENT_URL
- OTP verification requirement for external signing
- Token expiry checks
- Audit trail with network metadata
- Controlled file upload and PDF generation lifecycle

## 10. Operational and Deployment Notes

Runtime defaults:
- Client on port 5173
- Server on port 5000

Required environment categories:
- Database
- JWT and session
- Client origin
- Email SMTP
- AI optional settings

Deployment patterns:
- Backend: Render or equivalent Node host
- Frontend: Vercel or equivalent static host
- Database: MongoDB Atlas

## 11. Known Constraints and Practical Considerations

1. File storage
- Uploaded and signed PDFs are local to server runtime by default
- Production should ensure persistent volume strategy

2. Historical documents
- Documents created before recent workflow changes may contain legacy field states

3. SMTP
- Production OTP email requires valid SMTP credentials

4. Browser rendering
- PDF rendering behavior depends on client browser capabilities and canvas performance

## 12. Validation and Stability Summary

The implementation has been validated through iterative functional checks on:
- Owner upload and edit workflow
- Manual field placement persistence
- Signing link generation logic
- OTP send and verify cycle
- Public signing and rejection flow
- Sequential signer advancement
- Final signed PDF generation and download output

## 13. Final Handoff Statement

SignatureFlow is delivered as a complete full-stack signing platform with secure signer verification, manual field placement controls, multi-signer orchestration, signed PDF output generation, and audit-ready activity tracking.

This report and the project README together form the final technical handoff package for maintenance, deployment, and future enhancements.
