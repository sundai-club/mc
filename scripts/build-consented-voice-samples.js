#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const speakerSlug = process.argv[2] || 'frido';
if (!/^[a-z0-9_]+$/.test(speakerSlug)) {
  throw new Error(`Invalid speaker slug: ${speakerSlug}`);
}
const sampleDir = path.join(projectRoot, 'voice_samples', speakerSlug);
const manifestPath = path.join(sampleDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const outputPrefix = manifest.outputPrefix || speakerSlug;
const sourcePath = path.resolve(sampleDir, manifest.sourceVideo);
const referenceSourcePath = manifest.reference?.sourceAudio
  ? path.resolve(sampleDir, manifest.reference.sourceAudio)
  : sourcePath;
const segmentDir = path.join(sampleDir, 'segments');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Source video not found: ${sourcePath}`);
}
if (!fs.existsSync(referenceSourcePath)) {
  throw new Error(`Reference audio source not found: ${referenceSourcePath}`);
}

fs.mkdirSync(segmentDir, { recursive: true });

for (const segment of manifest.segments) {
  if (!/^[a-z0-9_]+$/i.test(segment.id) ||
      !Number.isFinite(segment.start) || !Number.isFinite(segment.end) ||
      segment.start < 0 || segment.end <= segment.start) {
    throw new Error(`Invalid segment: ${JSON.stringify(segment)}`);
  }

  const outputPath = path.join(segmentDir, `${segment.id}.wav`);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(segment.start), '-to', String(segment.end),
    '-i', sourcePath,
    '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le',
    '-af', 'highpass=f=70,lowpass=f=11500,loudnorm=I=-18:TP=-2:LRA=7',
    outputPath
  ]);
}

const segmentPaths = manifest.segments.map(segment =>
  path.join(segmentDir, `${segment.id}.wav`));
const filterParts = segmentPaths.map((_, index) =>
  `[${index}:a]apad=pad_dur=0.2[a${index}]`);
filterParts.push(
  `${segmentPaths.map((_, index) => `[a${index}]`).join('')}concat=n=${segmentPaths.length}:v=0:a=1[out]`
);

const combinedWav = path.join(sampleDir, `${outputPrefix}_all_samples.wav`);
run('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  ...segmentPaths.flatMap(segmentPath => ['-i', segmentPath]),
  '-filter_complex', filterParts.join(';'),
  '-map', '[out]', '-c:a', 'pcm_s16le', combinedWav
]);

run('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', combinedWav, '-c:a', 'libmp3lame', '-b:a', '192k',
  path.join(sampleDir, `${outputPrefix}_all_samples.mp3`)
]);

if (!manifest.reference || !Number.isFinite(manifest.reference.start) ||
    !Number.isFinite(manifest.reference.end) ||
    manifest.reference.end <= manifest.reference.start ||
    typeof manifest.reference.transcript !== 'string' || !manifest.reference.transcript.trim()) {
  throw new Error('Invalid voice-clone reference metadata');
}

run('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-ss', String(manifest.reference.start), '-to', String(manifest.reference.end),
  '-i', referenceSourcePath,
  '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le',
  '-af', 'highpass=f=70,lowpass=f=11500,loudnorm=I=-18:TP=-2:LRA=7',
  path.join(sampleDir, `${outputPrefix}_reference.wav`)
]);
fs.writeFileSync(
  path.join(sampleDir, `${outputPrefix}_reference.txt`),
  `${manifest.reference.transcript.trim()}\n`,
  'utf8'
);

console.log(`Built ${manifest.segments.length} isolated clips.`);
console.log(`Combined WAV: ${combinedWav}`);
