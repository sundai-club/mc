'use strict';

const { PitchObservationTracker } = require('./pitch-observation-tracker');

const EVENTS_URL = 'https://www.sundai.club/api/events';
const PROJECTS_URL = 'https://www.sundai.club/projects';
const PITCH_URL = 'https://www.sundai.club/pitch';
const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_EVENTS_REFRESH_MS = 5 * 60_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function normalizeTitle(value) {
  if (typeof value !== 'string') return null;
  const title = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return title || null;
}

function selectLatestEvent(events) {
  if (!Array.isArray(events)) throw new Error('Sundai events response is not an array');

  return events
    .filter((event) => (
      event &&
      EVENT_ID_PATTERN.test(event.id) &&
      Number.isFinite(Date.parse(event.startTime))
    ))
    .sort((left, right) => Date.parse(right.startTime) - Date.parse(left.startTime))[0] || null;
}

function extractProjectAuthors(project) {
  if (!project || typeof project !== 'object') return [];

  const people = [
    project.launchLead,
    ...(Array.isArray(project.participants)
      ? project.participants.map((participant) => participant?.hacker)
      : [])
  ];
  const seenIds = new Set();
  const seenNames = new Set();

  return people.reduce((authors, person) => {
    const name = normalizeTitle(person?.name || person?.username);
    if (!name) return authors;
    const id = typeof person?.id === 'string' ? person.id : null;
    const normalizedName = name.toLocaleLowerCase();
    if ((id && seenIds.has(id)) || seenNames.has(normalizedName)) return authors;
    if (id) seenIds.add(id);
    seenNames.add(normalizedName);
    authors.push(name);
    return authors;
  }, []);
}

function extractPitchSnapshot(event) {
  if (!event || !EVENT_ID_PATTERN.test(event.id)) {
    throw new Error('Sundai event response is invalid');
  }

  const projects = Array.isArray(event.projects) ? event.projects : [];
  const current = projects.find((item) => item && item.status === 'CURRENT') || null;
  const projectId = EVENT_ID_PATTERN.test(current?.project?.id) ? current.project.id : null;

  return {
    eventId: event.id,
    eventUrl: `${PITCH_URL}/${event.id}`,
    eventTitle: normalizeTitle(event.title) || 'Untitled Sundai event',
    eventPhase: normalizeTitle(event.phase),
    projectId,
    projectUrl: projectId ? `${PROJECTS_URL}/${projectId}` : null,
    projectTitle: normalizeTitle(current?.project?.title),
    projectAuthors: extractProjectAuthors(current?.project),
    pitchPhase: normalizeTitle(current?.pitchPhase)
  };
}

function sanitizeRecordingProject(metadata) {
  if (!metadata || !EVENT_ID_PATTERN.test(metadata.projectId)) return null;

  const projectTitle = normalizeTitle(metadata.projectTitle);
  if (!projectTitle) return null;
  const eventId = EVENT_ID_PATTERN.test(metadata.eventId) ? metadata.eventId : null;
  const projectAuthors = Array.isArray(metadata.projectAuthors)
    ? [...new Set(metadata.projectAuthors.map(normalizeTitle).filter(Boolean))].slice(0, 30)
    : [];
  const observedDurationMs = Number.isFinite(metadata.observedDurationMs)
    ? Math.max(0, Math.round(metadata.observedDurationMs))
    : 0;

  return {
    projectId: metadata.projectId,
    projectTitle,
    projectUrl: `${PROJECTS_URL}/${metadata.projectId}`,
    projectAuthors,
    eventId,
    eventTitle: normalizeTitle(metadata.eventTitle),
    eventUrl: eventId ? `${PITCH_URL}/${eventId}` : null,
    observedDurationMs,
    selectionStrategy: 'longest-observed-current-project'
  };
}

class SundaiPitchClient {
  constructor({
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    eventsRefreshMs = DEFAULT_EVENTS_REFRESH_MS,
    now = Date.now
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.eventsRefreshMs = eventsRefreshMs;
    this.now = now;
    this.cachedEvent = null;
    this.cachedEventAt = 0;
  }

  async fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Sundai API returned HTTP ${response.status}`);

      const declaredLength = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw new Error('Sundai API response is too large');
      }

      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) {
        throw new Error('Sundai API response is too large');
      }
      return JSON.parse(body);
    } finally {
      clearTimeout(timeout);
    }
  }

  async getLatestEvent() {
    const now = this.now();
    if (this.cachedEvent && now - this.cachedEventAt < this.eventsRefreshMs) {
      return this.cachedEvent;
    }

    const latestEvent = selectLatestEvent(await this.fetchJson(EVENTS_URL));
    if (!latestEvent) throw new Error('Sundai API returned no dated events');
    this.cachedEvent = latestEvent;
    this.cachedEventAt = now;
    return latestEvent;
  }

  async getCurrentPitch() {
    const latestEvent = await this.getLatestEvent();
    const event = await this.fetchJson(`${EVENTS_URL}/${encodeURIComponent(latestEvent.id)}`);
    return extractPitchSnapshot(event);
  }
}

module.exports = {
  EVENTS_URL,
  PROJECTS_URL,
  PITCH_URL,
  PitchObservationTracker,
  SundaiPitchClient,
  extractPitchSnapshot,
  extractProjectAuthors,
  normalizeTitle,
  sanitizeRecordingProject,
  selectLatestEvent
};
