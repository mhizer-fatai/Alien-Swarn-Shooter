import React, { useEffect, useRef, useState } from 'react';

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
  onEnd: () => void;
  className?: string;
}

export function Joystick({ onMove, onEnd, className = '' }: JoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let id: number | null = null;
    let origin = { x: 0, y: 0 };
    const maxDist = 40;

    const handleStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (id !== null) return;
      
      const touch = e.changedTouches[0];
      id = touch.identifier;
      setActive(true);

      const rect = container.getBoundingClientRect();
      origin = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      updatePos(touch.clientX, touch.clientY);
    };

    const handleMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (id === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === id) {
          updatePos(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const updatePos = (clientX: number, clientY: number) => {
      let dx = clientX - origin.x;
      let dy = clientY - origin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
      }
      
      setPosition({ x: dx, y: dy });
      onMove(dx / maxDist, dy / maxDist);
    };

    const handleEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (id === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === id) {
          id = null;
          setActive(false);
          setPosition({ x: 0, y: 0 });
          onEnd();
          break;
        }
      }
    };

    container.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd, { passive: false });
    window.addEventListener('touchcancel', handleEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleStart);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [onMove, onEnd]);

  return (
    <div 
      ref={containerRef}
      className={`w-32 h-32 rounded-full bg-white/10 border-2 border-white/20 backdrop-blur-sm relative flex items-center justify-center pointer-events-auto select-none ${className}`}
    >
      <div 
        className="w-14 h-14 rounded-full bg-white/50 backdrop-blur-md shadow-lg pointer-events-none"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: active ? 'none' : 'transform 0.2s ease-out'
        }}
      />
    </div>
  );
}
