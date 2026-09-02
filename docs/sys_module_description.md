**ePropView System (WITH AR + AI)**

**1. Core System Modules**

**1.1 User Management**

-   login / logout

-   role-based access

    -   inspector

    -   engineer

    -   admin

-   profile management

**1.2 Inspection Module**

-   create inspection record

-   select building

-   select floor

-   select structural element

-   upload image

-   capture AR scan

-   submit inspection

**1.3 Location Module**

**GPS-based**

-   latitude

-   longitude

-   timestamp

**Manual mapping**

-   map pin placement

-   floor selection

-   zone tagging

**Hybrid**

-   GPS + manual correction

**1.4 Image Module**

-   image upload

-   EXIF extraction

-   image compression

-   image linking to records

-   storage management

**2. AI MODULE (CORE FEATURE)**

**2.1 Damage Detection (Computer Vision)**

-   crack detection

-   corrosion detection

-   spalling detection

-   deformation detection

-   leakage detection

Tools:

-   TensorFlow

-   PyTorch

-   OpenCV preprocessing

**2.2 Severity Classification (AI-based)**

-   input: image features

-   output:

    -   low

    -   medium

    -   high

    -   critical

-   confidence score (%)

**2.3 Object Detection**

-   bounding boxes on:

    -   cracks

    -   rust areas

    -   structural defects

**2.4 AI Output Data**

-   damage type prediction

-   severity score (0--100)

-   confidence level

-   detected region coordinates

**3. AR MODULE (CORE FEATURE)**

**3.1 AR Inspection Mode**

-   live camera view

-   real-world structure detection

-   surface tracking (walls, beams, columns)

**3.2 AR + AI Fusion**

-   AI detects damage from camera feed

-   AR overlays results in real time:

    -   "crack detected"

    -   severity label

    -   risk color (green/yellow/red)

**3.3 AR Anchoring**

-   attach AI results to physical structure

-   persistent markers in real space

-   revisit same damage location later

**3.4 Indoor Mapping (AR SLAM)**

-   visual-inertial tracking

-   spatial mapping

-   relative positioning in building

Tools:

-   ARCore

-   ARKit

-   Unity

**4. Damage Scoring System**

**4.1 AI Score**

-   model output probability

-   severity prediction

-   damage type classification

**4.2 Final Score Calculation**

-   AI severity score

-   structural importance multiplier

-   exposure factor

-   location risk factor

final score = weighted combination

**5. Maintenance Prioritization Module**

-   input:

    -   AI severity score

    -   structural importance

    -   geohazard risk

    -   AR location tag

-   output:

    -   priority level:

        -   low

        -   medium

        -   high

        -   urgent

-   sorted maintenance queue

**6. Geohazard Risk Module**

-   fault line datasets

-   flood zone maps

-   soil composition data

-   landslide risk zones

output:

-   site risk score

-   risk category

**7. Mapping Module**

-   interactive GIS map

-   AI + AR damage points

-   clustering of defects

-   heatmaps

tools:

-   Google Maps

-   Leaflet

**8. Dashboard Module**

-   total inspections

-   AI-detected damage summary

-   severity distribution

-   building health index

-   maintenance backlog

-   AR-tagged structure view

visuals:

-   bar charts

-   pie charts

-   heatmaps

-   trend graphs

**9. Report Generation Module**

-   inspection report

-   AI results included:

    -   detected damage

    -   severity scores

    -   confidence levels

-   AR snapshots included

-   export PDF

-   archive storage

**10. Data Storage Module**

-   inspection records

-   AI results

-   AR anchor data

-   images

-   reports

-   building data

-   maintenance logs

database:

-   PostgreSQL / MySQL

-   image storage: cloud (S3 or similar)

**11. System Workflow**

**11.1 Inspection Flow**

-   login

-   select building

-   start AR camera

-   AI detects damage in real time

-   user confirms detection

-   save AR anchor

-   store image + AI output

**11.2 AI Processing Flow**

-   image input

-   preprocessing

-   model inference

-   damage classification

-   severity scoring

-   store results

**11.3 AR Visualization Flow**

-   load AI results

-   overlay on live camera

-   anchor in physical space

-   allow user verification

**11.4 Mapping Flow**

-   retrieve all records

-   plot AI + AR + GPS data

-   generate heatmaps

-   filter by severity

**11.5 Maintenance Flow**

-   compute priority score

-   rank all issues

-   assign maintenance tasks

-   update status

**11.6 Reporting Flow**

-   compile AI + AR + manual data

-   generate structured report

-   export PDF

**12. System Architecture Type**

-   AI-powered structural damage detection system

-   AR-assisted inspection platform

-   GIS-based mapping system

-   predictive maintenance prioritization system

-   web + mobile hybrid system

**13. Key Strengths of This Version**

-   automated damage detection (AI)

-   real-world spatial tagging (AR)

-   precise mapping (GIS)

-   maintenance decision support

-   real-time inspection capability

**14. Key Limitations**

-   requires training dataset for AI

-   AR performance depends on device

-   indoor GPS still weak

-   model accuracy depends on data quality

-   **high system complexity**

---

**15. Production Extensions & Roadmap Implementation (Phases A–E)**

**15.1 Phase A: Real-Time AI Damage Detection Pipeline**
-   Aspect-ratio-preserving letterbox transformations (standard 640x640 tensor input).
-   Image preprocessing with luminance stretching and adaptive crack contrast enhancement.
-   Non-Maximum Suppression (NMS) with configurable IoU thresholds (0.45 default).
-   Calibrated structural severity scoring combining defect classification, normalized area, and model confidence.
-   AI Model Registry v2 tracking network architecture (`yolov8`, `resnet50`), input tensor dimensions, confidence/IoU thresholds, and preprocessing configurations.

**15.2 Phase B: Native ARKit / ARCore Mobile Bridge**
-   Native Capacitor plugin architecture for iOS (`ARKit`) and Android (`ARCore`).
-   Bidirectional event bridge dispatching plane detection, tracking state changes, anchor placements, and camera poses.
-   Automatic fallback to WebXR and simulated viewport HUD in desktop browsers.
-   In-situ optical defect tagging and camera snapshot frame capture.

**15.3 Phase C: Building Master Data Hierarchy**
-   Multi-structure support per project via `buildings` master entities with geolocation and structural codes.
-   Vertical level modeling via `floors` table with interactive elevation ordering.
-   Structural element catalog (`structural_elements`) categorized by member type (`beam`, `column`, `slab`, `wall`, `foundation`, etc.).
-   Bulk schedule upload via CSV parsing.
-   Cascading hierarchical selectors integrated into the field inspection registration workflow.

**15.4 Phase D: Geohazard Layer Management (GIS)**
-   Multi-format GIS dataset importer supporting GeoJSON FeatureCollections and ESRI Shapefiles (`.shp`).
-   LineString rendering for seismic fault lines alongside polygonal hazard zones.
-   Layer visibility toggles and active status filtering in Mapbox visualizations.
-   Automated environmental risk engine calculating fault line proximity and liquefaction scores from active GIS geometry intersections.

**15.5 Phase E: Object Storage Lifecycle & S3/Storj Management**
-   Unified storage telemetry and audit tracking across `inspection-images`, `ai-models`, and `reports-archive`.
-   Multi-tier storage class support (`standard`, `cold`, `glacier`, `archive`).
-   Automated 1-year archival lifecycle execution transitioning aged inspection assets.
-   Orphaned asset detection cross-referencing cloud storage objects with database records.

