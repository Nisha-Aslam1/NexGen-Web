import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  X,
  Camera,
  Upload,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Award,
  Search,
  ShieldCheck,
  RefreshCw,
  FileText
} from 'lucide-react';
import { VolunteerIdCardModal } from '../admin/VolunteerIdCardModal.tsx';

interface CardScannerModalProps {
  onClose: () => void;
  onVerifiedOpen?: (referenceCode: string) => void;
}

type ScanMode = 'camera' | 'upload';

export const CardScannerModal: React.FC<CardScannerModalProps> = ({ onClose, onVerifiedOpen }) => {
  const [mode, setMode] = useState<ScanMode>('camera');
  const [scanning, setScanning] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);
  const [verifiedData, setVerifiedData] = useState<any | null>(null);
  const [loadingVerify, setLoadingVerify] = useState<boolean>(false);
  const [showIdCardModal, setShowIdCardModal] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const verifyCode = useCallback(async (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;

    setLoadingVerify(true);
    setError(null);

    try {
      // Extract code if URL was scanned e.g. https://nexgencouncil.bond/track?code=NXG-2026-8812
      let lookupCode = clean;
      if (clean.includes('CODE=')) {
        const parts = clean.split('CODE=');
        if (parts[1]) {
          lookupCode = parts[1].split('&')[0].trim();
        }
      } else if (clean.includes('TRACK?CODE=')) {
        const parts = clean.split('TRACK?CODE=');
        if (parts[1]) {
          lookupCode = parts[1].split('&')[0].trim();
        }
      }

      const res = await fetch(`/api/applications/verify/${encodeURIComponent(lookupCode)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification record not found.');
      }

      setVerifiedData(data);
      setSuccessCode(lookupCode);
      setScanning(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    } catch (err: any) {
      setError(err.message || 'Could not verify scanned credential code.');
    } finally {
      setLoadingVerify(false);
    }
  }, []);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Start Webcam stream when in camera mode
  useEffect(() => {
    if (mode !== 'camera' || successCode) return;

    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        startScanLoop();
      })
      .catch(() => {
        if (active) {
          setError('Camera access denied or unavailable. Please switch to Upload Image / PDF mode.');
          setMode('upload');
        }
      });

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [mode, successCode, verifyCode]);

  const startScanLoop = () => {
    const scanTick = () => {
      if (!videoRef.current || !canvasRef.current || !scanning) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth'
          });

          if (code && code.data) {
            verifyCode(code.data);
            return;
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(scanTick);
    };
    animFrameRef.current = requestAnimationFrame(scanTick);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoadingVerify(true);

    try {
      // If it's a PDF file, try reading as text or converting to image
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const reader = new FileReader();
        reader.onload = async event => {
          const text = event.target?.result as string;
          // Search for reference code pattern NXG-YYYY-XXXX in PDF text
          const match = text.match(/NXG-\d{4}-\d{4}/i);
          if (match && match[0]) {
            await verifyCode(match[0]);
          } else {
            setError('Could not automatically read QR code from PDF. Please upload a screenshot or image of the ID card.');
            setLoadingVerify(false);
          }
        };
        reader.onerror = () => {
          setError('Failed to read PDF file.');
          setLoadingVerify(false);
        };
        reader.readAsText(file);
        return;
      }

      // Otherwise read as image for QR scanning
      const reader = new FileReader();
      reader.onload = event => {
        const dataUrl = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setError('Canvas rendering error.');
            setLoadingVerify(false);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth'
          });

          if (qrCode && qrCode.data) {
            verifyCode(qrCode.data);
          } else {
            // Fallback: check filename or try parsing text if possible, or report not found
            setError('No QR code detected in the uploaded image. Please ensure the card photo clearly shows the QR code.');
            setLoadingVerify(false);
          }
        };
        img.onerror = () => {
          setError('Failed to load uploaded image.');
          setLoadingVerify(false);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    } catch {
      setError('Error processing uploaded file.');
      setLoadingVerify(false);
    }
  };

  const handleResetScan = () => {
    setSuccessCode(null);
    setVerifiedData(null);
    setError(null);
    setScanning(true);
    setMode('camera');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/15 text-amber-300 flex items-center justify-center border border-amber-400/30">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-white">
                Official Card &amp; QR Verifier
              </h3>
              <p className="text-xs text-slate-400">
                Scan ID card QR code or upload card image/PDF to verify instantly
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Verification Success View */}
        {verifiedData ? (
          <div className="space-y-6 animate-in zoom-in-95 duration-200">
            <div className="p-5 rounded-2xl bg-emerald-500/15 border border-emerald-400/35 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <span className="inline-block px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase tracking-wider mb-1">
                  Official Verification Successful
                </span>
                <h4 className="text-2xl font-serif font-bold text-white">
                  {verifiedData.fullName}
                </h4>
                <p className="text-xs font-mono text-emerald-200/90 mt-0.5">
                  Reference Code: <strong>{verifiedData.referenceCode}</strong>
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs text-slate-300">
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Status</span>
                <span className="font-semibold text-emerald-400">{verifiedData.status}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Assigned Role</span>
                <span className="font-semibold text-white">{verifiedData.assignedRole || 'Member NexGen Council'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">City / Chapter</span>
                <span className="font-semibold text-white">{verifiedData.city || 'National Chapter'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone Verified</span>
                <span className="font-semibold text-white">{verifiedData.phone || 'Yes'}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowIdCardModal(true)}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-colors"
              >
                <Award className="w-4 h-4" />
                <span>View Official ID Card Record</span>
              </button>
              <button
                type="button"
                onClick={handleResetScan}
                className="w-full sm:w-auto py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Scan Another Card</span>
              </button>
            </div>
          </div>
        ) : (
          /* Scanning / Upload View */
          <div className="space-y-5">
            {/* Mode Switcher Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('camera')}
                className={`flex-1 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                  mode === 'camera' ? 'bg-amber-400 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Live Camera Scan</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`flex-1 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                  mode === 'upload' ? 'bg-amber-400 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Upload Card Image / PDF</span>
              </button>
            </div>

            {mode === 'camera' ? (
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[4/3] flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Targeting Overlay Frame */}
                <div className="absolute inset-0 border-[3px] border-amber-400/50 m-12 rounded-2xl pointer-events-none flex flex-col items-center justify-between p-4">
                  <div className="w-8 h-8 border-t-2 border-l-2 border-amber-400 self-start" />
                  <div className="w-8 h-8 border-t-2 border-r-2 border-amber-400 self-end" />
                  <div className="bg-slate-950/80 px-3 py-1.5 rounded-full border border-amber-400/30 text-[11px] font-semibold text-amber-300">
                    Align Member ID QR Code within frame
                  </div>
                  <div className="w-8 h-8 border-b-2 border-l-2 border-amber-400 self-start" />
                  <div className="w-8 h-8 border-b-2 border-r-2 border-amber-400 self-end" />
                </div>

                {loadingVerify && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 text-white text-xs font-semibold">
                    <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Scanned Credential...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-700 hover:border-amber-400/80 rounded-2xl p-8 text-center space-y-4 bg-slate-950/50 transition-colors">
                <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/30 text-amber-300 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm text-white">Upload Member ID Card or PDF</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                    Select an image (PNG, JPG, WEBP) containing the QR code or export PDF file
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer shadow-md transition-colors">
                  <FileText className="w-4 h-4" />
                  <span>{loadingVerify ? 'Processing & Scanning...' : 'Choose Card Image / PDF'}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    disabled={loadingVerify}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {showIdCardModal && verifiedData && (
        <VolunteerIdCardModal
          volunteer={{
            id: verifiedData.id || `app_${verifiedData.referenceCode}`,
            fullName: verifiedData.fullName,
            email: verifiedData.email,
            phone: verifiedData.phone,
            city: verifiedData.city,
            assignedRole: verifiedData.assignedRole || 'Council Volunteer Scholar',
            referenceCode: verifiedData.referenceCode,
            joinedDate: verifiedData.submittedAt || new Date().toISOString(),
            status: verifiedData.volunteerStatus || 'Active',
            membershipTier: verifiedData.membershipTier || 'Active Volunteer Scholar',
            avatar: verifiedData.idCardPhotoUrl || verifiedData.avatar
          }}
          oneTimeIssuance={true}
          isAlreadyIssued={Boolean(verifiedData.idCardIssued)}
          issuedAt={verifiedData.idCardIssuedAt}
          onClose={() => setShowIdCardModal(false)}
        />
      )}
    </div>
  );
};
