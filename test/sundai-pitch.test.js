const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EVENTS_URL,
  PitchObservationTracker,
  SundaiPitchClient,
  extractPitchSnapshot,
  sanitizeRecordingProject,
  selectLatestEvent
} = require('../sundai-pitch');

const olderId = '00000000-0000-4000-8000-000000000001';
const latestId = '00000000-0000-4000-8000-000000000002';
const projectId = '11111111-1111-4111-8111-111111111111';

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(value)
  };
}

test('selects the newest valid Sundai event by start time', () => {
  assert.equal(selectLatestEvent([
    { id: olderId, startTime: '2024-01-01T00:00:00.000Z' },
    { id: 'not-an-event-id', startTime: '2025-01-01T00:00:00.000Z' },
    { id: latestId, startTime: '2024-02-01T00:00:00.000Z' }
  ]).id, latestId);
});

test('extracts the CURRENT queue item and safely normalizes its title', () => {
  assert.deepEqual(extractPitchSnapshot({
    id: latestId,
    title: '  Example\nEvent  ',
    phase: 'PITCHING',
    projects: [
      { status: 'DONE', project: { title: 'Previous project' } },
      {
        status: 'CURRENT',
        pitchPhase: 'PRESENTING',
        project: {
          id: projectId,
          title: '  Example\nProject  ',
          launchLead: { id: 'lead-1', name: 'Lead Author' },
          participants: [
            { hacker: { id: 'member-2', name: 'Second Author' } },
            { hacker: { id: 'lead-1', name: 'Lead Author' } }
          ]
        }
      }
    ]
  }), {
    eventId: latestId,
    eventUrl: `https://www.sundai.club/pitch/${latestId}`,
    eventTitle: 'Example Event',
    eventPhase: 'PITCHING',
    projectId,
    projectUrl: `https://www.sundai.club/projects/${projectId}`,
    projectTitle: 'Example Project',
    projectAuthors: ['Lead Author', 'Second Author'],
    pitchPhase: 'PRESENTING'
  });
});

test('polls event details while caching the large events index', async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);
    if (url === EVENTS_URL) {
      return jsonResponse([{ id: latestId, startTime: '2024-02-01T00:00:00.000Z' }]);
    }
    return jsonResponse({
      id: latestId,
      title: 'Example Event',
      phase: 'PITCHING',
      projects: [{
        status: 'CURRENT',
        pitchPhase: 'QUESTIONS',
        project: { id: projectId, title: 'Example Project', launchLead: { name: 'Lead Author' } }
      }]
    });
  };
  const client = new SundaiPitchClient({ fetchImpl, now: () => 1000 });

  assert.equal((await client.getCurrentPitch()).projectTitle, 'Example Project');
  const secondPitch = await client.getCurrentPitch();
  assert.deepEqual(secondPitch.projectAuthors, ['Lead Author']);
  assert.equal(secondPitch.pitchPhase, 'QUESTIONS');
  assert.deepEqual(requestedUrls, [EVENTS_URL, `${EVENTS_URL}/${latestId}`, `${EVENTS_URL}/${latestId}`]);
});

test('selects the project observed for most of a recording', () => {
  let now = 0;
  const tracker = new PitchObservationTracker({ now: () => now });
  const snapshot = (id, title) => ({
    eventId: latestId,
    eventTitle: 'Example Event',
    projectId: id,
    projectTitle: title,
    projectAuthors: [`${title} Author`]
  });
  const previousId = '22222222-2222-4222-8222-222222222222';
  const actualId = '33333333-3333-4333-8333-333333333333';
  const nextId = '44444444-4444-4444-8444-444444444444';

  tracker.start(snapshot(previousId, 'Previous Project'));
  now = 5_000;
  tracker.observe(snapshot(actualId, 'Actual Project'));
  now = 55_000;
  tracker.observe(snapshot(nextId, 'Next Project'));
  now = 60_000;

  const selectedProject = tracker.finish();
  assert.equal(selectedProject.projectId, actualId);
  assert.equal(selectedProject.projectTitle, 'Actual Project');
  assert.equal(selectedProject.observedDurationMs, 50_000);

  assert.deepEqual(sanitizeRecordingProject(selectedProject), {
    projectId: actualId,
    projectTitle: 'Actual Project',
    projectUrl: `https://www.sundai.club/projects/${actualId}`,
    projectAuthors: ['Actual Project Author'],
    eventId: latestId,
    eventTitle: 'Example Event',
    eventUrl: `https://www.sundai.club/pitch/${latestId}`,
    observedDurationMs: 50_000,
    selectionStrategy: 'longest-observed-current-project'
  });
});
