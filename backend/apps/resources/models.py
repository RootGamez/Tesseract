"""
Resources app — Models
RF-RES-01: File uploads to MinIO/S3
RF-RES-02: Snippets with syntax highlighting
RF-RES-03: PDF viewer (metadata only)
"""
from django.db import models
from django.conf import settings
from core.models import BaseModel


class Resource(BaseModel):
    """
    File resource attached to a session.
    RF-RES-01: Uploaded async via Celery to MinIO/S3.
    """

    class ResourceType(models.TextChoices):
        PDF = "PDF", "PDF"
        IMAGE = "IMAGE", "Imagen"
        ZIP = "ZIP", "ZIP / Comprimido"
        CODE = "CODE", "Código fuente"
        OTHER = "OTHER", "Otro"

    session = models.ForeignKey(
        "live_sessions.LiveSession",
        on_delete=models.CASCADE,
        related_name="resources",
    )
    stage = models.ForeignKey(
        "live_sessions.Stage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resources",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_resources",
    )
    name = models.CharField(max_length=500)
    resource_type = models.CharField(
        max_length=10,
        choices=ResourceType.choices,
        default=ResourceType.OTHER,
    )
    # S3/MinIO object key (not public URL)
    file_key = models.CharField(max_length=1000)
    size_bytes = models.PositiveBigIntegerField(default=0)
    content_type = models.CharField(max_length=200, blank=True)
    # Pre-signed URL cache
    presigned_url = models.URLField(max_length=2000, blank=True)
    url_expires_at = models.DateTimeField(null=True, blank=True)
    # Upload state
    is_uploaded = models.BooleanField(default=False)
    is_dry_run_temp = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Recurso"
        verbose_name_plural = "Recursos"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.resource_type}) — {self.session.title}"


class Snippet(BaseModel):
    """
    Code or text snippet with syntax highlighting.
    RF-RES-02: Monaco/CodeMirror editor, clipboard copy.
    """

    class Language(models.TextChoices):
        PYTHON = "python", "Python"
        JAVASCRIPT = "javascript", "JavaScript"
        TYPESCRIPT = "typescript", "TypeScript"
        SQL = "sql", "SQL"
        BASH = "bash", "Bash / Shell"
        HTML = "html", "HTML"
        CSS = "css", "CSS"
        JSON = "json", "JSON"
        YAML = "yaml", "YAML"
        JAVA = "java", "Java"
        CPP = "cpp", "C++"
        CSHARP = "csharp", "C#"
        GO = "go", "Go"
        RUST = "rust", "Rust"
        OTHER = "other", "Otro"

    session = models.ForeignKey(
        "live_sessions.LiveSession",
        on_delete=models.CASCADE,
        related_name="snippets",
    )
    stage = models.ForeignKey(
        "live_sessions.Stage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="snippets",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="snippets",
    )
    title = models.CharField(max_length=255, blank=True)
    language = models.CharField(
        max_length=20, choices=Language.choices, default=Language.OTHER
    )
    content = models.TextField()

    class Meta:
        verbose_name = "Snippet"
        verbose_name_plural = "Snippets"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title or 'Snippet'} [{self.language}] — {self.session.title}"
