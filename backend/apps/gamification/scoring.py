"""
Quiz scoring — Kahoot-style points (RF-GAME-05).

Pure functions, no Django imports, so the rules are trivially unit-testable and
the consumer stays thin. The scoring model:

    * A wrong / unanswered question scores 0.
    * A correct answer scores between ``base/2`` and ``base`` points depending on
      how fast the participant answered (answer instantly → full ``base``;
      answer at the very last instant → ``base/2``).
    * A streak of consecutive correct answers adds a small bonus, capped, to
      reward sustained performance (like Kahoot's "answer streak").

All values are integers so totals are exact and easy to display.
"""
from __future__ import annotations

# Default maximum points for a single question answered instantly.
DEFAULT_BASE_POINTS = 1000
# Bonus granted per consecutive correct answer beyond the first.
STREAK_BONUS_STEP = 100
# Maximum streak length that still earns a bonus (so the bonus can't run away).
MAX_STREAK_BONUS_STEPS = 5


def speed_factor(response_time_ms: int, duration_seconds: int) -> float:
    """
    Fraction of the *speed* portion of the score that is kept, in ``[0.0, 1.0]``.

    1.0 means "answered instantly", 0.0 means "answered exactly at the buzzer".
    Robust against missing / nonsensical inputs.
    """
    duration_ms = max(1, int(duration_seconds) * 1000)
    elapsed = min(max(0, int(response_time_ms)), duration_ms)
    return 1.0 - (elapsed / duration_ms)


def streak_bonus(streak: int) -> int:
    """Bonus points for a run of ``streak`` consecutive correct answers."""
    extra_steps = max(0, int(streak) - 1)
    return min(extra_steps, MAX_STREAK_BONUS_STEPS) * STREAK_BONUS_STEP


def compute_points(
    *,
    is_correct: bool,
    response_time_ms: int,
    duration_seconds: int,
    base_points: int = DEFAULT_BASE_POINTS,
    streak: int = 0,
) -> int:
    """
    Total points for a single answer.

    ``streak`` is the participant's run length *including* this answer (so the
    first correct answer is ``streak == 1`` and earns no bonus).
    """
    if not is_correct:
        return 0

    base = max(0, int(base_points))
    # Speed contributes the top half of the score; the bottom half is guaranteed
    # for any correct answer, so a correct-but-slow answer still feels rewarding.
    half = base / 2.0
    speed_points = half + half * speed_factor(response_time_ms, duration_seconds)
    return int(round(speed_points)) + streak_bonus(streak)
