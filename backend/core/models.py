from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator


class UserProfile(models.Model):
    """Extended profile for system users (inspectors, admins, etc.)."""
    ROLE_CHOICES = [
        ('admin', 'Administrator'),
        ('inspector', 'Lead Inspector'),
        ('analyst', 'Risk Analyst'),
        ('viewer', 'Viewer'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='viewer')
    phone = models.CharField(max_length=20, blank=True)
    department = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.get_role_display()})"


class Project(models.Model):
    """A property or site being monitored for environmental and structural risk."""
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('on_hold', 'On Hold'),
        ('cancelled', 'Cancelled'),
    ]

    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='created_projects'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class Inspection(models.Model):
    """A site inspection record capturing risk assessment details and findings."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('requires_followup', 'Requires Follow-up'),
    ]

    RISK_LEVEL_CHOICES = [
        ('low', 'Low'),
        ('moderate', 'Moderate'),
        ('high', 'High'),
        ('critical', 'Critical'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='inspections')
    lead_inspector = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='led_inspections'
    )
    inspection_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    risk_score = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(10.0)],
        help_text="Numeric risk score from 0.0 (no risk) to 10.0 (critical)."
    )
    risk_level = models.CharField(
        max_length=20, choices=RISK_LEVEL_CHOICES, blank=True, editable=False
    )
    location = models.CharField(max_length=255)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-inspection_date']

    def save(self, *args, **kwargs):
        if self.risk_score > 8.0:
            self.risk_level = 'critical'
        elif self.risk_score > 6.0:
            self.risk_level = 'high'
        elif self.risk_score >= 4.0:
            self.risk_level = 'moderate'
        else:
            self.risk_level = 'low'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Inspection #{self.pk} — {self.project.name} ({self.inspection_date})"


class InspectionImage(models.Model):
    """Photos attached to an inspection record."""
    inspection = models.ForeignKey(Inspection, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='inspection_images/%Y/%m/%d/')
    caption = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Image for Inspection #{self.inspection.pk}"


class Report(models.Model):
    """Formal risk report generated from one or more inspections."""
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_review', 'In Review'),
        ('critical', 'Critical'),
        ('completed', 'Completed'),
    ]

    report_id = models.CharField(max_length=50, unique=True)
    title = models.CharField(max_length=255)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='reports')
    inspection = models.ForeignKey(
        Inspection, on_delete=models.SET_NULL, null=True, blank=True, related_name='reports'
    )
    date = models.DateField()
    location = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    lead_inspector = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='led_reports'
    )
    risk_score = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(10.0)])
    key_findings = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"{self.report_id} — {self.title}"


class EnvironmentalRisk(models.Model):
    """Environmental hazard assessment for a project site."""
    FAULT_LINE_CHOICES = [
        ('none', 'None'),
        ('low', 'Low Proximity'),
        ('moderate', 'Moderate Proximity'),
        ('high', 'High Proximity'),
        ('very_high', 'Very High Proximity'),
    ]

    LIQUEFACTION_CHOICES = [
        ('zone_a', 'Zone A — Critical'),
        ('zone_b', 'Zone B — Moderate'),
        ('zone_c', 'Zone C — Low'),
        ('none', 'None'),
    ]

    EROSION_CHOICES = [
        ('severe', 'Severe'),
        ('moderate', 'Moderate'),
        ('low', 'Low'),
        ('negligible', 'Negligible'),
    ]

    project = models.OneToOneField(
        Project, on_delete=models.CASCADE, related_name='environmental_risk'
    )
    fault_line_proximity = models.CharField(
        max_length=20, choices=FAULT_LINE_CHOICES, default='none'
    )
    soil_liquefaction_risk = models.CharField(
        max_length=20, choices=LIQUEFACTION_CHOICES, default='zone_c'
    )
    erosion_potential = models.CharField(
        max_length=20, choices=EROSION_CHOICES, default='low'
    )
    overall_risk_score = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(10.0)], default=0.0
    )
    additional_analysis = models.TextField(blank=True)
    assessed_date = models.DateField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Environmental Risk — {self.project.name}"


class RiskHotspot(models.Model):
    """A specific high-risk location on a site floor plan or map."""
    SEVERITY_CHOICES = [
        ('critical', 'Critical'),
        ('moderate', 'Moderate'),
        ('low', 'Low'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='hotspots')
    title = models.CharField(max_length=255)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES)
    description = models.TextField(blank=True)
    # Position on floor plan as percentage (0-100) from top-left
    position_x = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(100.0)],
        help_text="Horizontal position on floor plan (0–100%)."
    )
    position_y = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(100.0)],
        help_text="Vertical position on floor plan (0–100%)."
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['severity', 'title']

    def __str__(self):
        return f"{self.title} ({self.get_severity_display()}) — {self.project.name}"


class MaintenancePriority(models.Model):
    """A repair or maintenance task prioritized by risk score."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('deferred', 'Deferred'),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name='maintenance_priorities'
    )
    title = models.CharField(max_length=255)
    location = models.CharField(max_length=255)
    risk_score = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(10.0)])
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    assigned_to = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='maintenance_tasks'
    )
    due_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-risk_score', 'status']

    def __str__(self):
        return f"{self.title} — {self.project.name}"


class DamageTrend(models.Model):
    """Time-series data point for damage severity trend charts."""
    SEVERITY_CHOICES = [
        ('critical', 'Critical'),
        ('high', 'High'),
        ('moderate', 'Moderate'),
        ('low', 'Low'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='damage_trends')
    date = models.DateField()
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES)
    value = models.FloatField(
        validators=[MinValueValidator(0.0)],
        help_text="Numeric damage severity value used for chart rendering."
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['date']
        unique_together = [('project', 'date', 'severity')]

    def __str__(self):
        return f"{self.project.name} — {self.date} ({self.severity}): {self.value}"


class GeospatialZone(models.Model):
    """A risk zone polygon overlaid on the environmental map."""
    ZONE_TYPE_CHOICES = [
        ('fault_line', 'Fault Line'),
        ('liquefaction', 'Soil Liquefaction'),
        ('erosion', 'Erosion Risk'),
        ('flood', 'Flood Zone'),
        ('general', 'General Risk Zone'),
    ]

    RISK_LEVEL_CHOICES = [
        ('zone_a', 'Zone A — Critical'),
        ('zone_b', 'Zone B — Moderate'),
        ('zone_c', 'Zone C — Low'),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name='geospatial_zones'
    )
    name = models.CharField(max_length=255)
    zone_type = models.CharField(max_length=30, choices=ZONE_TYPE_CHOICES)
    risk_level = models.CharField(max_length=20, choices=RISK_LEVEL_CHOICES)
    # GeoJSON-style polygon stored as JSON
    coordinates = models.JSONField(
        help_text="Array of [longitude, latitude] pairs forming a closed polygon."
    )
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.get_zone_type_display()}) — {self.project.name}"
