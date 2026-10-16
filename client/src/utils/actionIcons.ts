import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  CloudLightning,
  Gamepad2,
  Gift,
  Globe,
  Heart,
  ListChecks,
  MapPin,
  MessageSquare,
  Package,
  Shield,
  ShieldOff,
  Skull,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Trash2,
  UserX,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Wand2,
  Zap
} from 'lucide-react';

/** Icons a game pack can reference by name in `playerActions[].icon` and `playerLists[].icon`. Unknown names fall back to a wand. */
export const PLAYER_ACTION_ICONS: Record<string, LucideIcon> = {
  ban: Ban,
  'cloud-lightning': CloudLightning,
  gamepad: Gamepad2,
  gift: Gift,
  globe: Globe,
  heart: Heart,
  'list-checks': ListChecks,
  'map-pin': MapPin,
  message: MessageSquare,
  package: Package,
  shield: Shield,
  'shield-off': ShieldOff,
  skull: Skull,
  snowflake: Snowflake,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  trash: Trash2,
  'user-x': UserX,
  users: Users,
  utensils: Utensils,
  'volume-2': Volume2,
  'volume-x': VolumeX,
  zap: Zap
};

export const actionIcon = (name: string | undefined): LucideIcon => (name && PLAYER_ACTION_ICONS[name]) || Wand2;
