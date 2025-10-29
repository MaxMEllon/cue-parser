import type { MSFTime } from './types.js';

/**
 * MSF (Minutes:Seconds:Frames) time format utilities
 */

/**
 * Parse MSF time string format "m:s:f" into MSFTime object
 * @param timeString - Time string in format "m:s:f" (e.g., "1:30:45")
 * @returns Parsed MSFTime object
 * @throws Error if format is invalid
 */
export function parseMSFTime(timeString: string): MSFTime {
  const trimmed = timeString.trim();
  const parts = trimmed.split(':');

  if (parts.length !== 3) {
    throw new Error(`Invalid MSF time format: "${timeString}". Expected format: "m:s:f"`);
  }

  const [minutesStr, secondsStr, framesStr] = parts;

  if (!minutesStr || !secondsStr || !framesStr) {
    throw new Error(`Invalid MSF time format: "${timeString}". Missing time components.`);
  }

  const minutes = parseInt(minutesStr, 10);
  const seconds = parseInt(secondsStr, 10);
  const frames = parseInt(framesStr, 10);  if (isNaN(minutes) || isNaN(seconds) || isNaN(frames)) {
    throw new Error(`Invalid MSF time format: "${timeString}". All parts must be numbers.`);
  }

  if (minutes < 0 || seconds < 0 || frames < 0) {
    throw new Error(`Invalid MSF time format: "${timeString}". All parts must be non-negative.`);
  }

  if (seconds >= 60) {
    throw new Error(`Invalid MSF time format: "${timeString}". Seconds must be less than 60.`);
  }

  if (frames >= 75) {
    throw new Error(`Invalid MSF time format: "${timeString}". Frames must be less than 75.`);
  }

  return { minutes, seconds, frames };
}

/**
 * Convert MSFTime object to string format "m:s:f"
 * @param time - MSFTime object
 * @param zeroPad - Whether to zero-pad values (default: true)
 * @returns Formatted time string
 */
export function formatMSFTime(time: MSFTime, zeroPad: boolean = true): string {
  if (zeroPad) {
    return `${time.minutes.toString().padStart(2, '0')}:${time.seconds.toString().padStart(2, '0')}:${time.frames.toString().padStart(2, '0')}`;
  } else {
    return `${time.minutes}:${time.seconds}:${time.frames}`;
  }
}

/**
 * Convert MSFTime to total seconds (including fractional frames)
 * @param time - MSFTime object
 * @returns Total time in seconds as floating point number
 */
export function msfToSeconds(time: MSFTime): number {
  return time.minutes * 60 + time.seconds + time.frames / 75;
}

/**
 * Convert seconds to MSFTime
 * @param seconds - Time in seconds
 * @returns MSFTime object
 */
export function secondsToMSF(seconds: number): MSFTime {
  const totalFrames = Math.round(seconds * 75);
  const minutes = Math.floor(totalFrames / (75 * 60));
  const remainingFrames = totalFrames % (75 * 60);
  const secs = Math.floor(remainingFrames / 75);
  const frames = remainingFrames % 75;

  return { minutes, seconds: secs, frames };
}

/**
 * Convert MSFTime to total frames
 * @param time - MSFTime object
 * @returns Total frames
 */
export function msfToFrames(time: MSFTime): number {
  return time.minutes * 60 * 75 + time.seconds * 75 + time.frames;
}

/**
 * Convert total frames to MSFTime
 * @param totalFrames - Total frames
 * @returns MSFTime object
 */
export function framesToMSF(totalFrames: number): MSFTime {
  const minutes = Math.floor(totalFrames / (75 * 60));
  const remainingFrames = totalFrames % (75 * 60);
  const seconds = Math.floor(remainingFrames / 75);
  const frames = remainingFrames % 75;

  return { minutes, seconds, frames };
}

/**
 * Add two MSFTime objects
 * @param time1 - First time
 * @param time2 - Second time
 * @returns Sum of the two times
 */
export function addMSFTime(time1: MSFTime, time2: MSFTime): MSFTime {
  const frames1 = msfToFrames(time1);
  const frames2 = msfToFrames(time2);
  return framesToMSF(frames1 + frames2);
}

/**
 * Subtract time2 from time1
 * @param time1 - First time (minuend)
 * @param time2 - Second time (subtrahend)
 * @returns Difference (time1 - time2)
 * @throws Error if result would be negative
 */
export function subtractMSFTime(time1: MSFTime, time2: MSFTime): MSFTime {
  const frames1 = msfToFrames(time1);
  const frames2 = msfToFrames(time2);

  if (frames1 < frames2) {
    throw new Error('Cannot subtract: result would be negative');
  }

  return framesToMSF(frames1 - frames2);
}

/**
 * Compare two MSFTime objects
 * @param time1 - First time
 * @param time2 - Second time
 * @returns -1 if time1 < time2, 0 if equal, 1 if time1 > time2
 */
export function compareMSFTime(time1: MSFTime, time2: MSFTime): -1 | 0 | 1 {
  const frames1 = msfToFrames(time1);
  const frames2 = msfToFrames(time2);

  if (frames1 < frames2) return -1;
  if (frames1 > frames2) return 1;
  return 0;
}