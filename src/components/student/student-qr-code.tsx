"use client";

import { QRCodeSVG } from "qrcode.react";

export default function StudentQrCode({ value, codeId }: { value: string; codeId: string }) {
  return <QRCodeSVG value={value} size={220} level="M" includeMargin aria-label={`QR code personnel ${codeId}`} />;
}
