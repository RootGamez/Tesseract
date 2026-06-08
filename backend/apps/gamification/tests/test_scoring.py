"""Unit tests for the Kahoot-style quiz scoring rules (RF-GAME-05)."""
from apps.gamification.scoring import (
    DEFAULT_BASE_POINTS,
    STREAK_BONUS_STEP,
    compute_points,
    speed_factor,
    streak_bonus,
)


class TestSpeedFactor:
    def test_instant_answer_keeps_full_speed(self):
        assert speed_factor(0, 20) == 1.0

    def test_buzzer_answer_keeps_no_speed(self):
        assert speed_factor(20_000, 20) == 0.0

    def test_halfway_answer(self):
        assert speed_factor(10_000, 20) == 0.5

    def test_clamps_overtime_to_zero(self):
        assert speed_factor(99_000, 20) == 0.0

    def test_clamps_negative_to_full(self):
        assert speed_factor(-500, 20) == 1.0

    def test_zero_duration_is_safe(self):
        # No division by zero; treated as a 1ms window.
        assert speed_factor(0, 0) == 1.0


class TestStreakBonus:
    def test_first_correct_has_no_bonus(self):
        assert streak_bonus(1) == 0

    def test_second_correct_earns_one_step(self):
        assert streak_bonus(2) == STREAK_BONUS_STEP

    def test_bonus_is_capped(self):
        assert streak_bonus(50) == streak_bonus(6) == 5 * STREAK_BONUS_STEP

    def test_zero_or_negative_streak_is_safe(self):
        assert streak_bonus(0) == 0
        assert streak_bonus(-3) == 0


class TestComputePoints:
    def test_wrong_answer_scores_zero(self):
        assert compute_points(
            is_correct=False, response_time_ms=0, duration_seconds=20
        ) == 0

    def test_instant_correct_scores_full_base(self):
        assert compute_points(
            is_correct=True, response_time_ms=0, duration_seconds=20, streak=1
        ) == DEFAULT_BASE_POINTS

    def test_buzzer_correct_scores_half_base(self):
        assert compute_points(
            is_correct=True, response_time_ms=20_000, duration_seconds=20, streak=1
        ) == DEFAULT_BASE_POINTS // 2

    def test_faster_answer_scores_more(self):
        fast = compute_points(is_correct=True, response_time_ms=2_000, duration_seconds=20)
        slow = compute_points(is_correct=True, response_time_ms=15_000, duration_seconds=20)
        assert fast > slow

    def test_streak_adds_bonus_on_top(self):
        no_streak = compute_points(
            is_correct=True, response_time_ms=0, duration_seconds=20, streak=1
        )
        with_streak = compute_points(
            is_correct=True, response_time_ms=0, duration_seconds=20, streak=3
        )
        assert with_streak == no_streak + 2 * STREAK_BONUS_STEP

    def test_result_is_always_int(self):
        pts = compute_points(is_correct=True, response_time_ms=7_333, duration_seconds=20)
        assert isinstance(pts, int)
