import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

export default function FileUpload({ onFileSelect, accept, label, multiple = false }) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFileSelect(multiple ? files : files[0]);
    }
  }, [onFileSelect, multiple]);

  const handleChange = useCallback((e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      onFileSelect(multiple ? files : files[0]);
    }
  }, [onFileSelect, multiple]);

  return (
    <div
      className={`file-upload ${dragActive ? 'file-upload--active' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <Upload size={36} strokeWidth={1.5} />
      <p className="file-upload__label">{label || 'Drop file here or click to browse'}</p>
      <p className="file-upload__hint">
        {accept === '.xlsx,.xls' ? 'Supports .xlsx and .xls files' :
         accept === '.docx' ? 'Supports .docx files' :
         `Accepted: ${accept}`}
      </p>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="file-upload__input"
      />
    </div>
  );
}
