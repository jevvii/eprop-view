# ePropView System (WITH AR + AI)
## Database Seeded User Accounts & Authentication Credentials

*Confidential Security Directory — For Development, Evaluation & Production Testing*

---

### 1. Seeded User Accounts & Credentials Matrix

The following active user accounts have been provisioned and seeded in the database to enable immediate testing and evaluation of all three core system roles:

| Personnel Name | Login Email | Initial Password | Role | Assigned Unit / Scope |
| :--- | :--- | :--- | :---: | :--- |
| **System Administrator** | `admin@eprop.local` | `AdminPassword123!` | `ADMIN` | Platform Governance, AI Model Deployment & IT Operations |
| **Engr. Sarah Jenkins, PE** | `engineer@eprop.local` | `EngineerPassword123!` | `ENGINEER` | Lead Structural Risk Assessment & Maintenance QA |
| **Engr. David Chen, SE** | `reviewer.engineer@eprop.local` | `EngineerPassword123!` | `ENGINEER` | Engineering Validation, Review & Report Certification |
| **Alex Rivera** | `inspector@eprop.local` | `InspectorPassword123!` | `INSPECTOR` | On-Site Field Inspections & AR Spatial Data Capture |

> [!NOTE]
> All passwords are case-sensitive and meet complexity standards. Users can authenticate directly on the login portal (`/login` or `/`).

---

### 2. Role Testing Guides & Scope Verification

#### 2.1 Admin Role (`admin@eprop.local`)
Logs in as the system governance administrator with full platform control:
* **User Management**: Navigate to Settings (`/settings`) to provision new accounts with custom roles (`Inspector`, `Engineer`, `Admin`) and manage account status.
* **AI Model Deployment**: View active/standby models, toggle checkpoints, or deploy new neural network weights in Settings.
* **Infrastructure & Storage**: Manage project master records, structural assets, GIS geohazard layers, and cloud S3 storage configurations.

#### 2.2 Engineer Role (`engineer@eprop.local` / `reviewer.engineer@eprop.local`)
Logs in as the structural domain expert responsible for analytical validation and maintenance dispatch:
* **AI Detection Validation**: In Document Vault (`/document`), review AI bounding boxes, adjust defect classification / severity ratings (0–100), and verify or reject false positives.
* **Maintenance Prioritization**: In Dashboard (`/dashboard`), view ranked maintenance queue, assign repair tasks to personnel, and set due dates.
* **Geohazard Analysis**: In Environmental View (`/environmental`), evaluate GIS fault line proximity, soil liquefaction zones, and erosion risk scores.
* **Certified Deliverables**: In Reports (`/reports`), compile multi-source data and generate, print, or export formal inspection logs.

#### 2.3 Inspector Role (`inspector@eprop.local`)
Logs in as the on-site field user equipped for mobile and AR data collection:
* **Field Ingestion**: In Document Vault (`/document`), register inspections by selecting Building, Floor level (Basement, Ground, 1–4+, Roof), and Structural Element (Beam, Column, Slab, Wall, Foundation, Façade, Roof).
* **AR + AI Capture**: In AR Mode (`/ar`), initiate live WebXR tracking, trigger real-time AI damage inference, and place persistent spatial SLAM anchors.
* **Record Submission**: Upload site photos, attach technical field notes, and submit inspection entries for engineering analysis.

---

### 3. System Access Endpoints

* **Web Portal URL**: `http://localhost:3000` (or production domain)
* **Backend Database**: `https://gpefqnezxdhxrmwdbkdh.supabase.co`
* **Word Document Specification**: [`docs/user_credentials.docx`](file:///home/javvii/FreelanceProject/Project5/EPROPVIEW/docs/user_credentials.docx)
