"""
WebSocket event type constants — Tesseract Platform
Ref: Documento de Requerimientos §6.3
"""

# ── Session control ───────────────────────────────────────────────────────────
STAGE_CHANGED = "STAGE_CHANGED"
SESSION_STATE = "SESSION_STATE"

# ── Presentaciones colaborativas ─────────────────────────────────────────────
PRESENTATION_STATE = "PRESENTATION_STATE"
SLIDE_CHANGED = "slide.change"
CANVAS_DRAW = "canvas.draw"

# ── Pizarra colaborativa ──────────────────────────────────────────────────────
BOARD_UPDATE = "BOARD_UPDATE"
LASER_MOVE = "LASER_MOVE"

# ── Gamificación ──────────────────────────────────────────────────────────────
POINTS_AWARDED = "POINTS_AWARDED"
EMOJI_FIRED = "EMOJI_FIRED"
TIMER_STARTED = "TIMER_STARTED"
TIMER_PAUSED = "TIMER_PAUSED"
TIMER_CANCELLED = "TIMER_CANCELLED"
SPINNER_RESULT = "SPINNER_RESULT"

# ── Quiz / Encuesta ───────────────────────────────────────────────────────────
QUIZ_LAUNCHED = "QUIZ_LAUNCHED"
QUIZ_RESULTS = "QUIZ_RESULTS"
QUIZ_RESPONSE = "QUIZ_RESPONSE"

# ── Chat ──────────────────────────────────────────────────────────────────────
CHAT_MESSAGE = "CHAT_MESSAGE"
CHAT_MESSAGE_DELETED = "CHAT_MESSAGE_DELETED"
CHAT_USER_SILENCED = "CHAT_USER_SILENCED"

# ── Recursos ──────────────────────────────────────────────────────────────────
RESOURCE_ADDED = "RESOURCE_ADDED"

# ── Participantes ─────────────────────────────────────────────────────────────
PARTICIPANT_JOINED = "PARTICIPANT_JOINED"
PARTICIPANT_LEFT = "PARTICIPANT_LEFT"
PARTICIPANT_STATUS = "PARTICIPANT_STATUS"

# ── Permisos de pizarra (RF-BOARD-04) ────────────────────────────────────────
BOARD_PERMISSION_GRANTED = "BOARD_PERMISSION_GRANTED"
BOARD_PERMISSION_REVOKED = "BOARD_PERMISSION_REVOKED"

# ── AI copiloto (RF-AI-03) ────────────────────────────────────────────────────
AI_SUGGESTION = "AI_SUGGESTION"

# ── Error ─────────────────────────────────────────────────────────────────────
WS_ERROR = "WS_ERROR"
