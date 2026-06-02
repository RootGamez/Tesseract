"""Gamification serializers"""
from rest_framework import serializers
from apps.authentication.serializers import UserPublicSerializer
from .models import Quiz, QuizQuestion, QuizResponse, PointEvent, Timer


class QuizQuestionSerializer(serializers.ModelSerializer):
    response_count = serializers.IntegerField(source="responses.count", read_only=True)

    class Meta:
        model = QuizQuestion
        fields = [
            "id", "quiz", "session", "stage", "text", "question_type", "options",
            "correct_answer", "explanation", "difficulty", "duration_seconds",
            "is_launched", "launched_at", "closed_at", "generated_by_ai",
            "ai_model_used", "response_count",
        ]
        read_only_fields = ["id", "generated_by_ai", "ai_model_used", "is_launched", "launched_at", "closed_at"]
        extra_kwargs = {"correct_answer": {"write_only": True}}  # Hide from students


class QuizSerializer(serializers.ModelSerializer):
    questions = QuizQuestionSerializer(many=True, required=False)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = ["id", "owner", "title", "description", "questions", "question_count", "created_at", "updated_at"]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def get_question_count(self, obj):
        return obj.questions.count()

    def create(self, validated_data):
        questions_data = validated_data.pop("questions", [])
        validated_data["owner"] = self.context["request"].user
        quiz = Quiz.objects.create(**validated_data)
        
        import datetime
        from django.utils import timezone
        base_time = timezone.now()
        for idx, q_data in enumerate(questions_data):
            created_time = base_time + datetime.timedelta(seconds=idx)
            # Create question without session or stage, linked only to quiz
            q = QuizQuestion.objects.create(quiz=quiz, **q_data)
            QuizQuestion.objects.filter(pk=q.pk).update(created_at=created_time)
        return quiz

    def update(self, instance, validated_data):
        questions_data = validated_data.pop("questions", None)
        instance.title = validated_data.get("title", instance.title)
        instance.description = validated_data.get("description", instance.description)
        instance.save()

        if questions_data is not None:
            import datetime
            from django.utils import timezone
            base_time = timezone.now()

            keep_ids = []
            for idx, q in enumerate(questions_data):
                q_id = q.get("id")
                text = q.get("text", "").strip()
                options = q.get("options", [])
                duration = q.get("duration_seconds", 30)
                question_type = q.get("question_type", "MULTIPLE_CHOICE")
                difficulty = q.get("difficulty", "MEDIUM")
                explanation = q.get("explanation", "")

                if not text and not options:
                    continue

                created_time = base_time + datetime.timedelta(seconds=idx)
                
                # Format options for the database: [{"text": "...", "is_correct": bool}]
                db_options = []
                correct_answer = ""
                for o_idx, o in enumerate(options):
                    text_opt = o.get("text", "").strip()
                    is_corr = o.get("is_correct", False)
                    db_options.append({
                        "text": text_opt,
                        "is_correct": is_corr
                    })
                    if is_corr:
                        correct_answer = str(o_idx)

                question = None
                if q_id:
                    try:
                        question = QuizQuestion.objects.get(pk=q_id, quiz=instance)
                        question.text = text
                        question.options = db_options
                        question.correct_answer = correct_answer
                        question.duration_seconds = duration
                        question.question_type = question_type
                        question.difficulty = difficulty
                        question.explanation = explanation
                        question.save()
                        QuizQuestion.objects.filter(pk=question.pk).update(created_at=created_time)
                    except QuizQuestion.DoesNotExist:
                        pass

                if not question:
                    question = QuizQuestion.objects.create(
                        quiz=instance,
                        text=text,
                        options=db_options,
                        correct_answer=correct_answer,
                        duration_seconds=duration,
                        question_type=question_type,
                        difficulty=difficulty,
                        explanation=explanation,
                    )
                    QuizQuestion.objects.filter(pk=question.pk).update(created_at=created_time)

                keep_ids.append(question.pk)

            # Delete removed questions
            instance.questions.exclude(pk__in=keep_ids).delete()

        return instance


class QuizResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizResponse
        fields = ["id", "question", "participant", "answer", "is_correct", "answered_at"]
        read_only_fields = ["id", "is_correct", "answered_at"]


class PointEventSerializer(serializers.ModelSerializer):
    participant_name = serializers.CharField(source="participant.display_name", read_only=True)

    class Meta:
        model = PointEvent
        fields = ["id", "session", "participant", "participant_name", "points", "action_label", "awarded_by", "created_at"]
        read_only_fields = ["id", "created_at"]


class TimerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Timer
        fields = ["id", "session", "label", "duration_seconds", "end_timestamp_utc", "state"]
        read_only_fields = ["id", "end_timestamp_utc"]


class LeaderboardEntrySerializer(serializers.Serializer):
    display_name = serializers.CharField()
    points = serializers.IntegerField()
    rank = serializers.IntegerField()
