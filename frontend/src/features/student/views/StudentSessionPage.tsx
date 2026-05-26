import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Trophy, X, Clock } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { useSceneStore } from '../store/sceneStore';
import { useChatStore } from '@/features/chat/store/chatStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { useParams } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import BoardWrapper from '@/features/board/components/BoardWrapper';
import { useOrchestratorStore } from '@/features/orchestrator/store/orchestratorStore';

const EMOJIS = ['👍', '❤️', '😂', '😮', '🔥', '👏', '🚀', '💡'];

export default function StudentSessionPage() {
  const { id } = useParams<{ id: string }>();
  const { activeScene, points, pointAnimation, clearPointAnimation } = useSceneStore();
  const { messages, floatingBubbles, isDrawerOpen, setDrawerOpen, isSilenced } = useChatStore();
  const { user } = useAuthStore();
  const { sendMessage } = useWebSocket(id ?? null, 'student');
  const [chatInput, setChatInput] = useState('');
  const { activeStageId } = useOrchestratorStore();

  const initials = user?.display_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'ME';

  // Clear point animation after 2 seconds
  useEffect(() => {
    if (pointAnimation) {
      const t = setTimeout(clearPointAnimation, 2000);
      return () => clearTimeout(t);
    }
  }, [pointAnimation, clearPointAnimation]);

  const handleEmoji = (emoji: string) => {
    sendMessage('gamification', 'EMOJI_FIRED', { emoji });
  };

  const handleSendChat = () => {
    if (isSilenced) return;
    if (!chatInput.trim()) return;
    sendMessage('chat', 'CHAT_MESSAGE', { text: chatInput.trim(), is_floating: true });
    setChatInput('');
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 overflow-hidden relative select-none">

      {/* ── MAIN SCENE ──────────────────────────────── */}
      <main className="flex-1 relative flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          {!activeStageId ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center p-6"
            >
              <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-center mx-auto mb-6 shadow-2xl animate-pulse">
                <Clock className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-white text-2xl font-bold tracking-tight">Sala de Espera</h2>
              <p className="text-zinc-400 text-sm mt-2 max-w-xs mx-auto">
                La clase aún no ha comenzado o el instructor no ha activado ninguna escena. Por favor, espera un momento.
              </p>
            </motion.div>
          ) : activeScene === 'BOARD' ? (
            <BoardWrapper key={activeStageId} role="student" sendMessage={sendMessage} />
          ) : (
            <motion.div
              key={activeScene}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <div className="w-24 h-24 rounded-3xl card-gradient-blue flex items-center justify-center mx-auto mb-6 shadow-2xl">
                <Trophy className="w-12 h-12 text-white" />
              </div>
              <p className="text-zinc-300 text-lg">Escena activa:</p>
              <p className="text-white text-3xl font-extrabold mt-1">{activeScene}</p>
              <p className="text-zinc-500 text-sm mt-3">Tu instructor está controlando esta vista</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating chat bubbles */}
        <div className="absolute bottom-20 left-4 flex flex-col-reverse gap-2 pointer-events-none w-72 z-20">
          <AnimatePresence>
            {floatingBubbles.slice(-3).map(b => (
              <motion.div
                key={b.bubbleId}
                initial={{ opacity: 0, y: 10, x: -10 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25 }}
                className="bg-zinc-900/90 backdrop-blur border border-white/10 rounded-2xl rounded-bl-sm px-3 py-2 shadow-xl"
              >
                <p className="text-white/60 text-[10px] font-semibold mb-0.5">{b.author}</p>
                <p className="text-white text-sm">{b.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* +Points animation */}
        <AnimatePresence>
          {pointAnimation && (
            <motion.div
              key={pointAnimation.id}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: -20, scale: 1.1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="absolute top-1/3 right-1/4 z-50 pointer-events-none"
            >
              <div className="bg-accent text-white font-extrabold text-3xl rounded-2xl px-6 py-3 shadow-2xl">
                +{pointAnimation.amount} pts
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── BOTTOM TOOLBAR ────────────────────────────── */}
      <footer className="h-14 bg-zinc-900/95 backdrop-blur border-t border-white/10 flex items-center justify-between px-4 shrink-0 z-30">
        {/* Left: User */}
        <div className="flex items-center gap-2 shrink-0">
          <Avatar className="h-8 w-8 border-2 border-white/20">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
          </Avatar>
          <span className="text-white/70 text-xs font-medium hidden sm:block truncate max-w-[80px]">
            {user?.display_name ?? 'Tú'}
          </span>
        </div>

        {/* Center: Emojis */}
        <div className="flex items-center gap-1">
          {EMOJIS.map(emoji => (
            <motion.button
              key={emoji}
              whileTap={{ scale: 0.8 }}
              whileHover={{ scale: 1.2 }}
              onClick={() => handleEmoji(emoji)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base hover:bg-white/10 transition-colors"
            >
              {emoji}
            </motion.button>
          ))}
        </div>

        {/* Right: Points + Chat */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-accent/20 border border-accent/30 rounded-lg px-2.5 py-1">
            <Trophy className="w-3.5 h-3.5 text-accent" />
            <span className="text-accent text-xs font-bold font-mono">{points}</span>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs sidebar-gradient border-0 text-white relative"
            onClick={() => setDrawerOpen(!isDrawerOpen)}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Chat
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-accent text-[9px] font-bold text-white flex items-center justify-center border border-background">
                {messages.length > 9 ? '9+' : messages.length}
              </span>
            )}
          </Button>
        </div>
      </footer>

      {/* ── CHAT DRAWER ─────────────────────────────── */}
      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="absolute inset-y-0 right-0 w-80 bg-zinc-900 border-l border-white/10 flex flex-col z-40 shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-semibold text-sm">Chat de la Clase</h3>
              <button onClick={() => setDrawerOpen(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <ScrollArea className="flex-1 p-3">
              {messages.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-8">Aún no hay mensajes</p>
              )}
              <div className="space-y-3">
                {messages.map(msg => (
                  <div key={msg.id} className={cn('flex gap-2', msg.author_id === (user?.id ?? 'me') && 'flex-row-reverse')}>
                    <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                      <AvatarFallback className="text-[9px] bg-primary/60 text-white">
                        {msg.author.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn('max-w-[75%]', msg.author_id === (user?.id ?? 'me') && 'items-end flex flex-col')}>
                      <p className="text-zinc-400 text-[10px] mb-1">{msg.author}</p>
                      <div className={cn(
                        'px-3 py-2 rounded-xl text-sm',
                        msg.author_id === (user?.id ?? 'me')
                          ? 'bg-primary text-white rounded-tr-sm'
                          : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'
                      )}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-white/10 flex gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                placeholder={isSilenced ? "El chat está silenciado" : "Escribe un mensaje..."}
                disabled={isSilenced}
                className="flex-1 h-9 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 text-sm disabled:opacity-50"
              />
              <Button
                size="sm"
                className="h-9 px-3 sidebar-gradient border-0 text-white disabled:opacity-50"
                onClick={handleSendChat}
                disabled={isSilenced}
              >
                ➤
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
