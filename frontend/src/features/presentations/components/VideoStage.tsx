import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Volume2 } from 'lucide-react';

/**
 * VideoStage — escena de video con reproducción sincronizada.
 *
 * - YouTube: el instructor controla play/pausa/seek con los controles nativos y
 *   esos cambios se transmiten por WebSocket (evento VIDEO_STATE). Los estudiantes
 *   siguen al profesor (no pueden controlar), con corrección de deriva.
 * - Vimeo / archivo directo (mp4): se incrusta sin sincronización (cada quien lo
 *   reproduce a su ritmo) — la sincronización requiere la API de YouTube.
 * - reviewMode (repaso): controles libres, sin sincronización.
 */

interface VideoStageProps {
  url: string;
  role: 'student' | 'instructor';
  stageId: string;
  /** Necesario para que el instructor transmita el estado de reproducción. */
  sendMessage?: (channel: any, event: string, payload: any) => void;
  /** Repaso self-paced: sin sincronización, controles libres. */
  reviewMode?: boolean;
}

type VideoSource =
  | { kind: 'youtube'; id: string }
  | { kind: 'vimeo'; id: string }
  | { kind: 'file'; url: string };

/** Detecta el origen del video a partir de una URL pegada por el profesor. */
export function parseVideoSource(raw?: string | null): VideoSource | null {
  if (!raw || typeof raw !== 'string') return null;
  const yt = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { kind: 'youtube', id: yt[1] };
  const vimeo = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: 'vimeo', id: vimeo[1] };
  return { kind: 'file', url: raw.trim() };
}

