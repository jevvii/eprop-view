"""
Seed script — creates a complete dummy project for EPROPVIEW demonstration.
Run from the backend/ directory:  python seed.py
"""
import os, sys, django
from datetime import date

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "epropview.settings")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.contrib.auth.models import User
from core.models import (
    Project, Inspection, Report,
    EnvironmentalRisk, RiskHotspot,
    MaintenancePriority, DamageTrend, GeospatialZone,
)

# ── Users ──────────────────────────────────────────────────────────────────────
admin_user = User.objects.get(username="admin")
inspector_user = User.objects.get(username="inspector")

# ── Project ────────────────────────────────────────────────────────────────────
project, created = Project.objects.get_or_create(
    name="West Valley Complex — Phase II",
    defaults=dict(
        location="Brgy. Tandang Sora, Quezon City, Metro Manila",
        description=(
            "A 12-story mixed-use commercial and residential complex situated within "
            "the high-risk seismic corridor of the West Valley Fault System. "
            "Phase II covers structural retrofitting, soil stabilization, and full "
            "environmental risk mitigation under DPWH seismic design standards."
        ),
        status="active",
        latitude=14.6760,
        longitude=121.0437,
        created_by=admin_user,
    ),
)
print(f"{'Created' if created else 'Found'} project: {project.name}")

# ── Environmental Risk ─────────────────────────────────────────────────────────
env, _ = EnvironmentalRisk.objects.get_or_create(
    project=project,
    defaults=dict(
        fault_line_proximity="very_high",
        soil_liquefaction_risk="zone_a",
        erosion_potential="moderate",
        overall_risk_score=8.7,
        additional_analysis=(
            "Site lies within 200 m of the West Valley Fault trace. "
            "Geotechnical borings confirm liquefiable sand layers at 3–8 m depth. "
            "Immediate pile reinforcement and ground improvement recommended."
        ),
    ),
)
print("Environmental risk record ready.")

# ── Inspections ────────────────────────────────────────────────────────────────
inspections_data = [
    dict(
        inspection_date=date(2026, 1, 15),
        status="completed",
        risk_score=8.5,
        location="Full building — all floors",
        notes=(
            "Initial post-holiday inspection. Critical spalling observed on Column C-7 "
            "(3F). Foundation subsidence markers show 12 mm differential settlement "
            "along the east wing since last quarter. Fault proximity confirmed critical."
        ),
        lead_inspector=inspector_user,
    ),
    dict(
        inspection_date=date(2026, 3, 10),
        status="completed",
        risk_score=7.2,
        location="Basement and ground floor",
        notes=(
            "Follow-up inspection post-retrofitting works on columns B-5 to B-9. "
            "Settlement has stabilized at 14 mm. Minor hairline cracks on east wing "
            "exterior facade. Overall structural risk reduced from critical to high."
        ),
        lead_inspector=inspector_user,
    ),
    dict(
        inspection_date=date(2026, 4, 28),
        status="requires_followup",
        risk_score=6.8,
        location="Roof deck and mechanical floor (11F–12F)",
        notes=(
            "Roof membrane showing signs of delamination near drainage outlets. "
            "Water ingress detected at mechanical floor slab. Risk of corrosion "
            "accelerating reinforcement degradation. Requires immediate waterproofing."
        ),
        lead_inspector=inspector_user,
    ),
]

inspection_objs = []
for d in inspections_data:
    obj, c = Inspection.objects.get_or_create(
        project=project,
        inspection_date=d["inspection_date"],
        defaults=d,
    )
    inspection_objs.append(obj)
    print(f"  Inspection {obj.inspection_date}: {obj.risk_level} (score {obj.risk_score})")

