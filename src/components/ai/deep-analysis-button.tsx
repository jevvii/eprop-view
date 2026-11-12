"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  analyzeImageWithGemini,
  analyzeARSnapshotWithGemini,
} from "@/app/actions/gemini-analysis";

/** Deliberate submission only: live camera frames never call a paid/remote model. */
export function DeepAnalysisButton({
  imageId,
  anchorId,
}: {
  imageId?: string;
  anchorId?: string;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const analyze = async () => {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = anchorId
        ? await analyzeARSnapshotWithGemini(anchorId)
        : await analyzeImageWithGemini(imageId!);
      setMessage(
        `${result.provenance === "gemini" ? `Gemini (${result.model})` : "Heuristic fallback (non-ML)"}: ${result.summary}${result.fallbackReason ? ` ${result.fallbackReason}` : ""}`,
      );
      await Promise.all(
        [
          "ai-detections",
          "ai-detections-inspection",
          "all-ai-detections",
          "inspection-images",
          "inspections",
          "stats",
          "ar-anchors",
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Analysis failed. Existing findings have been retained.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="space-y-2 border-t border-slate-200 pt-3">
      <p className="text-xs text-slate-600">
        Deep analysis sends this saved photo to Google Gemini. Free-tier inputs
        may be reviewed to improve Google products. Use demonstration imagery
        only.
      </p>
      <p className="text-xs text-slate-600">
        Visual suggestions require engineer review. Photos do not measure crack
        width, concrete strength, tilt or settlement.
      </p>
      <button
        type="button"
        disabled={pending || (!imageId && !anchorId)}
        onClick={analyze}
        className="min-h-11 rounded-xl border border-primary px-4 py-2 text-xs font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        {pending ? "Analyzing saved photo…" : "Deep AI analysis"}
      </button>
      <p role="status" className="text-xs text-slate-700 whitespace-pre-line">
        {message}
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