// ── Carga única de la YouTube IFrame API ────────────────────────────────────
let ytApiPromise: Promise<any> | null = null;
function loadYouTubeAPI(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

const SEEK_TOLERANCE = 1.5; // segundos de deriva tolerados antes de re-sincronizar
const HEARTBEAT_MS = 3000;  // re-emisión periódica para que se sincronicen los que llegan tarde

export default function VideoStage({ url, role, stageId, sendMessage, reviewMode = false }: VideoStageProps) {
  const source = parseVideoSource(url);

  if (!source) {
    return (
      <Centered>
        <p className="text-zinc-400 text-sm">No se configuró ningún video para esta escena.</p>
      </Centered>
    );
  }

  if (source.kind === 'youtube') {
    return (
      <YouTubeStage
        videoId={source.id}
        role={role}
        stageId={stageId}
        sendMessage={sendMessage}
        reviewMode={reviewMode}
      />
    );
  }

  // Vimeo / archivo: incrustado simple, sin sincronización.
  return (
    <div className="w-full h-full bg-black flex items-center justify-center p-4">
      {source.kind === 'vimeo' ? (
        <iframe
          src={`https://player.vimeo.com/video/${source.id}`}
          title="Video"
          className="w-full h-full max-w-5xl rounded-xl"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <video src={source.url} controls className="max-w-full max-h-full rounded-xl" />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="w-full h-full bg-zinc-950 flex items-center justify-center">{children}</div>;
}

// ── YouTube sincronizado ────────────────────────────────────────────────────

interface YouTubeStageProps {
  videoId: string;
  role: 'student' | 'instructor';
  stageId: string;
  sendMessage?: (channel: any, event: string, payload: any) => void;
  reviewMode: boolean;
}

function YouTubeStage({ videoId, role, stageId, sendMessage, reviewMode }: YouTubeStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  // El reproductor no cargó (API/iframe bloqueados por el navegador, sin red, etc.).
  const [loadFailed, setLoadFailed] = useState(false);

  // Estudiante en vivo = "seguidor": sigue al profesor, no controla.
  const isFollower = role === 'student' && !reviewMode;

  // El primer estado remoto que llega antes de que el reproductor esté listo.
  const pendingRemote = useRef<any>(null);
  // Último estado del profesor (para re-aplicar tras el gesto del usuario).
  const lastRemote = useRef<any>(null);
  // El usuario aún no ha interactuado: reproducimos SILENCIADO (el navegador sí
  // permite autoplay sin sonido) y mostramos un botón para activar el audio.
  const unlockedRef = useRef(false);
  const [muted, setMuted] = useState(false);

  // DEBUG temporal: contadores visibles en pantalla para diagnosticar el sync.
  const [dbgSent, setDbgSent] = useState(0);
  const [dbgRecv, setDbgRecv] = useState(0);
  const [dbgLast, setDbgLast] = useState('—');

  // ── Instructor: transmite el estado de reproducción ───────────────────────
  const broadcast = useCallback(
    (status: 'playing' | 'paused') => {
      const p = playerRef.current;
      if (role !== 'instructor' || !sendMessage || !p) return;
      const payload = {
        stage_id: stageId,
        video_id: videoId,
        status,
        time: p.getCurrentTime?.() ?? 0,
        rate: p.getPlaybackRate?.() ?? 1,
        ts: Date.now(),
      };
      console.log('[VideoStage] broadcast →', payload);
      // Canal 'sessions': está siempre conectado (con reconexión) en ambos lados.
      sendMessage('sessions', 'VIDEO_STATE', payload);
      setDbgSent((n) => n + 1);
      setDbgLast(`${status}@${Math.round(payload.time)}s`);
    },
    [role, sendMessage, stageId, videoId],
  );

  // ── Seguidor: aplica el estado recibido del profesor ──────────────────────
  const applyRemote = useCallback((d: any) => {
    const p = playerRef.current;
    const YT = (window as any).YT;
    if (!p) return;
    lastRemote.current = d;
    const cur = p.getCurrentTime?.() ?? 0;
    const isPlaying = YT && p.getPlayerState?.() === YT.PlayerState.PLAYING;

    if (d.status === 'playing') {
      if (Math.abs(cur - d.time) > SEEK_TOLERANCE) p.seekTo?.(d.time, true);
      // Si ya está reproduciendo (p.ej. el alumno le dio play), no re-silenciamos.
      if (!isPlaying) {
        if (!unlockedRef.current) {
          try { p.mute?.(); } catch { /* noop */ }
          setMuted(true);
        }
        p.playVideo?.();
      }
    } else {
      if (Math.abs(cur - d.time) > 0.5) p.seekTo?.(d.time, true);
      p.pauseVideo?.();
    }
  }, []);

  // ── Dejar que la API de YouTube cree el reproductor ───────────────────────
  // Es el camino fiable para que el canal de control (onReady/onStateChange,
  // play/pausa/seek) funcione. Tras crearlo, forzamos por código el tamaño del
  // iframe (la API lo crea con height="100%" como atributo, que el navegador no
  // respeta de forma fiable → antes salía negro).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let destroyed = false;
    setLoadFailed(false);

    // La API reemplaza este nodo por el <iframe>; React solo gestiona `host`.
    const mount = document.createElement('div');
    host.appendChild(mount);

    const sizeIframe = () => {
      const f = playerRef.current?.getIframe?.();
      if (f) {
        f.style.position = 'absolute';
        f.style.top = '0';
        f.style.left = '0';
        f.style.width = '100%';
        f.style.height = '100%';
      }
    };

    loadYouTubeAPI()
      .then((YT) => {
        if (destroyed) return;
        playerRef.current = new YT.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            // Todos (incluido el alumno) tienen controles nativos: el alumno puede
            // iniciar el video él mismo si la sincronización aún no le llegó.
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (destroyed) return;
              sizeIframe();
              setReady(true);
              if (isFollower && pendingRemote.current) {
                applyRemote(pendingRemote.current);
                pendingRemote.current = null;
              }
            },
            onError: () => {
              if (!destroyed) setLoadFailed(true);
            },
            onStateChange: (e: any) => {
              if (role !== 'instructor') return;
              const S = (window as any).YT.PlayerState;
              // PLAYING cubre play y seeks-mientras-reproduce (BUFFERING → PLAYING).
              if (e.data === S.PLAYING) broadcast('playing');
              else if (e.data === S.PAUSED || e.data === S.ENDED) broadcast('paused');
            },
          },
        });
      })
      .catch(() => {
        if (!destroyed) setLoadFailed(true);
      });

    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* el iframe puede haber sido removido ya */
      }
      playerRef.current = null;
      setReady(false);
    };
  }, [videoId, role, reviewMode, isFollower, broadcast, applyRemote]);

  // ── Instructor: heartbeat + seeks-mientras-pausa ──────────────────────────
  useEffect(() => {
    if (role !== 'instructor' || !ready) return;
    let lastPausedTime = -1;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      const YT = (window as any).YT;
      if (!p || !YT) return;
      const state = p.getPlayerState?.();
      const t = p.getCurrentTime?.() ?? 0;
      if (state === YT.PlayerState.PLAYING) {
        broadcast('playing'); // heartbeat (sincroniza a los que llegan tarde)
      } else if (state === YT.PlayerState.PAUSED && Math.abs(t - lastPausedTime) > 0.5) {
        broadcast('paused');  // el profesor movió la barra estando en pausa
        lastPausedTime = t;
      }
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [role, ready, broadcast]);

  // ── Seguidor: escucha el estado del profesor ──────────────────────────────
  useEffect(() => {
    if (!isFollower) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      console.log('[VideoStage] follower recibió video-state', d, 'miStage=', stageId, 'playerListo=', !!playerRef.current);
      setDbgRecv((n) => n + 1);
      setDbgLast(`${d?.status}@${Math.round(d?.time ?? 0)}s (stage ${d?.stage_id === stageId ? 'OK' : '≠'})`);
      // Solo descartamos si viene con stage_id y NO coincide; si no trae, lo aplicamos.
      if (d?.stage_id && d.stage_id !== stageId) return;
      // Aplicamos mientras exista el player (no exigimos `ready`: si onReady
      // tarda, la API encola la llamada igual). Si aún no hay player, queda pendiente.
      if (!playerRef.current) {
        pendingRemote.current = d;
        return;
      }
      applyRemote(d);
    };
    window.addEventListener('video-state', handler);
    return () => window.removeEventListener('video-state', handler);
  }, [isFollower, stageId, applyRemote]);

  // Clic del seguidor: activa el sonido (gesto del usuario) y re-sincroniza.
  const handleFollowerGesture = () => {
    unlockedRef.current = true;
    try { playerRef.current?.unMute?.(); } catch { /* noop */ }
    setMuted(false);
    if (lastRemote.current) applyRemote(lastRemote.current);
  };

  return (
    <div className="w-full h-full bg-black flex items-center justify-center p-4 relative">
      <div className="relative w-full h-full max-w-5xl max-h-full">
        {/* La API de YouTube reemplaza este contenedor por el <iframe> (posicionado absoluto). */}
        <div ref={hostRef} className="absolute inset-0 rounded-xl overflow-hidden bg-black" />

        {/* Fallback visible si el reproductor no carga (bloqueado por el navegador). */}
        {loadFailed && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-zinc-950/95 text-center p-6 rounded-xl">
            <Play className="w-10 h-10 text-white/70" />
            <p className="text-white text-sm font-semibold">No se pudo cargar el reproductor de YouTube</p>
            <p className="text-white/60 text-xs max-w-sm">
              Suele ser por el bloqueador del navegador (en Brave, baja los “Shields” para este sitio) o una extensión que bloquea YouTube. Recarga tras desactivarlo.
            </p>
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-primary underline mt-1"
            >
              Abrir el video en YouTube
            </a>
          </div>
        )}

        {/* El alumno controla su reproductor; si el profesor lo arrancó en silencio
            (autoplay), un botón flotante permite activar el sonido. No bloquea el iframe. */}
        {isFollower && muted && (
          <button
            type="button"
            onClick={handleFollowerGesture}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-primary/90 hover:bg-primary text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg backdrop-blur transition-colors"
          >
            <Volume2 className="w-4 h-4" />
            Activar sonido
          </button>
        )}

        {/* Etiqueta de estado */}
        {!reviewMode && (
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <span className="text-[11px] font-medium text-white/80 bg-black/50 backdrop-blur px-2.5 py-1 rounded-full">
              {role === 'instructor' ? 'Controlas la reproducción' : 'Sigues al profesor — puedes iniciar el video tú'}
            </span>
          </div>
        )}

        {/* DEBUG temporal de sincronización (quitar cuando funcione). */}
        {!reviewMode && (
          <div className="absolute top-3 right-3 z-30 pointer-events-none">
            <span className="text-[11px] font-mono text-green-300 bg-black/75 px-2.5 py-1 rounded">
              {role === 'instructor' ? `SYNC enviados: ${dbgSent} · ${dbgLast}` : `SYNC recibidos: ${dbgRecv} · ${dbgLast}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
