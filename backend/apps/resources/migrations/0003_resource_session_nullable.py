"""
Allow a Resource to belong to a template stage (no session). Such resources are
reusable assets that get copied into the live session when a class is started
from the template.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("resources", "0002_alter_resource_resource_type"),
        ("live_sessions", "0003_stage_session_decouple"),
    ]

    operations = [
        migrations.AlterField(
            model_name="resource",
            name="session",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="resources",
                to="live_sessions.livesession",
            ),
        ),
    ]
