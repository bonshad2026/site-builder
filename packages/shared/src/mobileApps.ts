import {z} from 'zod';
export const mobileAppSlotSchema=z.enum(['customer','management']);
export const mobileAppUploadSchema=z.object({version:z.string().trim().min(1).max(40)});
