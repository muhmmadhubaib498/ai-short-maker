import express, { Express, Response } from 'express';
import path from 'path';
import { OUTPUT_DIR, CLIPS_OUTPUT_DIR, STORAGE_OUTPUT_DIR, streamMediaFile, resolveClipFilePath } from './mediaStream';
import { db } from './db';

// Re-export media streaming utilities, directory constants, and server configuration
export { OUTPUT_DIR, CLIPS_OUTPUT_DIR, STORAGE_OUTPUT_DIR, streamMediaFile, resolveClipFilePath } from './mediaStream';
export { videoProcessor } from './videoProcessor';
export { db } from './db';
export { jobQueue } from './jobs';
export { aiService } from './aiService';

