from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProjectViewSet, InspectionViewSet, ReportViewSet,
    EnvironmentalRiskViewSet, RiskHotspotViewSet,
    MaintenancePriorityViewSet, DamageTrendViewSet, GeospatialZoneViewSet,
    LoginView, LogoutView, GlobalStatsView,
)

router = DefaultRouter()
router.register(r'projects', ProjectViewSet)
router.register(r'inspections', InspectionViewSet)
router.register(r'reports', ReportViewSet)
router.register(r'environmental-risks', EnvironmentalRiskViewSet)
router.register(r'risk-hotspots', RiskHotspotViewSet)
router.register(r'maintenance-priorities', MaintenancePriorityViewSet)
router.register(r'damage-trends', DamageTrendViewSet)
router.register(r'geospatial-zones', GeospatialZoneViewSet)

urlpatterns = [
    path('auth/login/', LoginView.as_view()),
    path('auth/logout/', LogoutView.as_view()),
    path('stats/', GlobalStatsView.as_view()),
    path('', include(router.urls)),
]
