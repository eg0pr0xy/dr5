import React, { useState } from 'react';

interface PanelProps {
  title?: string;
  footer?: React.ReactNode;
  collapsedOnXs?: boolean;
  priority?: number;
  children: React.ReactNode;
}

const Panel: React.FC<PanelProps> = ({ title, footer, collapsedOnXs, children }) => {
  const [open, setOpen] = useState(true);
  const toggle = () => setOpen(v => !v);
  return (
    <section className="border border-current bg-transparent flex flex-col min-h-0">
      {title !== undefined && (
        <div className="flex items-center justify-between px-2 py-1 border-b border-current select-none">
          <div className="text-[10px] uppercase tracking-[0.3em] readout">{title}</div>
          {collapsedOnXs && (
            <div className="text-[10px] cursor-pointer" onClick={toggle}>{open ? '[−]' : '[+]'}</div>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 content-scroll px-2 py-2">
        {(!collapsedOnXs || open) && children}
      </div>
      {footer && (
        <div className="px-2 py-1 border-t border-current text-[10px]">
          {footer}
        </div>
      )}
    </section>
  );
};

export default Panel;

