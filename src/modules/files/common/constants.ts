import { Plan } from '../../../../generated/prisma/enums';

export const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  //images
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',

  //documentss
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',

  //audio
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',

  //video
  'video/mp4',
  'video/quicktime',
];

export const LIFETIMES = {
  LONG: 'long',
  SHORT: 'short',
  MEDIUM: 'medium',
} as const;

export type Lifetime = (typeof LIFETIMES)[keyof typeof LIFETIMES];

export const ALLOWED_LIFETIMES: Record<Lifetime, number> = {
  [LIFETIMES.SHORT]: 7 * 24 * 60 * 60 * 1000,
  [LIFETIMES.MEDIUM]: 14 * 24 * 60 * 60 * 1000,
  [LIFETIMES.LONG]: 31 * 24 * 60 * 60 * 1000,
};

export const PLAN_INFO = {
  [Plan.PRO]: {
    MAX_FILE_SIZE_BYTES: MAX_FILE_SIZE_BYTES,
    MAX_FILE_SIZE_MB: MAX_FILE_SIZE_BYTES / (1024 * 1024),
    ALLOWED_LIFETIMES: [
      LIFETIMES.LONG,
      LIFETIMES.SHORT,
      LIFETIMES.MEDIUM,
    ] as Lifetime[],
  },
  [Plan.FREE]: {
    MAX_FILE_SIZE_MB: 25,
    MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024,
    ALLOWED_LIFETIMES: [LIFETIMES.SHORT] as Lifetime[],
  },
};
