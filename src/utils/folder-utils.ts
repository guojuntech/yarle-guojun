import fs from 'fs';
import fsExtra from 'fs-extra';
import * as path from 'path';

import { Path } from '../paths';
import { yarleOptions } from '../yarle';

import { getNoteFileName, getNoteName, getUniqueId, normalizeFilenameString } from './filename-utils';
import { OutputFormat } from './../output-format';
import { RuntimePropertiesSingleton } from './../runtime-properties';
import { EvernoteNoteData } from '../models';
import { loggerInfo } from './loggerInfo';

export const paths: Path = {};
const MAX_PATH = 249;

const truncateUtf8 = (value: string, maxBytes: number): string => {
  let truncated = '';
  let bytes = 0;

  for (const char of value) {
    const charBytes = Buffer.byteLength(char);
    if (bytes + charBytes > maxBytes) {
      break;
    }
    truncated += char;
    bytes += charBytes;
  }

  return truncated;
};

export const getResourceDir = (dstPath: string, note: EvernoteNoteData): string => {
  return getNoteName(dstPath, note).replace(/\s/g, '_').substr(0, 50);
};

export const truncatFileName = (fileName: string, uniqueId: string): string => {

  if (fileName.length <= 11) {
    throw Error('FATAL: note folder directory path exceeds the OS limitation. Please pick a destination closer to the root folder.');
  }

  const fullPath = `${getNotesPath()}${path.sep}${fileName}`;

  if (Buffer.byteLength(fullPath) <  MAX_PATH) {
    return fileName;
  }

  const extension = path.extname(fileName) || '.md';
  const fileNamePrefix = extension ? fileName.slice(0, -extension.length) : fileName;
  const suffix = `_${uniqueId}${extension}`;
  const maxPrefixLength = MAX_PATH - Buffer.byteLength(`${getNotesPath()}${path.sep}`) - Buffer.byteLength(suffix);

  if (maxPrefixLength <= 0) {
    throw Error('FATAL: note folder directory path exceeds the OS limitation. Please pick a destination closer to the root folder.');
  }

  return `${truncateUtf8(fileNamePrefix, maxPrefixLength)}${suffix}`;
};

const truncateFilePath = (dstPath: string, note: EvernoteNoteData, fileName: string): string => {
  const noteIdNameMap = RuntimePropertiesSingleton.getInstance();

  const noteIdMap = noteIdNameMap.getNoteIdNameMapByNoteTitle(normalizeFilenameString(note.title))[0] || {uniqueEnd: getUniqueId()};


  if (fileName.length <= 11) {
    throw Error('FATAL: note folder directory path exceeds the OS limitation. Please pick a destination closer to the root folder.');
  }

  const extension = path.extname(fileName);
  const fileNamePrefix = extension ? fileName.slice(0, -extension.length) : fileName;
  const suffix = `_${noteIdMap.uniqueEnd}${extension}`;
  const maxPrefixLength = MAX_PATH - Buffer.byteLength(`${dstPath}${path.sep}`) - Buffer.byteLength(suffix);

  if (maxPrefixLength <= 0) {
    throw Error('FATAL: note folder directory path exceeds the OS limitation. Please pick a destination closer to the root folder.');
  }

  return `${dstPath}${path.sep}${truncateUtf8(fileNamePrefix, maxPrefixLength)}${suffix}`;
};

const getFilePath = (dstPath: string, note: EvernoteNoteData, extension: string): string => {
  const fileName = getNoteFileName(dstPath, note, extension);
  const fullFilePath = `${dstPath}${path.sep}${fileName}`;

  return Buffer.byteLength(fullFilePath) < MAX_PATH ? fullFilePath : truncateFilePath(dstPath, note, fileName);
};

export const getMdFilePath = (note: EvernoteNoteData): string => {
  return getFilePath(paths.mdPath, note, 'md');
};

export const getJsonFilePath = (note: EvernoteNoteData): string => {
  return getFilePath(paths.mdPath, note, 'json');
};
export const getHtmlFilePath = (note: EvernoteNoteData): string => {
  return getFilePath(paths.resourcePath, note, 'html');
};

export const getHtmlFileLink = (note: EvernoteNoteData): string => {
  const filePath = getHtmlFilePath(note);
  const relativePath = `.${filePath.slice(paths.resourcePath.lastIndexOf(path.sep))}`;
  if (yarleOptions.posixHtmlPath && path.sep !== path.posix.sep) {
    return relativePath.split(path.sep).join(path.posix.sep);
  }
  return relativePath;
};

