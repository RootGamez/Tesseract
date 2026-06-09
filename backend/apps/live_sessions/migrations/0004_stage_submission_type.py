# Adds the SUBMISSION ("Entregables") stage type.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("live_sessions", "0003_stage_session_decouple"),
    ]

    operations = [
        migrations.AlterField(
            model_name="stage",
            name="stage_type",
            field=models.CharField(
                choices=[
                    ("BOARD", "Pizarra"),
                    ("PDF", "PDF"),
                    ("PRESENTATION", "Presentación colaborativa"),
                    ("VIDEO", "Video"),
                    ("QUIZ", "Quiz / Encuesta"),
                    ("CHAT_FOCUS", "Chat enfocado"),
                    ("GAME", "Juego (Ruleta / Timer)"),
                    ("RESOURCE", "Nube de recursos"),
                    ("SUBMISSION", "Entregables"),
                    ("BREAK", "Descanso"),
                ],
                db_index=True,
                max_length=20,
            ),
        ),
    ]
