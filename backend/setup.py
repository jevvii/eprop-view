import os, sys, django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "epropview.settings")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.core.management import call_command
from django.contrib.auth.models import User

call_command("makemigrations", "core")
call_command("migrate")

users = [("admin", "admin123", True), ("inspector", "inspect2024", False)]
for username, password, is_staff in users:
    if not User.objects.filter(username=username).exists():
        if is_staff:
            User.objects.create_superuser(username=username, password=password, email="")
        else:
            User.objects.create_user(username=username, password=password)
        print(f"Created: {username}")
    else:
        print(f"Already exists: {username}")

print("\nSetup complete! Run: python manage.py runserver")
