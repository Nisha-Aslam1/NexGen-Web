import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  X,
  Camera,
  Upload,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Award,
  RefreshCw,
  FileText
} from 'lucide-react';
import { VolunteerIdCardModal } from '../admin/VolunteerIdCardModal.tsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface CardScannerModalProps {
  onClose: () => void;
  onVerifiedOpen?: (referenceCode: string) => void;
}

type ScanMode = 'camera' | 'upload';

interface NativeBarcodeDetector {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
}

function getNativeQrDetector(): NativeBarcodeDetector | null {
  try {
    const DetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => NativeBarcodeDetector;
      }
    ).BarcodeDetector;
    if (typeof DetectorCtor === 'function') {
      return new DetectorCtor({ formats: ['qr_code'] });
    }
  } catch {
    // Fallback to jsQR
  }
  return null;
}

function extractVerificationCode(rawInput: string): string {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return '';

  // 1. Standard URL with ?code=...
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      const codeParam = parsed.searchParams.get('code');
      if (codeParam && codeParam.trim()) {
        return codeParam.trim().toUpperCase();
      }
    }
  } catch {
    // Not a strict URL, continue regex extraction
  }

  // 2. Query fragment like track?code=NXG-2026-1234
  const queryMatch = trimmed.match(/[?&]code=([^&\s#]+)/i);
  if (queryMatch && queryMatch[1]) {
    try {
      return decodeURIComponent(queryMatch[1]).trim().toUpperCase();
    } catch {
      return queryMatch[1].trim().toUpperCase();
    }
  }

  // 3. Recognized NexGen credential code formats
  const patternMatch = trimmed.match(/(?:NXG-[A-Z0-9]{4}-[A-Z0-9]{4,8}|NG-VOL-[A-Z0-9]+)/i);
  if (patternMatch && patternMatch[0]) {
    return patternMatch[0].trim().toUpperCase();
  }

  return trimmed.toUpperCase();
}

function tryJsQr(canvas: HTMLCanvasElement, enhanceContrast = false): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width < 16 || canvas.height < 16) return null;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (!enhanceContrast) {
    const res = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    });
    return res?.data || null;
  }

  // High-contrast grayscale + adaptive normalization helps compressed screenshots / photos
  // and dark-navy (#162A4D) QR modules with centered NexGen emblem
  const data = new Uint8ClampedArray(imageData.data);
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = Math.max(1, maxLum - minLum);
  const threshold = minLum + range * 0.52;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = lum < threshold ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }

  const res = jsQR(data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth'
  });
  return res?.data || null;
}

function renderRegionToWhiteCanvas(
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  targetMaxDim: number
): HTMLCanvasElement {
  const scale = targetMaxDim / Math.max(sw, sh, 1);
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
  }
  return out;
}