# ── Reports ────────────────────────────────────────────────────────────────────
reports_data = [
    dict(
        report_id="RPT-001",
        title="Q1 Structural Risk Assessment",
        date=date(2026, 1, 20),
        location="Columns C-7, Foundation East Wing",
        status="critical",
        risk_score=8.5,
        inspection=inspection_objs[0],
        lead_inspector=inspector_user,
        key_findings=(
            "Critical spalling on Column C-7 (3F) exposing rebar. "
            "12 mm differential settlement exceeds NSCP allowable limit of 10 mm. "
            "Immediate shoring and column jacket installation required. "
            "Estimated repair cost: PHP 2.4M. Occupancy restriction advised for 3F east zone."
        ),
    ),
    dict(
        report_id="RPT-002",
        title="Soil Liquefaction Impact Study",
        date=date(2026, 2, 15),
        location="Site perimeter — geotechnical zones A & B",
        status="in_review",
        risk_score=7.8,
        inspection=inspection_objs[0],
        lead_inspector=admin_user,
        key_findings=(
            "Geotechnical borings (BH-1 to BH-6) confirm liquefiable sand layers "
            "at 3–8 m depth with SPT-N values < 10. "
            "Zone A (north quadrant) classified as highest liquefaction susceptibility. "
            "Ground improvement via jet grouting recommended before next rainy season."
        ),
    ),
    dict(
        report_id="RPT-003",
        title="Foundation Integrity Report — March",
        date=date(2026, 3, 25),
        location="Basement foundation mat, pile caps B1–B24",
        status="open",
        risk_score=6.8,
        inspection=inspection_objs[1],
        lead_inspector=inspector_user,
        key_findings=(
            "Settlement has stabilized following column retrofitting. "
            "Pile cap B-14 shows minor cracking at pile-cap interface. "
            "Crack widths within 0.3 mm limit per ACI 318. "
            "Monitoring pins installed; re-inspection scheduled for June 2026."
        ),
    ),
    dict(
        report_id="RPT-004",
        title="Q1 Environmental Risk Summary",
        date=date(2026, 4, 5),
        location="Full site",
        status="completed",
        risk_score=5.5,
        inspection=inspection_objs[1],
        lead_inspector=admin_user,
        key_findings=(
            "Quarterly environmental review completed. Fault line proximity remains "
            "very high with no change in seismic activity. Erosion along north perimeter "
            "retaining wall mitigated by drainage channel installation. "
            "Overall site risk score improved from 8.7 to 7.1 following Q1 interventions."
        ),
    ),
]

for d in reports_data:
    obj, c = Report.objects.get_or_create(report_id=d["report_id"], defaults={**d, "project": project})
    print(f"  Report {obj.report_id}: {obj.title} [{obj.status}]")

# ── Risk Hotspots ──────────────────────────────────────────────────────────────
hotspots_data = [
    dict(title="Column C-7 Spalling (3F)",        severity="critical", position_x=68, position_y=28,
         description="Exposed rebar due to concrete spalling. Load-bearing column. Immediate shoring required."),
    dict(title="Foundation Subsidence — East Wing", severity="critical", position_x=78, position_y=58,
         description="14 mm differential settlement exceeding NSCP limits. Monitoring pins installed."),
    dict(title="Hairline Cracks — East Facade",    severity="moderate", position_x=85, position_y=42,
         description="Series of hairline cracks (0.1–0.3 mm) on exterior facade. Non-structural but indicative of movement."),
    dict(title="Roof Membrane Delamination",        severity="moderate", position_x=45, position_y=15,
         description="Roof waterproofing membrane delaminating near drainage outlets at 11F. Risk of water ingress."),
    dict(title="Stairwell B Minor Efflorescence",   severity="low",      position_x=30, position_y=65,
         description="Efflorescence on stairwell B walls. Indicates minor moisture penetration. Monitor quarterly."),
]

for d in hotspots_data:
    RiskHotspot.objects.get_or_create(project=project, title=d["title"], defaults=d)
    print(f"  Hotspot: {d['title']} [{d['severity']}]")

# ── Maintenance Priorities ─────────────────────────────────────────────────────
maintenance_data = [
    dict(title="Emergency Column C-7 Jacket Installation", location="3rd Floor, Column C-7",
         risk_score=9.2, status="in_progress", assigned_to=inspector_user,
         due_date=date(2026, 5, 20),
         notes="Install reinforced concrete jacket around Column C-7. Works ongoing."),
    dict(title="Jet Grouting — Zone A Ground Improvement", location="North quadrant, basement level",
         risk_score=8.1, status="pending", assigned_to=None,
         due_date=date(2026, 6, 30),
         notes="Ground improvement required before rainy season to mitigate liquefaction risk."),
    dict(title="Roof Waterproofing Membrane Replacement",  location="Roof deck, 12F",
         risk_score=6.5, status="pending", assigned_to=inspector_user,
         due_date=date(2026, 5, 31),
         notes="Full membrane replacement at roof deck. Temporary patching applied."),
    dict(title="East Facade Crack Injection",              location="East exterior facade, 2F–6F",
         risk_score=5.3, status="pending", assigned_to=None,
         due_date=date(2026, 6, 15),
         notes="Epoxy injection grouting for hairline cracks on east facade."),
    dict(title="North Perimeter Drainage Channel Repair",  location="Site perimeter, north side",
         risk_score=4.0, status="completed", assigned_to=inspector_user,
         due_date=date(2026, 3, 31),
         notes="Drainage channel cleared and re-graded. Completed March 28, 2026."),
    dict(title="Stairwell B Damp-proofing",                location="Stairwell B, B1–4F",
         risk_score=2.8, status="pending", assigned_to=None,
         due_date=date(2026, 7, 15),
         notes="Apply crystalline waterproofing coat to stairwell B interior walls."),
]

