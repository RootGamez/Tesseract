import React, { useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function FloatingBubbles() {
  const { floatingBubbles, removeBubble } = useChatStore();

  useEffect(() => {
    // Automatically remove bubbles after 5 seconds
    const timeouts = floatingBubbles.map((bubble) => 
      setTimeout(() => removeBubble(bubble.bubbleId), 5000)
    );
    return () => timeouts.forEach(clearTimeout);
  }, [floatingBubbles, removeBubble]);

  return (
    <div className="fixed bottom-24 left-6 z-50 flex flex-col-reverse gap-2 pointer-events-none w-[300px]">
      <AnimatePresence>
        {floatingBubbles.map((msg) => (
          <motion.div
            key={msg.bubbleId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="bg-zinc-900/90 backdrop-blur-sm text-white p-3 rounded-2xl rounded-bl-none shadow-lg border border-white/10"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-primary">{msg.author}</span>
            </div>
            <p className="text-sm">{msg.text}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
