from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.views.static import serve
from pathlib import Path

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent  # EPROPVIEW/

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    path('api-auth/', include('rest_framework.urls')),
    path('style.css', serve, {'document_root': str(FRONTEND_DIR), 'path': 'style.css'}),
    path('script.js', serve, {'document_root': str(FRONTEND_DIR), 'path': 'script.js'}),
    path('', TemplateView.as_view(template_name='index.html')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
