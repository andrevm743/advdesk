"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  messages: string[];
  intervalMs?: number;
}

export function LoadingOverlay({ messages, intervalMs = 3000 }: LoadingOverlayProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % messages.length);
        setVisible(true);
      }, 300);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [messages.length, intervalMs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center p-8">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-2 border-primary/20 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
        </div>
        <div
          className="transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <p className="text-lg font-medium text-foreground">{messages[index]}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Isso pode levar alguns momentos...
          </p>
        </div>
        <div className="flex gap-1">
          {messages.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-primary" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
