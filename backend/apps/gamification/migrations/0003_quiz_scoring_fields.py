from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("gamification", "0002_alter_quizquestion_session_quiz_quizquestion_quiz"),
    ]

    operations = [
        migrations.AddField(
            model_name="quizquestion",
            name="points_base",
            field=models.PositiveIntegerField(default=1000),
        ),
        migrations.AddField(
            model_name="quizresponse",
            name="response_time_ms",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="quizresponse",
            name="points_awarded",
            field=models.IntegerField(default=0),
        ),
    ]
