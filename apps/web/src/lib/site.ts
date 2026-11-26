/** Public company details, read from environment variables. Empty or "-" means "not set". */
const v = (x?: string) => { const t = (x ?? '').trim(); return t === '-' ? '' : t; };

export const SITE = {
  name: 'FundiLink',
  company: v(process.env.NEXT_PUBLIC_COMPANY_NAME) || 'Intonel Enterprise',
  supportEmail: v(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) || 'hello@intonelenterprise.com',
  supportPhone: v(process.env.NEXT_PUBLIC_SUPPORT_PHONE),
  whatsapp: v(process.env.NEXT_PUBLIC_WHATSAPP),
  address: v(process.env.NEXT_PUBLIC_COMPANY_ADDRESS),
  hours: v(process.env.NEXT_PUBLIC_SUPPORT_HOURS) || 'Monday to Saturday, 8:00 to 18:00 EAT',
  odpcRegistration: v(process.env.NEXT_PUBLIC_ODPC_REG),
  social: {
    x: v(process.env.NEXT_PUBLIC_SOCIAL_X),
    instagram: v(process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM),
    facebook: v(process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK),
    linkedin: v(process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN),
  },
};