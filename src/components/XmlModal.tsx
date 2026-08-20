import { useEffect, useState } from 'react';

interface XmlModalProps {
  name: string;
  fetchXml: (name: string) => Promise<string>;
  onClose: () => void;
}

export function XmlModal({ name, fetchXml, onClose }: XmlModalProps) {
  const [content, setContent] = useState('Loading…');

  useEffect(() => {
    let active = true;
    setContent('Loading…');
    fetchXml(name)
      .then((xml) => active && setContent(xml))
      .catch((e: unknown) => {
        if (active) setContent(`Error loading XML: ${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      active = false;
    };
  }, [name, fetchXml]);

  return (
    <div className="modal modal-open">
      <div className="modal-box flex h-[85dvh] w-[92vw] max-w-3xl flex-col p-0">
        <div className="flex items-center justify-between border-b border-base-300 bg-base-200 px-4 py-2 text-sm">
          <span>{name}</span>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            ✕
          </button>
        </div>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all p-3 text-xs text-success">
          {content}
        </pre>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
