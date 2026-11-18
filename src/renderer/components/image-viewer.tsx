import { useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useWorkspace } from '../state/workspace-context';
import { IconButton } from './icon-button';
import { Modal } from './modal';

const scales = [0.5, 1, 1.5, 2, 3, 4];

export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const close = useWorkspace((state) => state.setImageViewer);
  const [step, setStep] = useState(1);
  const zoom = (delta: number) =>
    setStep((value) => Math.max(0, Math.min(scales.length - 1, value + delta)));
  const percent = scales[step] * 100;
  return (
    <Modal
      title={alt || 'Imagen'}
      className="image-viewer"
      onClose={() => close(null)}
      onKeyDown={(event) => {
        if (event.key === '+' || event.key === '=') zoom(1);
        else if (event.key === '-') zoom(-1);
        else if (event.key === '0') setStep(1);
      }}
    >
      <div className="image-viewer-controls" role="toolbar" aria-label="Zoom">
        <IconButton
          icon={ZoomOut}
          label="Reducir"
          disabled={step === 0}
          onClick={() => zoom(-1)}
        />
        <span role="status">{percent}%</span>
        <IconButton
          icon={ZoomIn}
          label="Ampliar"
          disabled={step === scales.length - 1}
          onClick={() => zoom(1)}
        />
        <IconButton
          icon={RotateCcw}
          label="Restablecer zoom"
          onClick={() => setStep(1)}
        />
      </div>
      <div className="image-viewer-stage" tabIndex={0}>
        <img src={src} alt={alt} style={{ inlineSize: `${percent}%` }} />
      </div>
    </Modal>
  );
}
