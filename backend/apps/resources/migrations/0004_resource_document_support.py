"""
Add DOCUMENT resource type and the converted_pdf_key field used to store the
PDF rendered from office/text documents (Word, spreadsheets, txt/markdown).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("resources", "0003_resource_session_nullable"),
    ]

    operations = [
        migrations.AddField(
            model_name="resource",
            name="converted_pdf_key",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
        migrations.AlterField(
            model_name="resource",
            name="resource_type",
            field=models.CharField(
                choices=[
                    ("PDF", "PDF"),
                    ("DOCUMENT", "Documento"),
                    ("PRESENTATION", "Presentación"),
                    ("IMAGE", "Imagen"),
                    ("ZIP", "ZIP / Comprimido"),
                    ("CODE", "Código fuente"),
                    ("OTHER", "Otro"),
                ],
                default="OTHER",
                max_length=20,
            ),
        ),
    ]
