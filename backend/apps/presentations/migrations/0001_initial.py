from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("live_sessions", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Presentation",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(max_length=255)),
                ("source_file_key", models.CharField(max_length=1000)),
                ("status", models.CharField(choices=[("UPLOADED", "Subida"), ("PROCESSING", "Procesando"), ("READY", "Lista"), ("FAILED", "Fallida")], db_index=True, default="UPLOADED", max_length=20)),
                ("total_slides", models.PositiveIntegerField(default=0)),
                ("current_slide_index", models.PositiveIntegerField(default=0)),
                ("active_canvas_state", models.JSONField(blank=True, default=dict)),
                ("uploaded_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="uploaded_presentations", to=settings.AUTH_USER_MODEL)),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="presentations", to="live_sessions.livesession")),
            ],
            options={
                "verbose_name": "Presentación",
                "verbose_name_plural": "Presentaciones",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="PresentationSlide",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("index", models.PositiveIntegerField()),
                ("image_key", models.CharField(max_length=1000)),
                ("thumbnail_key", models.CharField(blank=True, max_length=1000)),
                ("mime_type", models.CharField(default="image/png", max_length=100)),
                ("width", models.PositiveIntegerField(default=0)),
                ("height", models.PositiveIntegerField(default=0)),
                ("render_metadata", models.JSONField(blank=True, default=dict)),
                ("presentation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="slides", to="presentations.presentation")),
            ],
            options={
                "verbose_name": "Diapositiva",
                "verbose_name_plural": "Diapositivas",
                "ordering": ["index"],
            },
        ),
        migrations.CreateModel(
            name="PresentationAnnotation",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("revision", models.PositiveIntegerField(default=1)),
                ("canvas_state", models.JSONField(default=dict)),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="presentation_annotations", to=settings.AUTH_USER_MODEL)),
                ("presentation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="annotations", to="presentations.presentation")),
                ("slide", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="annotations", to="presentations.presentationslide")),
            ],
            options={
                "verbose_name": "Anotación",
                "verbose_name_plural": "Anotaciones",
                "ordering": ["-updated_at"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="presentationslide",
            unique_together={("presentation", "index")},
        ),
        migrations.AlterUniqueTogether(
            name="presentationannotation",
            unique_together={("presentation", "slide")},
        ),
    ]