async function decodeQrFromCanvas(sourceCanvas: HTMLCanvasElement): Promise<string | null> {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (!w || !h) return null;

  // Ensure opaque white backdrop so transparent PNGs never create zero-alpha artifacts
  const maxInitial = 2400;
  const initDim = Math.min(Math.max(w, h), maxInitial);
  const baseCanvas = renderRegionToWhiteCanvas(sourceCanvas, 0, 0, w, h, initDim);

  // 1. Native hardware/browser BarcodeDetector (fastest & handles small/tilted/logo QRs effortlessly)
  const detector = getNativeQrDetector();
  if (detector) {
    try {
      const detected = await detector.detect(baseCanvas);
      const match = detected.find(d => Boolean(d.rawValue));
      if (match?.rawValue) return match.rawValue;
    } catch {
      // Continue to jsQR pipeline
    }
  }

  // 2. Full-frame jsQR across multiple scales (original + downscaled/upscaled)
  const fullDims = Array.from(new Set([Math.max(baseCanvas.width, baseCanvas.height), 1200, 900, 1600]));
  for (const dim of fullDims) {
    const candidate =
      dim === Math.max(baseCanvas.width, baseCanvas.height)
        ? baseCanvas
        : renderRegionToWhiteCanvas(baseCanvas, 0, 0, baseCanvas.width, baseCanvas.height, dim);
    const direct = tryJsQr(candidate, false);
    if (direct) return direct;
  }

  // Full-frame contrast-enhanced fallback
  const fullContrast = tryJsQr(
    renderRegionToWhiteCanvas(baseCanvas, 0, 0, baseCanvas.width, baseCanvas.height, 1400),
    true
  );
  if (fullContrast) return fullContrast;

  // 3. Targeted NexGen Card QR zones (Back card portrait bottom-left, Dual PNG right-card bottom-left, plus lower halves)
  const bw = baseCanvas.width;
  const bh = baseCanvas.height;
  const targetedRegions: Array<[number, number, number, number]> = [
    // Portrait Back Card QR corner
    [0.02, 0.6, 0.52, 0.36],
    // Dual PNG Back Card (right card bottom-left QR zone)
    [0.48, 0.62, 0.4, 0.36],
    // Lower-left & lower-right quadrants
    [0.0, 0.5, 0.55, 0.5],
    [0.45, 0.5, 0.55, 0.5],
    // Lower band
    [0.0, 0.58, 1.0, 0.42]
  ];

  // Add overlapping 3x3 grid tiles so arbitrary screenshots / mobile camera photos decode cleanly
  const steps = [0, 0.27, 0.54];
  for (const ry of steps) {
    for (const rx of steps) {
      targetedRegions.push([rx, ry, 0.46, 0.46]);
    }
  }

  for (let i = 0; i < targetedRegions.length; i++) {
    const [rx, ry, rw, rh] = targetedRegions[i];
    const sx = Math.floor(bw * rx);
    const sy = Math.floor(bh * ry);
    const sw = Math.max(24, Math.floor(bw * rw));
    const sh = Math.max(24, Math.floor(bh * rh));

    const cropCanvas = renderRegionToWhiteCanvas(baseCanvas, sx, sy, sw, sh, 760);

    if (detector) {
      try {
        const cropDetected = await detector.detect(cropCanvas);
        const match = cropDetected.find(d => Boolean(d.rawValue));
        if (match?.rawValue) return match.rawValue;
      } catch {
        // Ignore crop detector failure
      }
    }

    const normalHit = tryJsQr(cropCanvas, false);
    if (normalHit) return normalHit;

    const contrastHit = tryJsQr(cropCanvas, true);
    if (contrastHit) return contrastHit;

    // Yield periodically to keep spinner smooth
    if (i % 4 === 3) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return null;
}

export const CardScannerModal: React.FC<CardScannerModalProps> = ({ onClose, onVerifiedOpen }) => {
  const [mode, setMode] = useState<ScanMode>('camera');
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);
  const [verifiedData, setVerifiedData] = useState<any | null>(null);
  const [loadingVerify, setLoadingVerify] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Verifying Scanned Credential...');
  const [showIdCardModal, setShowIdCardModal] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const scanningRef = useRef<boolean>(true);
  const verifyingRef = useRef<boolean>(false);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const verifyCode = useCallback(
    async (rawCode: string): Promise<boolean> => {
      const lookupCode = extractVerificationCode(rawCode);
      if (!lookupCode) {
        setError('Scanned QR code does not contain a valid NexGen credential code.');
        return false;
      }

      verifyingRef.current = true;
      setLoadingVerify(true);
      setStatusMessage(`Checking official record for ${lookupCode}...`);
      setError(null);

      try {
        const res = await fetch(`/api/applications/verify/${encodeURIComponent(lookupCode)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Verification record not found.');
        }

        stopCamera();
        setVerifiedData(data);
        setSuccessCode(data.referenceCode || lookupCode);
        if (onVerifiedOpen) {
          onVerifiedOpen(data.referenceCode || lookupCode);
        }
        return true;
      } catch (err: any) {
        setError(err.message || 'Could not verify scanned credential code.');
        return false;
      } finally {
        verifyingRef.current = false;
        setLoadingVerify(false);
      }
    },
    [onVerifiedOpen, stopCamera]
  );

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Start Webcam stream when in camera mode
  useEffect(() => {
    if (mode !== 'camera' || successCode) {
      stopCamera();
      return;
    }

    let active = true;
    scanningRef.current = true;
    const detector = getNativeQrDetector();

    const startScanLoop = () => {
      let lastDetectAt = 0;

      const scanTick = async () => {
        if (!active || !scanningRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !verifyingRef.current) {
          const now = performance.now();
          if (now - lastDetectAt >= 120) {
            lastDetectAt = now;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              let detectedRaw: string | null = null;
              if (detector) {
                try {
                  const res = await detector.detect(canvas);
                  detectedRaw = res.find(r => Boolean(r.rawValue))?.rawValue || null;
                } catch {
                  detectedRaw = null;
                }
              }

              if (!detectedRaw) {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const qr = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'attemptBoth'
                });
                detectedRaw = qr?.data || null;
              }

              if (detectedRaw && active) {
                await verifyCode(detectedRaw);
                if (!active || !scanningRef.current) return;
              }
            }
          }
        }

        if (active && scanningRef.current) {
          animFrameRef.current = requestAnimationFrame(scanTick);
        }
      };

      animFrameRef.current = requestAnimationFrame(scanTick);
    };

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
      stopCamera();
    };
  }, [mode, successCode, verifyCode, stopCamera]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoadingVerify(true);
    setStatusMessage('Analyzing uploaded card file...');

    try {
      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        setStatusMessage('Rendering PDF pages & scanning QR code...');
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;

        const totalPages = Math.min(pdfDoc.numPages || 1, 6);
        // Official ID card Back (with QR) is Page 2, so inspect Page 2 first!
        const pageOrder: number[] = [];
        if (totalPages >= 2) pageOrder.push(2);
        for (let p = 1; p <= totalPages; p++) {
          if (p !== 2) pageOrder.push(p);
        }

        let foundRaw: string | null = null;

        for (const pageNum of pageOrder) {
          setStatusMessage(`Scanning PDF page ${pageNum} of ${pdfDoc.numPages}...`);
          const page = await pdfDoc.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });
          const renderScale = Math.min(
            3.5,
            Math.max(2.4, 2000 / Math.max(baseViewport.width, baseViewport.height, 1))
          );
          const viewport = page.getViewport({ scale: renderScale });

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = Math.round(viewport.width);
          pageCanvas.height = Math.round(viewport.height);
          const pctx = pageCanvas.getContext('2d', { willReadFrequently: true });

          if (pctx) {
            pctx.fillStyle = '#FFFFFF';
            pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            await page.render({ canvasContext: pctx, viewport, canvas: pageCanvas }).promise;

            foundRaw = await decodeQrFromCanvas(pageCanvas);
            if (foundRaw) break;
          }

          // Text content fallback for text-based PDFs
          try {
            const textContent = await page.getTextContent();
            const combinedText = textContent.items
              .map(item => ('str' in item ? item.str : ''))
              .join(' ');
            const codeMatch = combinedText.match(
              /(?:NXG-[A-Z0-9]{4}-[A-Z0-9]{4,8}|NG-VOL-[A-Z0-9]+)/i
            );
            if (codeMatch?.[0]) {
              foundRaw = codeMatch[0];
              break;
            }
          } catch {
            // Ignore text extraction error
          }
        }

        // PDF Metadata fallback
        if (!foundRaw) {
          try {
            const meta = await pdfDoc.getMetadata();
            const metaStr = JSON.stringify(meta?.info || {});
            const metaMatch = metaStr.match(
              /(?:NXG-[A-Z0-9]{4}-[A-Z0-9]{4,8}|NG-VOL-[A-Z0-9]+)/i
            );
            if (metaMatch?.[0]) {
              foundRaw = metaMatch[0];
            }
          } catch {
            // Ignore metadata fallback error
          }
        }

        if (foundRaw) {
          await verifyCode(foundRaw);
        } else {
          setError(
            'Could not detect a valid NexGen QR code in this PDF. Please upload the official 2-page PDF or Back Card image showing the QR code.'
          );
          setLoadingVerify(false);
        }
        return;
      }

      // Image upload flow (Dual PNG, Back Card PNG, screenshot, or camera photo)
      setStatusMessage('Scanning uploaded card image for QR code...');
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Failed to decode uploaded image'));
          el.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setError('Canvas rendering error while reading the uploaded image.');
          setLoadingVerify(false);
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const decodedRaw = await decodeQrFromCanvas(canvas);
        if (decodedRaw) {
          await verifyCode(decodedRaw);
        } else {
          setError(
            'No QR code detected in the uploaded image. Note: The QR code is located on Page 2 (Back) of your ID Card or the right side of the Dual PNG.'
          );
          setLoadingVerify(false);
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to process the uploaded file. Please try uploading a clear ID Card PDF or PNG/JPG image.'
      );
      setLoadingVerify(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleResetScan = () => {
    setSuccessCode(null);
    setVerifiedData(null);
    setError(null);
    scanningRef.current = true;
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
            aria-label="Close QR scanner"
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
                <span className="font-semibold text-white">
                  {verifiedData.assignedRole || 'Member NexGen Council'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">City / Chapter</span>
                <span className="font-semibold text-white">
                  {verifiedData.city || 'National Chapter'}
                </span>
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
                onClick={() => {
                  setError(null);
                  setMode('camera');
                }}
                className={`flex-1 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                  mode === 'camera'
                    ? 'bg-amber-400 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Live Camera Scan</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('upload');
                }}
                className={`flex-1 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                  mode === 'upload'
                    ? 'bg-amber-400 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
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
                    <span>{statusMessage}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative border-2 border-dashed border-slate-700 hover:border-amber-400/80 rounded-2xl p-8 text-center space-y-4 bg-slate-950/50 transition-colors">
                <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/30 text-amber-300 flex items-center justify-center mx-auto">
                  {loadingVerify ? (
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm text-white">Upload Member ID Card or PDF</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                    {loadingVerify
                      ? statusMessage
                      : 'Upload the 2-page ID Card PDF, Dual Card PNG, Back Card image, or a photo showing the QR code'}
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer shadow-md transition-colors">
                  <FileText className="w-4 h-4" />
                  <span>{loadingVerify ? 'Scanning QR Code...' : 'Choose Card Image / PDF'}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
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
          isPhotoLocked={Boolean(verifiedData.idCardPhotoLocked)}
          issuedAt={verifiedData.idCardIssuedAt}
          onClose={() => setShowIdCardModal(false)}
        />
      )}
    </div>
  );
};
