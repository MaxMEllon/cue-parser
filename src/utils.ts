import type { HMSTime } from './types.js';

/**
 * HMS (Hours:Minutes:Seconds) time format utilities
 */

/**
 * Parse HH:MM:SS time string format into HMSTime object
 * @param timeString - Time string in format "h:m:s" (e.g., "1:30:45")
 * @returns Parsed HMSTime object
 * @throws Error if format is invalid
 */
export function parseHMSTime(timeString: string): HMSTime {
  const trimmed = timeString.trim();
  const parts = trimmed.split(':');

  if (parts.length !== 3) {
    throw new Error(`Invalid time format: "${timeString}". Expected format: "h:m:s"`);
  }

  const [hoursStr, minutesStr, secondsStr] = parts;

  if (!hoursStr || !minutesStr || !secondsStr) {
    throw new Error(`Invalid time format: "${timeString}". Missing time components.`);
  }

  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  const seconds = parseInt(secondsStr, 10);

  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
    throw new Error(`Invalid time format: "${timeString}". All parts must be numbers.`);
  }

  if (hours < 0 || minutes < 0 || seconds < 0) {
    throw new Error(`Invalid time format: "${timeString}". All parts must be non-negative.`);
  }

  if (minutes >= 60) {
    throw new Error(`Invalid time format: "${timeString}". Minutes must be less than 60.`);
  }

  if (seconds >= 60) {
    throw new Error(`Invalid time format: "${timeString}". Seconds must be less than 60.`);
  }

  return { hour: hours, minute: minutes, second: seconds };
}

/**
 * Convert HMSTime object to string format "h:m:s"
 * @param time - HMSTime object
 * @param zeroPad - Whether to zero-pad values (default: true)
 * @returns Formatted time string
 */
export function formatHMSTime(time: HMSTime, zeroPad: boolean = true): string {
  if (zeroPad) {
    return `${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}:${time.second.toString().padStart(2, '0')}`;
  } else {
    return `${time.hour}:${time.minute}:${time.second}`;
  }
}

/**
 * Convert HMSTime object to CUE format string "MM:SS:FF"
 * In CUE format, we treat our HMSTime as Minutes:Seconds:Frames for compatibility
 * @param time - HMSTime object
 * @returns CUE format time string (MM:SS:FF)
 */
export function formatCueTime(time: HMSTime): string {
  // For CUE format, map hour->minutes, minute->seconds, second->frames
  const minutes = time.hour * 60 + time.minute;
  const seconds = time.second;
  const frames = 0;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

/**
 * Convert HMSTime to total seconds
 * @param time - HMSTime object
 * @returns Total time in seconds
 */
export function hmsToSeconds(time: HMSTime): number {
  return time.hour * 3600 + time.minute * 60 + time.second;
}

/**
 * Convert seconds to HMSTime
 * @param seconds - Time in seconds
 * @returns HMSTime object
 */
export function secondsToHMS(seconds: number): HMSTime {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const remainingSeconds = totalSeconds % 3600;
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  return { hour: hours, minute: mins, second: secs };
}

/**
 * Convert HMSTime to total seconds (alias for hmsToSeconds)
 * @param time - HMSTime object
 * @returns Total seconds
 */
export function msfToFrames(time: HMSTime): number {
  return hmsToSeconds(time);
}

/**
 * Convert total seconds to HMSTime (alias for secondsToHMS)
 * @param totalSeconds - Total seconds
 * @returns HMSTime object
 */
export function framesToMSF(totalSeconds: number): HMSTime {
  return secondsToHMS(totalSeconds);
}

/**
 * Add two HMSTime objects
 * @param time1 - First time
 * @param time2 - Second time
 * @returns Sum of the two times
 */
export function addHMSTime(time1: HMSTime, time2: HMSTime): HMSTime {
  const seconds1 = hmsToSeconds(time1);
  const seconds2 = hmsToSeconds(time2);
  return secondsToHMS(seconds1 + seconds2);
}

/**
 * Subtract time2 from time1
 * @param time1 - First time (minuend)
 * @param time2 - Second time (subtrahend)
 * @returns Difference (time1 - time2)
 * @throws Error if result would be negative
 */
export function subtractHMSTime(time1: HMSTime, time2: HMSTime): HMSTime {
  const seconds1 = hmsToSeconds(time1);
  const seconds2 = hmsToSeconds(time2);

  if (seconds1 < seconds2) {
    throw new Error('Cannot subtract: result would be negative');
  }

  return secondsToHMS(seconds1 - seconds2);
}

/**
 * Compare two HMSTime objects
 * @param time1 - First time
 * @param time2 - Second time
 * @returns -1 if time1 < time2, 0 if equal, 1 if time1 > time2
 */
export function compareHMSTime(time1: HMSTime, time2: HMSTime): -1 | 0 | 1 {
  const seconds1 = hmsToSeconds(time1);
  const seconds2 = hmsToSeconds(time2);

  if (seconds1 < seconds2) return -1;
  if (seconds1 > seconds2) return 1;
  return 0;
}