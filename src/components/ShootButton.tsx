import React from 'react';

interface ShootButtonProps {
  onPress: () => void;
  onRelease: () => void;
  className?: string;
}

export function ShootButton({ onPress, onRelease, className = '' }: ShootButtonProps) {
  return (
    <div
      className={`w-24 h-24 rounded-full bg-red-500/50 border-2 border-red-500/80 backdrop-blur-sm flex items-center justify-center pointer-events-auto select-none active:bg-red-500/70 active:scale-95 transition-all ${className}`}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRelease();
      }}
      onTouchCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRelease();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="w-12 h-12 rounded-full bg-red-500/80 pointer-events-none" />
    </div>
  );
}
