"use client";

import type { BilingualParentReport } from "@/lib/parentReportGemini";
import { useState } from "react";

const REPORT_TAB_STORAGE_KEY = "voicebot-parent-report-tab";

export type ParentReportBilingualPayload = BilingualParentReport;

export type ParentReportPanelLabels = {
  title: string;
  subtitle: string;
  subtitleBilingual: string;
  tabEnglish: string;
  tabHeritage: string;
  reportSideUnavailable: string;
  close: string;
  closeAria: string;
};

type ParentReportPanelProps = {
  open: boolean;
  globalError: string | null;
  report: BilingualParentReport | null;
  labels: ParentReportPanelLabels;
  onClose: () => void;
};

type TabId = "en" | "heritage";

export function ParentReportPanel({
  open,
  globalError,
  report,
  labels,
  onClose,
}: ParentReportPanelProps) {
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === "undefined") {
      return "en";
    }
    const v = sessionStorage.getItem(REPORT_TAB_STORAGE_KEY);
    return v === "heritage" ? "heritage" : "en";
  });

  const selectTab = (next: TabId) => {
    setTab(next);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(REPORT_TAB_STORAGE_KEY, next);
    }
  };

  const showTabs = report !== null && !globalError;

  const bodyForTab = (id: TabId): string | null => {
    if (!report) {
      return null;
    }
    return id === "en" ? report.en : report.heritage;
  };

  const errorForTab = (id: TabId): string | null => {
    if (!report) {
      return null;
    }
    return id === "en" ? report.errorEn : report.errorHeritage;
  };

  const activeBody = bodyForTab(tab);
  const activeError = globalError ?? errorForTab(tab);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 transition-all duration-500 ease-out ${
        open
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      }`}
      aria-hidden={!open}
    >
      <div
        className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-report-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2
              id="parent-report-title"
              className="text-lg font-bold tracking-tight text-slate-800"
            >
              {labels.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {showTabs ? labels.subtitleBilingual : labels.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label={labels.closeAria}
          >
            {labels.close}
          </button>
        </div>

        {showTabs && (
          <div
            className="flex gap-1 border-b border-slate-100 px-5 pt-3"
            role="tablist"
            aria-label={labels.subtitleBilingual}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "en"}
              className={`rounded-t-lg px-3 py-2 text-sm font-semibold transition ${
                tab === "en"
                  ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => {
                selectTab("en");
              }}
            >
              {labels.tabEnglish}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "heritage"}
              className={`rounded-t-lg px-3 py-2 text-sm font-semibold transition ${
                tab === "heritage"
                  ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => {
                selectTab("heritage");
              }}
            >
              {labels.tabHeritage}
            </button>
          </div>
        )}

        <div className="max-h-[min(52vh,420px)] overflow-y-auto px-5 py-4" role="tabpanel">
          {activeError && (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {activeError}
            </p>
          )}

          {activeBody && (
            <div className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-slate-700">
              {activeBody}
            </div>
          )}

          {showTabs && !activeBody && !activeError && (
            <p className="text-sm text-slate-500">{labels.reportSideUnavailable}</p>
          )}
        </div>
      </div>
    </div>
  );
}
