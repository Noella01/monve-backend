import React, { useState } from 'react';
import { Camera, Image as ImageIcon, Upload, X } from 'lucide-react';
import { uploadImage } from '../services/checkout';

interface ImagePlaceholderProps {
  imageUrl?: string;
  alt: string;
  category?: string;
  aspectRatio?: 'portrait' | 'square' | 'wide';
  className?: string;
  allowEdit?: boolean;
  onImageChange?: (newUrl: string) => void | Promise<void>;
}

export const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({
  imageUrl,
  alt,
  category = 'Collection',
  aspectRatio = 'portrait',
  className = '',
  allowEdit = false,
  onImageChange
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputUrl, setInputUrl] = useState('');

  const aspectClasses = {
    portrait: 'aspect-[3/4]',
    square: 'aspect-square',
    wide: 'aspect-[16/9]'
  }[aspectRatio];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choose JPEG, PNG or WebP up to 5 MB.');
        const uploaded=await uploadImage(file,'product');await onImageChange?.(uploaded.url);setIsEditing(false);
      }catch(error){alert((error as Error).message);}
    }
  };

  const handleSaveUrl = async () => {
    if (inputUrl.trim()) {
      try {await onImageChange?.(inputUrl.trim());setInputUrl('');setIsEditing(false);}catch(error){alert((error as Error).message);}
    }
  };

  if (imageUrl) {
    return (
      <div className={`relative group overflow-hidden bg-[var(--tone-151515)] ${aspectClasses} ${className}`}>
        <img
          src={imageUrl}
          alt={alt}
          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
        {allowEdit && onImageChange && (
          <button
            onClick={() => setIsEditing(true)}
            className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--tone-0a0a0a)]/90 hover:bg-[var(--tone-000000)] text-[var(--tone-f5f5f5)] text-xs px-2.5 py-1.5 rounded border border-[var(--tone-2a2a2a)] flex items-center gap-1.5 backdrop-blur-sm"
            title="Change photo"
          >
            <Camera size={13} />
            <span>Change</span>
          </button>
        )}

        {isEditing && (
          <div className="absolute inset-0 bg-[var(--tone-000000)]/90 p-4 flex flex-col justify-center items-center z-20 backdrop-blur-sm animate-fade-in">
            <button
              onClick={() => setIsEditing(false)}
              className="absolute top-2 right-2 text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]"
            >
              <X size={16} />
            </button>
            <p className="text-xs uppercase tracking-widest text-[var(--tone-a3a3a3)] mb-2">Upload or Paste Picture</p>
            <input
              type="text"
              placeholder="Paste image URL here..."
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="w-full bg-[var(--tone-1c1c1c)] border border-[var(--tone-2a2a2a)] text-xs px-2.5 py-1.5 rounded text-[var(--tone-ffffff)] mb-2 focus:outline-none focus:border-[var(--tone-ffffff)]"
            />
            <div className="flex gap-2 w-full">
              <button
                onClick={handleSaveUrl}
                className="flex-1 bg-[var(--tone-ffffff)] text-[var(--tone-000000)] text-xs font-semibold py-1.5 rounded hover:bg-[var(--tone-e5e5e5)]"
              >
                Save URL
              </button>
              <label className="flex-1 cursor-pointer bg-[var(--tone-2a2a2a)] text-[var(--tone-ffffff)] text-xs font-medium py-1.5 rounded text-center hover:bg-[var(--tone-404040)] flex items-center justify-center gap-1">
                <Upload size={12} />
                <span>Upload</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative group bg-[var(--tone-151515)] border border-[var(--tone-2a2a2a)] ${aspectClasses} ${className} flex flex-col items-center justify-center text-center p-4 transition-colors duration-300 hover:border-[var(--tone-404040)] select-none`}
    >
      {/* Sleek architectural framing */}
      <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-[var(--tone-333333)]" />
      <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-[var(--tone-333333)]" />
      <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-[var(--tone-333333)]" />
      <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-[var(--tone-333333)]" />

      <div className="flex flex-col items-center gap-2 max-w-[85%]">
        <div className="w-10 h-10 rounded-full border border-[var(--tone-2a2a2a)] bg-[var(--tone-1c1c1c)] flex items-center justify-center text-[var(--tone-a0a0a0)] group-hover:text-[var(--tone-ffffff)] transition-colors">
          <ImageIcon size={18} strokeWidth={1.5} />
        </div>
        <div className="text-[10px] tracking-[0.25em] text-[var(--tone-a0a0a0)] uppercase">
          {category}
        </div>
        <div className="text-xs font-medium text-[var(--tone-d4d4d4)] line-clamp-1">
          {alt}
        </div>
        <div className="text-[9px] uppercase tracking-widest text-[var(--tone-707070)] mt-0.5">
          Image coming soon
        </div>
      </div>

      {allowEdit && onImageChange && (
        <button
          onClick={() => setIsEditing(true)}
          className="mt-3 opacity-80 group-hover:opacity-100 transition-all bg-[var(--tone-1c1c1c)] hover:bg-[var(--tone-2a2a2a)] text-[var(--tone-d4d4d4)] hover:text-[var(--tone-ffffff)] text-[10px] uppercase tracking-wider px-3 py-1.5 rounded border border-[var(--tone-2a2a2a)] flex items-center gap-1.5"
        >
          <Camera size={12} />
          <span>Add Picture</span>
        </button>
      )}

      {isEditing && (
        <div className="absolute inset-0 bg-[var(--tone-0a0a0a)]/95 p-4 flex flex-col justify-center items-center z-20 backdrop-blur-sm">
          <button
            onClick={() => setIsEditing(false)}
            className="absolute top-3 right-3 text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]"
          >
            <X size={16} />
          </button>
          <p className="text-[11px] uppercase tracking-widest text-[var(--tone-d4d4d4)] font-semibold mb-2">
            Add Garment Photo
          </p>
          <p className="text-[10px] text-[var(--tone-a3a3a3)] mb-3">
            Choose a photo from your device or paste a link
          </p>
          <input
            type="text"
            placeholder="Paste image link (https://...)"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className="w-full bg-[var(--tone-1c1c1c)] border border-[var(--tone-2a2a2a)] text-xs px-3 py-2 rounded text-[var(--tone-ffffff)] mb-2 focus:outline-none focus:border-[var(--tone-ffffff)]"
          />
          <div className="flex gap-2 w-full mt-1">
            <button
              onClick={handleSaveUrl}
              className="flex-1 bg-[var(--tone-ffffff)] text-[var(--tone-000000)] text-xs font-semibold py-2 rounded hover:bg-[var(--tone-e5e5e5)] transition-colors"
            >
              Save Link
            </button>
            <label className="flex-1 cursor-pointer bg-[var(--tone-2a2a2a)] hover:bg-[var(--tone-333333)] text-[var(--tone-ffffff)] text-xs font-medium py-2 rounded text-center flex items-center justify-center gap-1 transition-colors">
              <Upload size={13} />
              <span>Upload File</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
