from django.contrib.auth.models import User
from rest_framework import serializers
from .models import (
    UserProfile, Project, Inspection, InspectionImage,
    Report, EnvironmentalRisk, RiskHotspot,
    MaintenancePriority, DamageTrend, GeospatialZone,
)


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'email']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class UserProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = UserProfile
        fields = ['id', 'user', 'role', 'phone', 'department']


class InspectionImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionImage
        fields = ['id', 'image', 'caption', 'uploaded_at']


class InspectionSerializer(serializers.ModelSerializer):
    images = InspectionImageSerializer(many=True, read_only=True)
    lead_inspector_name = serializers.StringRelatedField(source='lead_inspector')
    risk_level = serializers.ReadOnlyField()

    class Meta:
        model = Inspection
        fields = [
            'id', 'project', 'lead_inspector', 'lead_inspector_name',
            'inspection_date', 'status', 'risk_score', 'risk_level',
            'location', 'notes', 'images', 'created_at', 'updated_at',
        ]


class ProjectSerializer(serializers.ModelSerializer):
    inspection_count = serializers.SerializerMethodField()
    report_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            'id', 'name', 'location', 'description', 'status',
            'latitude', 'longitude', 'created_by', 'created_at',
            'updated_at', 'inspection_count', 'report_count',
        ]

    def get_inspection_count(self, obj):
        return obj.inspections.count()

    def get_report_count(self, obj):
        return obj.reports.count()


class ReportSerializer(serializers.ModelSerializer):
    lead_inspector_name = serializers.StringRelatedField(source='lead_inspector')
    project_name = serializers.StringRelatedField(source='project')

    class Meta:
        model = Report
        fields = [
            'id', 'report_id', 'title', 'project', 'project_name',
            'inspection', 'date', 'location', 'status',
            'lead_inspector', 'lead_inspector_name',
            'risk_score', 'key_findings', 'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'report_id': {'required': False},
            'lead_inspector': {'required': False},
        }


class EnvironmentalRiskSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnvironmentalRisk
        fields = [
            'id', 'project', 'fault_line_proximity', 'soil_liquefaction_risk',
            'erosion_potential', 'overall_risk_score', 'additional_analysis',
            'assessed_date', 'updated_at',
        ]


class RiskHotspotSerializer(serializers.ModelSerializer):
    class Meta:
        model = RiskHotspot
        fields = [
            'id', 'project', 'title', 'severity', 'description',
            'position_x', 'position_y', 'latitude', 'longitude', 'created_at',
        ]


class MaintenancePrioritySerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.StringRelatedField(source='assigned_to')

    class Meta:
        model = MaintenancePriority
        fields = [
            'id', 'project', 'title', 'location', 'risk_score',
            'status', 'assigned_to', 'assigned_to_name',
            'due_date', 'notes', 'created_at', 'updated_at',
        ]


class DamageTrendSerializer(serializers.ModelSerializer):
    class Meta:
        model = DamageTrend
        fields = ['id', 'project', 'date', 'severity', 'value', 'notes']


class GeospatialZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = GeospatialZone
        fields = [
            'id', 'project', 'name', 'zone_type', 'risk_level',
            'coordinates', 'description', 'created_at',
        ]


class DashboardStatsSerializer(serializers.Serializer):
    active_projects = serializers.IntegerField()
    critical_risk_reports = serializers.IntegerField()
    reports_in_review = serializers.IntegerField()
    completed_repairs = serializers.IntegerField()
    total_open_reports = serializers.IntegerField()
    total_completed_reports = serializers.IntegerField()
