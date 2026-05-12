"""
AI Copilot prompt templates (RF-AI-01, RF-AI-02)
"""

QUESTION_GENERATION_SYSTEM = """
Eres un asistente educativo experto en pedagogía. 
Genera preguntas de opción múltiple claras, precisas y educativamente valiosas.
Responde ÚNICAMENTE con JSON válido, sin explicaciones adicionales.
""".strip()

QUESTION_GENERATION_PROMPT = """
Basándote en el siguiente texto educativo, genera exactamente {count} preguntas de opción múltiple.

TEXTO:
{text}

Responde con un array JSON con este esquema exacto:
[
  {{
    "text": "¿Cuál es...?",
    "options": [
      {{"text": "Opción A", "is_correct": false}},
      {{"text": "Opción B", "is_correct": true}},
      {{"text": "Opción C", "is_correct": false}},
      {{"text": "Opción D", "is_correct": false}}
    ],
    "correct_answer": "Opción B",
    "explanation": "Porque...",
    "difficulty": "MEDIUM"
  }}
]

Dificultades posibles: EASY, MEDIUM, HARD.
Genera preguntas variadas en dificultad.
""".strip()


SESSION_SUMMARY_SYSTEM = """
Eres un asistente que genera resúmenes estructurados de clases virtuales.
Produce el resumen en formato Markdown, bien organizado y conciso.
""".strip()

SESSION_SUMMARY_PROMPT = """
Genera un resumen post-clase estructurado en Markdown basándote en la siguiente información:

TÍTULO DE LA SESIÓN: {session_title}
DURACIÓN: {duration_minutes} minutos
ETAPAS CUBIERTAS:
{stages_summary}

MENSAJES DE CHAT (muestra):
{chat_sample}

SNIPPETS DE CÓDIGO:
{snippets_summary}

QUIZ RESULTADOS:
{quiz_summary}

El resumen debe incluir:
1. **Temas cubiertos** — lista de los principales conceptos trabajados
2. **Puntos clave** — los 3-5 aprendizajes más importantes
3. **Ejercicios realizados** — descripción de actividades prácticas
4. **Participación** — estadísticas breves de participación
5. **Próximos pasos** — sugerencias de seguimiento
""".strip()


LIVE_HINT_SYSTEM = """
Eres el copiloto de un instructor virtual. 
Analiza las señales de la sesión y sugiere acciones breves y concretas.
Responde en español, máximo 2 oraciones.
""".strip()

LIVE_HINT_PROMPT = """
Sesión activa. Señales detectadas:
- Emojis de confusión en últimos 2 min: {confusion_emojis}
- Ratio de respuesta último quiz: {quiz_response_rate}%
- Minutos sin interacción: {idle_minutes}
- Etapa actual: {current_stage_type}

Sugiere una acción concreta al instructor (máximo 2 oraciones).
""".strip()