for d in maintenance_data:
    MaintenancePriority.objects.get_or_create(project=project, title=d["title"], defaults=d)
    print(f"  Maintenance: {d['title']} [{d['status']}]")

# ── Damage Trends (monthly data for chart) ─────────────────────────────────────
trend_data = [
    # date,             severity,   value
    (date(2026, 1, 1),  "critical",  8.5),
    (date(2026, 1, 1),  "moderate",  5.2),
    (date(2026, 1, 1),  "low",       2.1),
    (date(2026, 2, 1),  "critical",  8.2),
    (date(2026, 2, 1),  "moderate",  5.0),
    (date(2026, 2, 1),  "low",       2.3),
    (date(2026, 3, 1),  "critical",  7.4),
    (date(2026, 3, 1),  "moderate",  4.8),
    (date(2026, 3, 1),  "low",       2.0),
    (date(2026, 4, 1),  "critical",  6.8),
    (date(2026, 4, 1),  "moderate",  4.5),
    (date(2026, 4, 1),  "low",       1.8),
    (date(2026, 5, 1),  "critical",  6.5),
    (date(2026, 5, 1),  "moderate",  4.2),
    (date(2026, 5, 1),  "low",       1.6),
]

for dt, severity, value in trend_data:
    DamageTrend.objects.get_or_create(
        project=project, date=dt, severity=severity,
        defaults=dict(value=value),
    )
print(f"  Damage trend data: {len(trend_data)} points loaded.")

# ── Geospatial Zones ───────────────────────────────────────────────────────────
zones_data = [
    dict(
        name="West Valley Fault Corridor",
        zone_type="fault_line",
        risk_level="zone_a",
        coordinates=[[121.040, 14.672], [121.044, 14.672], [121.044, 14.680],
                     [121.040, 14.680], [121.040, 14.672]],
        description="Active fault trace of the West Valley Fault. 500 m exclusion buffer applied.",
    ),
    dict(
        name="Soil Liquefaction Zone Alpha",
        zone_type="liquefaction",
        risk_level="zone_a",
        coordinates=[[121.041, 14.673], [121.046, 14.673], [121.046, 14.678],
                     [121.041, 14.678], [121.041, 14.673]],
        description="Highest susceptibility liquefaction zone. SPT-N < 10 at 3–8 m depth.",
    ),
    dict(
        name="Moderate Erosion Risk Belt",
        zone_type="erosion",
        risk_level="zone_b",
        coordinates=[[121.042, 14.674], [121.047, 14.674], [121.047, 14.679],
                     [121.042, 14.679], [121.042, 14.674]],
        description="Moderate erosion risk along northern site perimeter. Drainage improvement completed.",
    ),
]

for d in zones_data:
    GeospatialZone.objects.get_or_create(project=project, name=d["name"], defaults=d)
    print(f"  Zone: {d['name']} [{d['risk_level']}]")

print("\n" + "="*60)
print("Seed complete! Demo data summary:")
print(f"  Project    : {project.name}")
print(f"  Inspections: {project.inspections.count()}")
print(f"  Reports    : {project.reports.count()}")
print(f"  Hotspots   : {project.hotspots.count()}")
print(f"  Maintenance: {project.maintenance_priorities.count()}")
print(f"  Trend pts  : {project.damage_trends.count()}")
print(f"  Geo zones  : {project.geospatial_zones.count()}")
print("="*60)
print("\nLogin at http://127.0.0.1:8000")
print("  admin      / admin123")
print("  inspector  / inspect2024")
