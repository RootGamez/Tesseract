"""
Decouple stages from templates: a Stage now belongs to either a ClassTemplate
(the reusable blueprint) or a LiveSession (an independent, editable copy created
when the template is instantiated). This lets live classes be edited without
mutating the original template and allows sessions created without a template to
own their own stages.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("live_sessions", "0002_alter_stage_stage_type"),
    ]

    operations = [
        # Drop the old (template, order) unique_together before relaxing the FK.
        migrations.AlterUniqueTogether(
            name="stage",
            unique_together=set(),
        ),
        migrations.AddField(
            model_name="stage",
            name="session",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="stages",
                to="live_sessions.livesession",
            ),
        ),
        migrations.AlterField(
            model_name="stage",
            name="template",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="stages",
                to="live_sessions.classtemplate",
            ),
        ),
        migrations.AddConstraint(
            model_name="stage",
            constraint=models.UniqueConstraint(
                condition=models.Q(("template__isnull", False)),
                fields=("template", "order"),
                name="uniq_template_stage_order",
            ),
        ),
        migrations.AddConstraint(
            model_name="stage",
            constraint=models.UniqueConstraint(
                condition=models.Q(("session__isnull", False)),
                fields=("session", "order"),
                name="uniq_session_stage_order",
            ),
        ),
    ]
