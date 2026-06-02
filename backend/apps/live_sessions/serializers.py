"""
Sessions app — Serializers
"""
from rest_framework import serializers
from apps.authentication.serializers import UserPublicSerializer
from .models import ClassTemplate, Stage, LiveSession, Participant, SessionState


class StageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stage
        fields = [
            "id", "title", "stage_type", "order",
            "duration_estimated_minutes", "config", "initial_board_state",
        ]


class ClassTemplateSerializer(serializers.ModelSerializer):
    stages = StageSerializer(many=True, read_only=True)
    owner = UserPublicSerializer(read_only=True)
    stage_count = serializers.IntegerField(source="stages.count", read_only=True)

    class Meta:
        model = ClassTemplate
        fields = [
            "id", "title", "description", "owner", "is_public",
            "estimated_duration_minutes", "tags", "thumbnail",
            "stages", "stage_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]


class ClassTemplateCreateSerializer(serializers.ModelSerializer):
    stages = StageSerializer(many=True, required=False)

    class Meta:
        model = ClassTemplate
        fields = ["title", "description", "is_public", "estimated_duration_minutes", "tags", "stages"]

    def create(self, validated_data):
        stages_data = validated_data.pop("stages", [])
        template = ClassTemplate.objects.create(**validated_data)
        for i, stage_data in enumerate(stages_data):
            stage_data.setdefault("order", i)
            Stage.objects.create(template=template, **stage_data)
        return template


class ParticipantSerializer(serializers.ModelSerializer):
    user = UserPublicSerializer(read_only=True)

    class Meta:
        model = Participant
        fields = [
            "id", "user", "is_guest", "display_name", "points",
            "can_draw", "connection_status", "connected_at", "is_chat_muted",
        ]
        read_only_fields = ["id", "user", "points", "connection_status", "connected_at"]


class LiveSessionSerializer(serializers.ModelSerializer):
    instructor = UserPublicSerializer(read_only=True)
    current_stage = StageSerializer(read_only=True)
    stages = serializers.SerializerMethodField()
    template_id = serializers.PrimaryKeyRelatedField(
        source="template", read_only=True
    )
    participant_count = serializers.IntegerField(
        source="participants.count", read_only=True
    )
    online_count = serializers.SerializerMethodField()
    available_transitions = serializers.SerializerMethodField()

    class Meta:
        model = LiveSession
        fields = [
            "id", "title", "join_code", "state", "instructor",
            "current_stage", "is_dry_run", "is_replay_public",
            "scheduled_at", "started_at", "paused_at", "ended_at",
            "participant_count", "online_count", "available_transitions",
            "ai_summary", "created_at", "stages", "template_id",
        ]
        read_only_fields = [
            "id", "join_code", "state", "instructor",
            "started_at", "paused_at", "ended_at", "created_at",
        ]

    def get_stages(self, obj):
        # Sessions own their stages (copied from the template at creation time).
        return StageSerializer(obj.stages.order_by("order"), many=True).data

    def get_online_count(self, obj):
        return obj.participants.filter(connection_status="ONLINE").count()

    def get_available_transitions(self, obj):
        from .state_machine import VALID_TRANSITIONS
        return VALID_TRANSITIONS.get(obj.state, [])


class LiveSessionCreateSerializer(serializers.ModelSerializer):
    # The frontend sends `template_id`; map it onto the `template` FK so a session
    # can be created from a template (or without one, for a blank class).
    template_id = serializers.PrimaryKeyRelatedField(
        source="template",
        queryset=ClassTemplate.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = LiveSession
        fields = ["id", "title", "template_id", "scheduled_at", "is_dry_run", "join_code", "state"]
        read_only_fields = ["id", "join_code", "state"]

    def validate_template_id(self, template):
        request = self.context["request"]
        if template and template.owner != request.user:
            raise serializers.ValidationError("No tienes permiso para usar esta plantilla.")
        return template


class JoinSessionSerializer(serializers.Serializer):
    """For students joining a session (RF-AUTH-02)."""
    join_code = serializers.CharField(max_length=6, min_length=6)
    display_name = serializers.CharField(max_length=150, required=False)

    def validate_join_code(self, value):
        try:
            session = LiveSession.objects.get(join_code=value.upper())
        except LiveSession.DoesNotExist:
            raise serializers.ValidationError("Código de sesión inválido.")
        if session.state == SessionState.ENDED:
            raise serializers.ValidationError("Esta sesión ya ha finalizado.")
        self.session = session
        return value.upper()


class SessionStateTransitionSerializer(serializers.Serializer):
    """Instructor-triggered state transition."""
    action = serializers.ChoiceField(choices=["start", "pause", "resume", "end"])
