import { FaFilePdf } from 'react-icons/fa';

interface SourceCardProps {
  fileName: string;
  uploaded: string;
}

export function SourceCard({ fileName, uploaded }: SourceCardProps) {
  return (
    <div className="source-card">
      <div className="source-file-icon" aria-hidden="true">
        <FaFilePdf />
      </div>
      <div className="source-info">
        <div className="source-name">{fileName}</div>
        <div className="source-meta">
          <span className="badge badge-success">✓ Verified Source</span>
          <span className="source-uploaded">Uploaded {uploaded}</span>
        </div>
      </div>
      <span className="source-open" aria-hidden="true">
        Open Document
      </span>
    </div>
  );
}
