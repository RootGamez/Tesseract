import React, { useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { useWebSocket } from '@/shared/hooks/useWebSocket';

export default function ChatDrawer() {
  const { messages, isDrawerOpen, setDrawerOpen } = useChatStore();
  const [text, setText] = useState('');
  const { sendMessage } = useWebSocket(null); // Assuming sessionId is handled globally or passed down

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    
    sendMessage('chat', 'CHAT_MESSAGE', { text, is_floating: true });
    setText('');
  };

  return (
    <Sheet open={isDrawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent className="w-[320px] sm:w-[400px] flex flex-col p-0 bg-card border-l border-border">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="text-left text-lg text-primary">Chat de la Clase</SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3">
                <Avatar className="w-8 h-8 mt-1">
                  <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground">
                    {msg.author.substring(0,2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground">{msg.author}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 bg-secondary/50 p-2 rounded-md rounded-tl-none">
                    {msg.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <form onSubmit={handleSend} className="p-4 border-t border-border flex gap-2">
          <Input 
            value={text} 
            onChange={(e) => setText(e.target.value)} 
            placeholder="Escribe un mensaje..." 
            className="flex-1 bg-background"
          />
          <Button type="submit" size="icon" className="bg-primary hover:bg-primary/90">
            <span className="sr-only">Enviar</span>
            ➤
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
