import React, { useState } from 'react';

const presets = [
  { name: 'iPhone SE (320x568)', w: 320, h: 568 },
  { name: 'Pixel 5 (393x851)', w: 393, h: 851 },
  { name: 'Small (360x780)', w: 360, h: 780 },
  { name: 'Medium (412x915)', w: 412, h: 915 },
  { name: 'iPad Portrait (768x1024)', w: 768, h: 1024 },
  { name: 'iPad Landscape (1024x768)', w: 1024, h: 768 },
  { name: 'HD (1366x768)', w: 1366, h: 768 },
  { name: 'WXGA+ (1440x900)', w: 1440, h: 900 },
];

const DevResponsiveTester: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [size, setSize] = useState(presets[0]);
  return (
    <div className="absolute inset-0 z-[300] bg-black bg-opacity-60 flex flex-col">
      <div className="p-2 flex items-center gap-2 border-b border-current text-[10px] uppercase">
        <span>[ RESP_TEST ]</span>
        <select className="bg-transparent border border-current px-2 py-1" onChange={(e) => setSize(presets[parseInt(e.target.value, 10)])}>
          {presets.map((p, i) => (
            <option key={p.name} value={i}>{p.name}</option>
          ))}
        </select>
        <span className="ml-auto cursor-pointer" onClick={onClose}>[ CLOSE ]</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto border border-current" style={{ width: size.w, height: size.h }}>
          <iframe title="preview" src="." style={{ width: '100%', height: '100%', border: '0' }} />
        </div>
      </div>
    </div>
  );
};

export default DevResponsiveTester;

