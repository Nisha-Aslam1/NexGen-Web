import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, Image as ImageIcon, X, CheckCircle2, Loader2 } from 'lucide-react';
import { authFetch } from '../../lib/api.ts';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  helperText?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  value,
  onChange,
  label = 'Image / Visual Asset',
  helperText = 'Upload from your device or paste an external image URL'
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>(value.startsWith('/uploads/') || value.startsWith('data:') ? 'upload' : 'upload');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file (JPG, PNG, WebP, GIF, SVG).');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setError('Image is too large. Please select an image under 12MB.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Read as base64 data URL
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const res = await authFetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataUrl,
              filename: file.name
            })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Upload failed');

          onChange(data.url);
          setUploading(false);
        } catch (uploadErr: any) {
          setError(uploadErr.message || 'Error uploading image');
          setUploading(false);
        }
      };

      reader.onerror = () => {
        setError('Failed to read image file');
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (e: any) {
      setError(e.message || 'Upload error');
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="block font-semibold text-slate-800 text-xs">{label} *</label>
          <p className="text-[11px] text-slate-500">{helperText}</p>
        </div>
        <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === 'upload' ? 'bg-white text-indigo-950 shadow-xs font-semibold' : 'hover:text-slate-900'
            }`}
          >
            <Upload className="w-3 h-3" />
            <span>Upload File</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === 'url' ? 'bg-white text-indigo-950 shadow-xs font-semibold' : 'hover:text-slate-900'
            }`}
          >
            <LinkIcon className="w-3 h-3" />
            <span>Image URL</span>
          </button>
        </div>
      </div>

      {activeTab === 'upload' ? (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-indigo-600 bg-indigo-50/50'
                : 'border-slate-200 hover:border-indigo-300 bg-slate-50/60 hover:bg-slate-50'
            }`}
          >
            {uploading ? (
              <div className="py-4 flex flex-col items-center justify-center space-y-2">
                <Loader2 className="w-6 h-6 text-indigo-900 animate-spin" />
                <span className="text-xs font-semibold text-slate-700">Uploading and saving asset...</span>
              </div>
            ) : value ? (
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shrink-0">
                  <img src={value} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs mb-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Image ready</span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate font-mono">{value}</p>
                  <p className="text-[10px] text-indigo-950 font-medium mt-1 hover:underline">
                    Click to replace with another file
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange('');
                  }}
                  className="p-1.5 rounded-lg bg-slate-200 hover:bg-rose-100 hover:text-rose-600 text-slate-600 transition-colors"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="py-3 flex flex-col items-center justify-center space-y-1.5">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-950 flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-slate-800">
                  Click to browse or drop photo here
                </div>
                <div className="text-[10px] text-slate-500">
                  Supports PNG, JPG, WebP, SVG (saved directly to server media storage)
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://images.unsplash.com/photo-... or custom URL"
              className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:border-indigo-600 outline-none"
            />
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-rose-50 text-rose-600 text-xs"
              >
                Clear
              </button>
            )}
          </div>
          {value && (
            <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-900 shrink-0">
                <img src={value} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <div className="text-left min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-700">Preview</p>
                <p className="text-[10px] text-slate-500 truncate font-mono">{value}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-[11px] text-rose-600 font-medium">{error}</p>
      )}
    </div>
  );
};
