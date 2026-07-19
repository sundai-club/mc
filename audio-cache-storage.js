const fs = require('fs');
const path = require('path');

function localAudioCacheDir(appDirectory) {
  return path.join(appDirectory, 'audio-cache');
}

async function migrateLegacyAudioCache(legacyDirectory, targetDirectory) {
  if (path.resolve(legacyDirectory) === path.resolve(targetDirectory)) {
    return 0;
  }

  let entries;
  try {
    entries = await fs.promises.readdir(legacyDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  await fs.promises.mkdir(targetDirectory, { recursive: true });
  let migratedCount = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-z0-9_.-]+\.wav$/i.test(entry.name)) {
      continue;
    }

    const sourcePath = path.join(legacyDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);

    try {
      await fs.promises.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
      await fs.promises.unlink(sourcePath);
      migratedCount += 1;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  try {
    await fs.promises.rmdir(legacyDirectory);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) {
      throw error;
    }
  }

  return migratedCount;
}

module.exports = { localAudioCacheDir, migrateLegacyAudioCache };
