import { z } from 'zod';

export const platformSchema = z.enum(['TikTok', 'Instagram', 'LinkedIn']);
export const formatSchema = z.enum(['Affiche', 'Story', 'Carrousel', 'Video', 'Reel', 'Motion']);
