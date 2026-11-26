// apps/web/lib/problems.ts
export const PROBLEMS: { 
  icon: 'droplet' | 'sparkles' | 'truck' | 'zap' | 'brush' | 'snowflake'; 
  title: string; 
  hint: string; 
  nl: string 
}[] = [
  { icon: 'droplet', title: 'Leaking pipe?', hint: 'Plumbers who can come today', nl: 'I have a leaking pipe and need a plumber today' },
  { icon: 'sparkles', title: 'Need a deep clean?', hint: 'Homes, offices and move-outs', nl: 'I need a deep clean for my home' },
  { icon: 'truck', title: 'Moving house?', hint: 'Movers with transport included', nl: 'I need movers for moving house' },
  { icon: 'zap', title: 'Power problem?', hint: 'Licensed electricians', nl: 'I need an electrician for a power fault' },
  { icon: 'brush', title: 'Repainting?', hint: 'Compare quotes from painters', nl: 'I need a painter for a three-bedroom apartment' },
  { icon: 'snowflake', title: 'Fridge or AC broken?', hint: 'Appliance repair near you', nl: 'My fridge stopped cooling and I need a repair' },
];
