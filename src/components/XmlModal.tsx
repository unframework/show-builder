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
    <div className="xml-modal" onClick={onClose}>
      <div className="xml-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="xml-modal-header">
          <span>{name}</span>
          <span className="xml-modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <pre className="xml-modal-content">{content}</pre>
      </div>
    </div>
  );
}
