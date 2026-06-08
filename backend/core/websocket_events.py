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
PDF_PAGE_CHANGED = "PDF_PAGE_CHANGED"

# ── Pizarra colaborativa ──────────────────────────────────────────────────────
BOARD_UPDATE = "BOARD_UPDATE"   # (legacy) snapshot completo
SCENE_INIT = "SCENE_INIT"       # sync completo: solo al entrar / reconectar
SCENE_UPDATE = "SCENE_UPDATE"   # delta: solo elementos cambiados (frecuente)
LASER_MOVE = "LASER_MOVE"

# ── Gamificación ──────────────────────────────────────────────────────────────
POINTS_AWARDED = "POINTS_AWARDED"
EMOJI_FIRED = "EMOJI_FIRED"
TIMER_STARTED = "TIMER_STARTED"
TIMER_PAUSED = "TIMER_PAUSED"
TIMER_CANCELLED = "TIMER_CANCELLED"
SPINNER_RESULT = "SPINNER_RESULT"
ROULETTE_OPEN = "ROULETTE_OPEN"
ROULETTE_SPIN = "ROULETTE_SPIN"
ROULETTE_CLOSE = "ROULETTE_CLOSE"

# ── Quiz / Encuesta ───────────────────────────────────────────────────────────
QUIZ_LAUNCHED = "QUIZ_LAUNCHED"
QUIZ_RESULTS = "QUIZ_RESULTS"
QUIZ_RESPONSE = "QUIZ_RESPONSE"
QUIZ_CLOSE = "QUIZ_CLOSE"        # instructor → server: close question, reveal answer
QUIZ_REVEAL = "QUIZ_REVEAL"      # server → all: correct answer + scores + leaderboard
QUIZ_FINISH = "QUIZ_FINISH"      # instructor → server: end the whole quiz
QUIZ_FINISHED = "QUIZ_FINISHED"  # server → all: final podium / ranking

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