const clearDistDir = (dstPath: string): void => {
  if (fs.existsSync(dstPath)) {
    fsExtra.removeSync(dstPath);
  }
  fs.mkdirSync(dstPath);
};

export const getRelativeResourceDir = (note: EvernoteNoteData): string => {
  const enexFolder = `${path.sep}${yarleOptions.resourcesDir}`;
  if (yarleOptions.haveGlobalResources) {
    return `..${enexFolder}`;
  }

  return yarleOptions.haveEnexLevelResources
    ? `.${enexFolder}`
    : `.${enexFolder}${path.sep}${getResourceDir(paths.mdPath, note)}.resources`;
};

export const createRootOutputDir = (): void => {
  const outputDir = path.isAbsolute(yarleOptions.outputDir)
  ? yarleOptions.outputDir
  : `${process.cwd()}${path.sep}${yarleOptions.outputDir}`;
  fsExtra.mkdirsSync(outputDir)
}
export const getAbsoluteResourceDir = (note: EvernoteNoteData): string => {
  if (yarleOptions.haveGlobalResources) {
    return path.resolve(paths.resourcePath, '..', '..', yarleOptions.resourcesDir);
  }

  return yarleOptions.haveEnexLevelResources
    ? paths.resourcePath
    : `${paths.resourcePath}${path.sep}${getResourceDir(paths.mdPath, note)}.resources`;
};

const resourceDirClears = new Map<string, number>();
export const clearResourceDir = (note: EvernoteNoteData): void => {
  const resPath = getAbsoluteResourceDir(note);
  if (!resourceDirClears.has(resPath)) {
    resourceDirClears.set(resPath, 0);
  }

  const clears = resourceDirClears.get(resPath);
  // we're sharing a resource dir, so we can can't clean it more than once
  if ((yarleOptions.haveEnexLevelResources || yarleOptions.haveGlobalResources) && clears >= 1) {
    return;
  }

  clearDistDir(resPath);
  resourceDirClears.set(resPath, clears + 1);
};

export const clearResourceDistDir = (): void => {
  clearDistDir(paths.resourcePath);
};
export const clearMdNotesDistDir = (): void => {
  clearDistDir(paths.mdPath);
};

export const setPaths = (enexSource: string): void => {
  // loggerInfo('setting paths');
  const enexFolder = enexSource.split(path.sep);
  // loggerInfo(`enex folder split: ${JSON.stringify(enexFolder)}`);
  let enexFile = (enexFolder.length >= 1 ?  enexFolder[enexFolder.length - 1] : enexFolder[0]).split(/.enex$/)[0];
  enexFile = normalizeFilenameString(enexFile);
  // loggerInfo(`enex file: ${enexFile}`);

  const outputDir = path.isAbsolute(yarleOptions.outputDir)
    ? yarleOptions.outputDir
    : `${process.cwd()}${path.sep}${yarleOptions.outputDir}`;

  paths.mdPath = `${outputDir}${path.sep}notes${path.sep}`;
  paths.resourcePath = `${outputDir}${path.sep}notes${path.sep}${yarleOptions.resourcesDir}`;

  // loggerInfo(`Skip enex filename from output? ${yarleOptions.skipEnexFileNameFromOutputPath}`);
  if (!yarleOptions.skipEnexFileNameFromOutputPath) {
    paths.mdPath = `${paths.mdPath}${enexFile}`;
    // loggerInfo(`mdPath: ${paths.mdPath}`);
    paths.resourcePath = `${outputDir}${path.sep}notes${path.sep}${enexFile}${path.sep}${yarleOptions.resourcesDir}`;
  }

  if (yarleOptions.outputFormat === OutputFormat.LogSeqMD) {
    const folderName = yarleOptions.logseqSettings.journalNotes ? 'journal' : 'pages';
    paths.mdPath = `${outputDir}${path.sep}${folderName}${path.sep}`;
    paths.resourcePath = `${outputDir}${path.sep}${yarleOptions.resourcesDir}`;
  }

  fsExtra.mkdirsSync(paths.mdPath);
  if ((!yarleOptions.haveEnexLevelResources && !yarleOptions.haveGlobalResources) ||
    yarleOptions.outputFormat === OutputFormat.LogSeqMD) {
    fsExtra.mkdirsSync(paths.resourcePath);
  }
  loggerInfo(`path ${paths.mdPath} created`);
  // clearDistDir(paths.simpleMdPath);
  // clearDistDir(paths.complexMdPath);
};

export const getNotesPath = (): string => {
  return paths.mdPath;
};
