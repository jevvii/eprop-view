from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import (
    UserProfile, Project, Inspection, InspectionImage,
    Report, EnvironmentalRisk, RiskHotspot,
    MaintenancePriority, DamageTrend, GeospatialZone,
)


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'


class UserAdmin(BaseUserAdmin):
    inlines = [UserProfileInline]


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


class InspectionImageInline(admin.TabularInline):
    model = InspectionImage
    extra = 1
    readonly_fields = ['uploaded_at']


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'location', 'status', 'created_by', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'location', 'description']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Inspection)
class InspectionAdmin(admin.ModelAdmin):
    list_display = ['project', 'lead_inspector', 'inspection_date', 'status', 'risk_score', 'risk_level']
    list_filter = ['status', 'risk_level', 'inspection_date']
    search_fields = ['project__name', 'location', 'notes']
    readonly_fields = ['risk_level', 'created_at', 'updated_at']
    inlines = [InspectionImageInline]


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ['report_id', 'title', 'project', 'date', 'status', 'lead_inspector', 'risk_score']
    list_filter = ['status', 'date']
    search_fields = ['report_id', 'title', 'location', 'key_findings']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(EnvironmentalRisk)
class EnvironmentalRiskAdmin(admin.ModelAdmin):
    list_display = ['project', 'fault_line_proximity', 'soil_liquefaction_risk', 'erosion_potential', 'overall_risk_score']
    list_filter = ['fault_line_proximity', 'soil_liquefaction_risk', 'erosion_potential']
    readonly_fields = ['assessed_date', 'updated_at']


@admin.register(RiskHotspot)
class RiskHotspotAdmin(admin.ModelAdmin):
    list_display = ['title', 'project', 'severity', 'position_x', 'position_y']
    list_filter = ['severity', 'project']
    search_fields = ['title', 'description']


@admin.register(MaintenancePriority)
class MaintenancePriorityAdmin(admin.ModelAdmin):
    list_display = ['title', 'project', 'location', 'risk_score', 'status', 'assigned_to', 'due_date']
    list_filter = ['status', 'due_date']
    search_fields = ['title', 'location', 'notes']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(DamageTrend)
class DamageTrendAdmin(admin.ModelAdmin):
    list_display = ['project', 'date', 'severity', 'value']
    list_filter = ['severity', 'project']
    date_hierarchy = 'date'


@admin.register(GeospatialZone)
class GeospatialZoneAdmin(admin.ModelAdmin):
    list_display = ['name', 'project', 'zone_type', 'risk_level']
    list_filter = ['zone_type', 'risk_level']
    search_fields = ['name', 'description']
