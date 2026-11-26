declare module 'jsqr' {
  export interface QRCodeLocation {
    topLeftCorner: { x: number; y: number };
    topRightCorner: { x: number; y: number };
    bottomRightCorner: { x: number; y: number };
    bottomLeftCorner: { x: number; y: number };
  }

  export interface QRCodeResult {
    data: string;
    binaryData: Uint8ClampedArray;
    location: QRCodeLocation;
  }

  export default function jsQR(
    data: Uint8ClampedArray | Uint8Array | number[],
    width: number,
    height: number,
    options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }
  ): QRCodeResult | null;
}
