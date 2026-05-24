from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import (
    Project, Inspection, InspectionImage,
    Report, EnvironmentalRisk, RiskHotspot,
    MaintenancePriority, DamageTrend, GeospatialZone,
)
from .serializers import (
    ProjectSerializer, InspectionSerializer, InspectionImageSerializer,
    ReportSerializer, EnvironmentalRiskSerializer, RiskHotspotSerializer,
    MaintenancePrioritySerializer, DamageTrendSerializer, GeospatialZoneSerializer,
    DashboardStatsSerializer,
)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get('username', '')
        password = request.data.get('password', '')
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            return Response({'username': user.username})
        return Response({'error': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({'message': 'Logged out.'})


class GlobalStatsView(APIView):
    def get(self, request):
        return Response({
            'active_projects': Project.objects.filter(status='active').count(),
            'critical_risk_reports': Report.objects.filter(status='critical').count(),
            'reports_in_review': Report.objects.filter(status='in_review').count(),
            'completed_repairs': MaintenancePriority.objects.filter(status='completed').count(),
            'total_open_reports': Report.objects.filter(status='open').count(),
            'total_completed_reports': Report.objects.filter(status='completed').count(),
        })


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        name = self.request.query_params.get('name')
        if name:
            qs = qs.filter(name__iexact=name)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['get'])
    def dashboard(self, request, pk=None):
        project = self.get_object()
        data = {
            'active_projects': Project.objects.filter(status='active').count(),
            'critical_risk_reports': Report.objects.filter(status='critical').count(),
            'reports_in_review': Report.objects.filter(status='in_review').count(),
            'completed_repairs': MaintenancePriority.objects.filter(status='completed').count(),
            'total_open_reports': Report.objects.filter(status='open').count(),
            'total_completed_reports': Report.objects.filter(status='completed').count(),
        }
        serializer = DashboardStatsSerializer(data)
        return Response(serializer.data)


class InspectionViewSet(viewsets.ModelViewSet):
    queryset = Inspection.objects.select_related('project', 'lead_inspector').all()
    serializer_class = InspectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    @action(detail=True, methods=['post'], url_path='upload-image')
    def upload_image(self, request, pk=None):
        inspection = self.get_object()
        serializer = InspectionImageSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(inspection=inspection)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ReportViewSet(viewsets.ModelViewSet):
    queryset = Report.objects.select_related('project', 'lead_inspector').all()
    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        if not serializer.validated_data.get('report_id'):
            count = Report.objects.count() + 1
            while Report.objects.filter(report_id=f'RPT-{str(count).zfill(3)}').exists():
                count += 1
            serializer.save(
                report_id=f'RPT-{str(count).zfill(3)}',
                lead_inspector=self.request.user,
            )
        else:
            serializer.save(lead_inspector=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        report_status = self.request.query_params.get('status')
        project_id = self.request.query_params.get('project')
        if report_status:
            qs = qs.filter(status=report_status)
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs


class EnvironmentalRiskViewSet(viewsets.ModelViewSet):
    queryset = EnvironmentalRisk.objects.select_related('project').all()
    serializer_class = EnvironmentalRiskSerializer
    permission_classes = [permissions.IsAuthenticated]


class RiskHotspotViewSet(viewsets.ModelViewSet):
    queryset = RiskHotspot.objects.select_related('project').all()
    serializer_class = RiskHotspotSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get('project')
        severity = self.request.query_params.get('severity')
        if project_id:
            qs = qs.filter(project_id=project_id)
        if severity:
            qs = qs.filter(severity=severity)
        return qs


class MaintenancePriorityViewSet(viewsets.ModelViewSet):
    queryset = MaintenancePriority.objects.select_related('project', 'assigned_to').all()
    serializer_class = MaintenancePrioritySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get('project')
        item_status = self.request.query_params.get('status')
        if project_id:
            qs = qs.filter(project_id=project_id)
        if item_status:
            qs = qs.filter(status=item_status)
        return qs


class DamageTrendViewSet(viewsets.ModelViewSet):
    queryset = DamageTrend.objects.select_related('project').all()
    serializer_class = DamageTrendSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs


class GeospatialZoneViewSet(viewsets.ModelViewSet):
    queryset = GeospatialZone.objects.select_related('project').all()
    serializer_class = GeospatialZoneSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        project_id = self.request.query_params.get('project')
        zone_type = self.request.query_params.get('zone_type')
        if project_id:
            qs = qs.filter(project_id=project_id)
        if zone_type:
            qs = qs.filter(zone_type=zone_type)
        return qs
