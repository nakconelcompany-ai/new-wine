// Category poster images (files live in /public/categories). Add a line here when a new poster is added.
// Categories without a poster fall back to a styled text heading.
export const BANNERS: Record<string, string> = {
  'best-dressed-male': '/categories/best-dressed-male.jpg',
  'voice-of-the-year-female': '/categories/voice-of-the-year-female.png',
  'voice-of-the-year-male': '/categories/voice-of-the-year-male.png',
  'upcoming-voice-male': '/categories/upcoming-voice-male.png',
  'upcoming-voice-female': '/categories/upcoming-voice-female.png',
  'upcoming-praise-leader-male': '/categories/upcoming-praise-leader-male.png',
  'upcoming-praise-leader-female': '/categories/upcoming-praise-leader-female.png',
  'most-compliant-uniform-male': '/categories/most-compliant-uniform-male.png',
  'most-compliant-uniform-female': '/categories/most-compliant-uniform-female.png',
  'most-dedicated-punctual-member': '/categories/most-dedicated-punctual-member.png',
};

export const SQUARE_POSTER_KEYS = new Set([
  'voice-of-the-year-female',
  'voice-of-the-year-male',
  'upcoming-voice-male',
  'upcoming-voice-female',
  'upcoming-praise-leader-male',
  'upcoming-praise-leader-female',
  'most-compliant-uniform-male',
  'most-compliant-uniform-female',
  'most-dedicated-punctual-member',
]);
