"use client";

import { useParams } from "next/navigation";
import { CaptureForm } from "@/components/CaptureForm";

export default function CaptureContinue() {
  const params = useParams<{ clientId: string }>();
  return <CaptureForm clientRecordId={params.clientId} />;
}
