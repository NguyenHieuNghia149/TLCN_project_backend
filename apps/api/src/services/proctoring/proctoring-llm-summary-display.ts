type TimelineItem = {
  eventId: string;
  eventName: string;
  capturedAt: string | null;
};

type RiskFact = {
  type: string;
  count: number;
  totalDurationMs: number;
  evidenceEventIds: string[];
};

type Citation = {
  eventId: string;
  reason: string;
};

type ResolveDisplaySummaryInput = {
  examId?: string | null;
  participationId?: string | null;
  summaryText?: unknown;
  riskFacts?: unknown;
  citations?: unknown;
  missingDataNotes?: unknown;
  timeline?: unknown;
};

const EVENT_LABELS: Record<string, string> = {
  focus_lost: 'focus lost',
  focus_returned: 'focus returned',
  visibility_hidden: 'visibility hidden',
  visibility_visible: 'visibility visible',
  fullscreen_exit: 'fullscreen exited',
  fullscreen_enter: 'fullscreen entered',
  clipboard_event: 'clipboard event',
  camera_stopped: 'camera stopped',
  camera_started: 'camera started',
  camera_track_muted: 'camera muted',
  camera_track_unmuted: 'camera resumed',
  camera_permission_denied: 'camera permission denied',
  camera_error: 'camera error',
  screen_share_ended: 'screen share ended',
  screen_share_started: 'screen share started',
  bypass_code_used: 'bypass code used',
};

const VI_SIGNAL_LABELS: Array<[RegExp, string]> = [
  [/\bfocus lost\b/gi, 'roi cua so'],
  [/\bfocus returned\b/gi, 'tro lai cua so'],
  [/\bvisibility hidden\b/gi, 'an tab'],
  [/\bvisibility visible\b/gi, 'hien lai tab'],
  [/\bfullscreen exited\b/gi, 'thoat toan man hinh'],
  [/\bfullscreen entered\b/gi, 'vao lai toan man hinh'],
  [/\bclipboard event\b/gi, 'su kien clipboard'],
  [/\bcamera stopped\b/gi, 'tat camera'],
  [/\bcamera started\b/gi, 'bat camera'],
  [/\bcamera muted\b/gi, 'tat tieng camera'],
  [/\bcamera resumed\b/gi, 'bat lai camera'],
  [/\bcamera permission denied\b/gi, 'tu choi quyen camera'],
  [/\bcamera error\b/gi, 'loi camera'],
  [/\bscreen share ended\b/gi, 'tat chia se man hinh'],
  [/\bscreen share started\b/gi, 'bat chia se man hinh'],
  [/\bbypass code used\b/gi, 'da dung ma bo qua'],
  [/\bheartbeat\b/gi, 'heartbeat'],
  [/\bfinal flush\.request\b/gi, 'yeu cau final flush'],
];

const GENERIC_SUMMARY_PHRASES = [
  'anomaly facts',
  'exam with id',
  'summary for the exam',
  'anomaly summary',
];

function humanizeSignalName(value: string): string {
  return EVENT_LABELS[value] ?? value.replace(/_/g, ' ').trim();
}

function asRiskFacts(value: unknown): RiskFact[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (typeof record.type !== 'string' || typeof record.count !== 'number') {
      return [];
    }
    return [
      {
        type: record.type,
        count: record.count,
        totalDurationMs:
          typeof record.totalDurationMs === 'number' ? record.totalDurationMs : 0,
        evidenceEventIds: Array.isArray(record.evidenceEventIds)
          ? record.evidenceEventIds.filter(
              (entry): entry is string => typeof entry === 'string'
            )
          : [],
      },
    ];
  });
}

function asCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (typeof record.eventId !== 'string') {
      return [];
    }
    return [
      {
        eventId: record.eventId,
        reason: typeof record.reason === 'string' ? record.reason : 'summary evidence',
      },
    ];
  });
}

function asMissingDataNotes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function asTimeline(value: unknown): TimelineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (typeof record.eventId !== 'string' || typeof record.eventName !== 'string') {
      return [];
    }
    return [
      {
        eventId: record.eventId,
        eventName: record.eventName,
        capturedAt: typeof record.capturedAt === 'string' ? record.capturedAt : null,
      },
    ];
  });
}

function formatDurationMs(value: number): string {
  if (value <= 0) {
    return '0s';
  }
  const seconds = Math.floor(value / 1000);
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    return remSeconds ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  }
  return seconds > 0 ? `${seconds}s` : `${value}ms`;
}

function formatEventTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getUTCDate()).padStart(2, '0');
  const hh = String(parsed.getUTCHours()).padStart(2, '0');
  const mi = String(parsed.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function buildTeacherFacingSummary(input: ResolveDisplaySummaryInput): string {
  const timeline = [...asTimeline(input.timeline)].sort((a, b) =>
    String(a.capturedAt ?? '').localeCompare(String(b.capturedAt ?? ''))
  );
  const riskFacts = asRiskFacts(input.riskFacts);
  const citations = asCitations(input.citations);
  const missingDataNotes = asMissingDataNotes(input.missingDataNotes);
  const parts: string[] = [];

  if (riskFacts.length > 0) {
    const ranked = [...riskFacts]
      .sort((a, b) => b.count - a.count || b.totalDurationMs - a.totalDurationMs || a.type.localeCompare(b.type))
      .slice(0, 3);
    const segments = ranked.map(fact => {
      let segment = `${humanizeSignalName(fact.type)} x${fact.count}`;
      if (fact.totalDurationMs > 0) {
        segment += ` (${formatDurationMs(fact.totalDurationMs)})`;
      }
      return segment;
    });
    parts.push(`Review these signals: ${segments.join(', ')}.`);
  } else if (timeline.length > 0) {
    parts.push(
      'Review the timeline highlights below because structured risk facts were not extracted.'
    );
  } else {
    parts.push('No structured risk facts were extracted from the available telemetry.');
  }

  const lookup = new Map(timeline.map(item => [item.eventId, item]));
  const highlightSegments: string[] = [];
  const seen = new Set<string>();
  const appendHighlight = (item?: TimelineItem) => {
    if (!item) {
      return;
    }
    const label = humanizeSignalName(item.eventName);
    const time = formatEventTime(item.capturedAt);
    highlightSegments.push(time ? `${time} ${label}` : label);
  };

  for (const citation of citations) {
    if (seen.has(citation.eventId)) {
      continue;
    }
    seen.add(citation.eventId);
    appendHighlight(lookup.get(citation.eventId));
    if (highlightSegments.length >= 3) {
      break;
    }
  }

  if (highlightSegments.length === 0) {
    for (const item of timeline.slice(0, 3)) {
      appendHighlight(item);
      if (highlightSegments.length >= 3) {
        break;
      }
    }
  }

  if (highlightSegments.length > 0) {
    parts.push(`Timeline highlights: ${highlightSegments.join('; ')}.`);
  }

  if (missingDataNotes.length > 0) {
    parts.push(`Missing data: ${missingDataNotes.slice(0, 3).join('; ')}.`);
  }

  return parts.join(' ').trim();
}

function needsTeacherFacingRewrite(input: ResolveDisplaySummaryInput): boolean {
  const summaryText = String(input.summaryText ?? '').trim();
  if (!summaryText) {
    return true;
  }
  const lowered = summaryText.toLowerCase();
  if (GENERIC_SUMMARY_PHRASES.some(phrase => lowered.includes(phrase))) {
    return true;
  }
  if (input.examId && lowered.includes(input.examId.toLowerCase())) {
    return true;
  }
  if (input.participationId && lowered.includes(input.participationId.toLowerCase())) {
    return true;
  }

  const riskFacts = asRiskFacts(input.riskFacts);
  if (riskFacts.length > 0) {
    const hasSignalMention = riskFacts.some(fact =>
      lowered.includes(humanizeSignalName(fact.type).toLowerCase())
    );
    if (!hasSignalMention) {
      return true;
    }
  }

  const missingDataNotes = asMissingDataNotes(input.missingDataNotes);
  if (missingDataNotes.length > 0 && !lowered.includes('missing')) {
    return true;
  }

  return false;
}

export function resolveDisplayLlmSummaryText(input: ResolveDisplaySummaryInput): string {
  if (!needsTeacherFacingRewrite(input)) {
    return String(input.summaryText ?? '').trim();
  }
  return buildTeacherFacingSummary(input);
}

export function translateLlmSummaryTextToVietnamese(text: string): string {
  let translated = text.trim();
  translated = translated.replace(
    /^Review these signals:/i,
    'Can xem lai cac tin hieu sau:'
  );
  translated = translated.replace(
    /^Review the timeline highlights below because structured risk facts were not extracted\./i,
    'Can xem cac moc thoi gian duoi day vi chua trich xuat duoc risk fact co cau truc.'
  );
  translated = translated.replace(
    /^No structured risk facts were extracted from the available telemetry\./i,
    'Khong trich xuat duoc risk fact co cau truc tu telemetry hien co.'
  );
  translated = translated.replace(/^Timeline highlights:/i, 'Moc thoi gian noi bat:');
  translated = translated.replace(/^Missing data:/i, 'Du lieu con thieu:');

  for (const [pattern, replacement] of VI_SIGNAL_LABELS) {
    translated = translated.replace(pattern, replacement);
  }
  translated = translated.replace(/\band\b/gi, 'va');

  return translated;
}
