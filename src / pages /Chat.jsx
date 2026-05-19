import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import Sidebar from '../components/chat/Sidebar';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import WelcomeScreen from '../components/chat/WelcomeScreen';
import LoadingDots from '../components/chat/LoadingDots';

export default function Chat() {
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => base44.entities.Conversation.list('-updated_date', 50),
  });

  // Load conversation messages when active changes
  useEffect(() => {
    if (activeConvId) {
      const conv = conversations.find(c => c.id === activeConvId);
      if (conv?.messages) {
        setMessages(conv.messages);
      }
    } else {
      setMessages([]);
    }
  }, [activeConvId, conversations]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const createConversation = async (title, msgs) => {
    const conv = await base44.entities.Conversation.create({
      title: title.slice(0, 60),
      messages: msgs,
    });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    return conv;
  };

  const updateConversation = async (id, msgs) => {
    await base44.entities.Conversation.update(id, { messages: msgs });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const isImageRequest = (text) => {
    const lower = text.toLowerCase();
    return (
      lower.startsWith('generate image') ||
      lower.startsWith('generate a image') ||
      lower.startsWith('create image') ||
      lower.startsWith('draw ') ||
      lower.startsWith('make an image') ||
      lower.startsWith('make image') ||
      lower.startsWith('generate an image') ||
      lower.includes('generate image of') ||
      lower.includes('create an image of') ||
      lower.includes('draw a picture') ||
      lower.includes('draw an image') ||
      (lower.includes('image of') && lower.includes('generate'))
    );
  };

  const handleSend = useCallback(async (content) => {
    const userMsg = { role: 'user', content, timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      let finalMessages;

      if (isImageRequest(content)) {
        // Image generation
        const result = await base44.integrations.Core.GenerateImage({ prompt: content });
        const imgMsg = {
          role: 'assistant',
          type: 'image',
          image_url: result.url,
          content: content,
          timestamp: new Date().toISOString(),
        };
        finalMessages = [...newMessages, imgMsg];
        setMessages(finalMessages);
      } else {
        // Text / code / math response
        const systemPrompt = `You are Amber AI, a brilliant and versatile AI assistant. You excel at:
- Writing and explaining code in any programming language (always use fenced code blocks with language tags)
- Solving complex math problems step by step
- Answering questions on any topic with depth and clarity
- Creative writing, brainstorming, and ideation
- Data analysis and logical reasoning
- Explaining scientific concepts simply

Always format your responses with proper markdown. Use code blocks with language tags for code. Use headers, lists, and bold text for clarity. Be thorough yet concise. If solving math, show your work. If writing code, include helpful comments.`;

        const conversationHistory = newMessages
          .filter(m => m.type !== 'image')
          .map(m => `${m.role === 'user' ? 'User' : 'Amber'}: ${m.content}`)
          .join('\n\n');

        const fullPrompt = `${systemPrompt}\n\nConversation:\n${conversationHistory}\n\nAmber:`;

        const response = await base44.integrations.Core.InvokeLLM({
          prompt: fullPrompt,
          add_context_from_internet: true,
        });

        const aiMsg = { role: 'assistant', content: response, timestamp: new Date().toISOString() };
        finalMessages = [...newMessages, aiMsg];
        setMessages(finalMessages);
      }

      // Save conversation
      if (activeConvId) {
        await updateConversation(activeConvId, finalMessages);
      } else {
        const title = content.length > 50 ? content.slice(0, 50) + '...' : content;
        const conv = await createConversation(title, finalMessages);
        setActiveConvId(conv.id);
      }
    } catch (err) {
      const errorMsg = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date().toISOString() };
      setMessages([...newMessages, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, activeConvId]);

  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
  };

  const handleDelete = async (id) => {
    await base44.entities.Conversation.delete(id);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={setActiveConvId}
          onNew={handleNewChat}
          onDelete={handleDelete}
          onLogout={handleLogout}
          isOpen={true}
          onClose={() => {}}
        />
      </div>
      <div className="md:hidden">
        <Sidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={setActiveConvId}
          onNew={handleNewChat}
          onDelete={handleDelete}
          onLogout={handleLogout}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="flex items-center h-12 px-4 border-b border-border flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 md:hidden mr-2"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            {activeConvId 
              ? conversations.find(c => c.id === activeConvId)?.title || 'Chat' 
              : 'New chat'}
          </span>
        </header>

        {/* Messages Area */}
        {messages.length === 0 && !isLoading ? (
          <WelcomeScreen onSuggestionClick={handleSend} />
        ) : (
          <ScrollArea ref={scrollRef} className="flex-1">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((msg, i) => (
                <MessageBubble 
                  key={i} 
                  message={msg} 
                  isLast={i === messages.length - 1} 
                />
              ))}
              {isLoading && <LoadingDots />}
            </div>
          </ScrollArea>
        )}

        {/* Input Area */}
        <ChatInput 
          onSend={handleSend} 
          isLoading={isLoading}
          onStop={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
}
