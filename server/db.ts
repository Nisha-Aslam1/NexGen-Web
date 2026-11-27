import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  User,
  VolunteerApplication,
  Volunteer,
  Program,
  EventItem,
  NewsItem,
  TeamMember,
  GalleryItem,
  FaqItem,
  ContactMessage,
  WebsiteSettings,
  ActivityLog,
  DashboardStats,
  Meeting,
  MeetingParticipant,
  MeetingMessage,
  MeetingAttendance,
  AdmissionStatus,
  EmailLog,
  SupportConversation,
  SupportChatMessage,
  MeetingCapture,
  IdCardRecord,
  TicketStatus,
  SupportTicketReply,
  SignatoryProfile,
  AppointmentLetter,
  AppointmentLetterStatus,
  EffectiveAppointmentStatus,
  AppointmentType
} from '../src/types.ts';
import { syncSchemaToMongo, loadOrSeedMongo, mongoUpsert, mongoDelete, mongoClearCollections, isMongoConnected } from './mongo.ts';

const PERSISTENCE_DIR = path.join(process.cwd(), 'data');
const PERSISTENCE_FILE = path.join(PERSISTENCE_DIR, 'persistent_db.json');
const ADMIN_CONFIG_FILE = path.join(PERSISTENCE_DIR, 'admin_credentials.json');

export interface ResolvedAdminCredentials {
  username: string;
  email: string;
  password?: string;
  passwordHash?: string;
  salt?: string;
  source: 'env_file' | 'process_env' | 'admin_config' | 'default';
}

export function readDirectEnvFile(): Record<string, string> {
  const result: Record<string, string> = {};
  const envFiles = ['.env', '.env.local', '.env.production'];
  for (const f of envFiles) {
    const fullPath = path.join(process.cwd(), f);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (!val.startsWith('"') && !val.startsWith("'")) {
              const hashIdx = val.indexOf(' #');
              if (hashIdx !== -1) {
                val = val.slice(0, hashIdx).trim();
              }
            }
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (val) {
              result[key] = val;
            }
          }
        }
      } catch (err) {
        console.warn(`[EnvReader] Could not read ${f}:`, err);
      }
    }
  }
  return result;
}

export function resolveAdminCredentials(): ResolvedAdminCredentials {
  // 1. Check UI saved credentials in admin_credentials.json (supports hashed or legacy format)
  if (fs.existsSync(ADMIN_CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf-8'));
      if (data && data.username && (data.passwordHash || data.password)) {
        return {
          username: data.username.trim(),
          email: (data.email || 'admin@nexgencouncil.org').trim().toLowerCase(),
          password: data.password ? data.password.trim() : undefined,
          passwordHash: data.passwordHash,
          salt: data.salt,
          source: 'admin_config'
        };
      }
    } catch {}
  }

  // 2. Read direct .env file from disk
  const fileEnv = readDirectEnvFile();
  const fileUser = fileEnv.ADMIN_USERNAME || fileEnv.ADMIN_USER || fileEnv.SUPERADMIN_USERNAME || fileEnv.ADMIN_NAME;
  const filePass = fileEnv.ADMIN_PASSWORD || fileEnv.ADMIN_PASS || fileEnv.SUPERADMIN_PASSWORD || fileEnv.ADMIN_SECRET;
  const fileEmail = fileEnv.ADMIN_EMAIL || fileEnv.SUPERADMIN_EMAIL;

  if (fileUser || filePass) {
    return {
      username: (fileUser || process.env.ADMIN_USERNAME || 'admin').trim(),
      email: (fileEmail || process.env.ADMIN_EMAIL || 'admin@nexgencouncil.org').trim().toLowerCase(),
      password: (filePass || process.env.ADMIN_PASSWORD || 'admin123').trim(),
      source: 'env_file'
    };
  }

  // 3. Check process.env
  const procUser = process.env.ADMIN_USERNAME || process.env.ADMIN_USER || process.env.SUPERADMIN_USERNAME;
  const procPass = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || process.env.SUPERADMIN_PASSWORD;
  const procEmail = process.env.ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL;

  if (procUser || procPass) {
    return {
      username: (procUser || 'admin').trim(),
      email: (procEmail || 'admin@nexgencouncil.org').trim().toLowerCase(),
      password: (procPass || 'admin123').trim(),
      source: 'process_env'
    };
  }

  // 4. Default fallback (warn loudly in production)
  if (process.env.NODE_ENV === 'production') {
    console.warn('[SECURITY WARNING] ADMIN_USERNAME / ADMIN_PASSWORD not set in .env — using fallback credentials. Set strong credentials in .env immediately!');
  }
  return {
    username: 'admin',
    email: 'admin@nexgencouncil.org',
    password: 'admin123',
    source: 'default'
  };
}

export interface DatabaseSchema {
  users: (User & {
    passwordHash: string;
    salt: string;
    tokenVersion?: number;
    twoFactorSecret?: string;
    twoFactorEnabled?: boolean;
    twoFactorBackupCodes?: string[];
  })[];
  applications: VolunteerApplication[];
  volunteers: Volunteer[];
  idCardRecords?: IdCardRecord[];
  programs: Program[];
  events: EventItem[];
  news: NewsItem[];
  team: TeamMember[];
  gallery: GalleryItem[];
  faqs?: FaqItem[];
  contacts: ContactMessage[];
  settings: WebsiteSettings;
  activityLogs: ActivityLog[];
  emailLogs?: EmailLog[];
  meetings?: Meeting[];
  meetingParticipants?: MeetingParticipant[];
  meetingMessages?: MeetingMessage[];
  supportConversations?: SupportConversation[];
  meetingCaptures?: MeetingCapture[];
  signatories?: SignatoryProfile[];
  appointmentLetters?: AppointmentLetter[];
  minValidTokenIssuedAt?: number;
}

const PBKDF2_ITERATIONS_V2 = 120000;
const PBKDF2_ITERATIONS_LEGACY = 1000;

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(32).toString('hex');
  const derived = crypto.pbkdf2Sync(password, s, PBKDF2_ITERATIONS_V2, 64, 'sha512').toString('hex');
  return { hash: `v2$${derived}`, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!password || !hash || !salt) return false;
  try {
    const isV2 = hash.startsWith('v2$');
    const iterations = isV2 ? PBKDF2_ITERATIONS_V2 : PBKDF2_ITERATIONS_LEGACY;
    const expectedHex = isV2 ? hash.slice(3) : hash;
    const computedHex = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    const a = Buffer.from(computedHex, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const defaultSettings: WebsiteSettings = {
  organizationName: 'NexGen Women Empowerment & Youth Leadership Council',
  tagline: 'Cultivating the next generation of visionary female leaders and civic changemakers.',
  heroHeading: 'Empowering Women. Inspiring Youth. Transforming Communities.',
  heroSubheading: 'NexGen Council is an international civil society organization dedicated to accelerating female leadership, youth civic engagement, and socio-economic advancement through rigorous mentorship and grassroots innovation.',
  missionStatement: 'To dismantle socio-economic barriers by providing young women and emerging youth leaders with world-class leadership training, mentorship networks, and platforms to enact systemic change in their communities.',
  visionStatement: 'A globally equitable society where every young woman has the agency, resources, and leadership opportunities to shape policy, enterprise, and social progress.',
  coreValues: [
    { title: 'Inclusivity & Dignity', description: 'Upholding equity, safe learning spaces, and respect for diverse backgrounds across all regional chapters.' },
    { title: 'Ethical Leadership', description: 'Fostering integrity, accountability, and compassionate governance in modern public and corporate life.' },
    { title: 'Civic Innovation', description: 'Empowering grassroots changemakers with modern technology and collaborative problem-solving frameworks.' },
    { title: 'Sustainable Impact', description: 'Building enduring institutional capacity and long-term socio-economic self-reliance.' }
  ],
  historyStatement: 'Founded in 2021 by a coalition of educators, civic leaders, and youth advocates, NexGen Council began as an intensive 30-Day Leadership Series. Today, the organization has mobilized thousands of young women, supported grassroots micro-initiatives, and forged partnerships with international universities and development bodies.',
  stats: {
    volunteersCount: '1,450+',
    beneficiariesCount: '8,200+',
    programsCount: '28',
    communitiesCount: '46'
  },
  contactEmail: 'contact@nexgencouncil.org',
  contactPhone: '+1 (800) 482-9380',
  officeAddress: 'Executive Secretariat, 100 Leadership Plaza, Suite 400, Global District',
  socialLinks: {
    facebook: 'https://facebook.com',
    instagram: 'https://instagram.com',
    linkedin: 'https://linkedin.com',
    twitter: 'https://twitter.com',
    youtube: 'https://youtube.com'
  },
  announcementBanner: {
    enabled: true,
    text: 'Applications are currently open for the 2026 Leadership Development Cohort & Volunteer Network!',
    linkUrl: '#volunteer',
    linkText: 'Apply Now'
  },
  // Footer Customizations
  footerHeading: 'Ready to create transformative community change?',
  footerSubheading: 'Join thousands of emerging leaders and volunteers working across educational equity, women empowerment, and youth civic policy.',
  footerVolunteerButtonText: 'Become a Volunteer',
  footerContactButtonText: 'Contact Us',
  footerSubTitle: 'Women Empowerment & Youth Leadership',
  footerDescription: 'Cultivating the next generation of visionary female leaders and civic changemakers through structured mentorship, skill building, and grassroots advocacy.',
  footerOfficeHours: 'Monday - Friday: 9:00 AM - 6:00 PM (PKT / UTC+5)',
  registrationNumber: 'Registered Civil Society & Non-Profit Initiative #092-2024',
  footerCopyrightText: '© 2026 NexGen Women Empowerment & Youth Leadership Council. All rights reserved.',
  footerBadgeText: 'Non-Governmental Organization • Civic Leadership Initiative',
  // Contact & Legal Visibility On/Off Toggles (Enabled by default, can be toggled in Admin Panel)
  showOfficeAddress: true,
  showContactEmail: true,
  showContactPhone: true,
  showOfficeHours: true,
  showRegistrationNumber: true,
  showSocialLinks: true,
  socialLinksVisibility: {
    facebook: true,
    instagram: true,
    linkedin: true,
    twitter: true,
    youtube: true
  },
  siteUrl: 'https://nexgencouncil.bond',
  metaDescription: 'NexGen Women Empowerment & Youth Leadership Council is an international civil society organization dedicated to accelerating female leadership, youth civic engagement, and socio-economic advancement.',
  googleSiteVerification: '',
  googleAnalyticsId: '',
  directoryHeading: 'Institutional Record & Directory',
  primaryDomains: 'Women Empowerment · Youth Civic Leadership · Mentorship · Policy Dialogue',
  directoryHeadquarters: 'Sialkot, PK',
  showDirectoryCard: true,
  showDirectoryHeading: true,
  showDirectoryHeadquarters: true,
  showOfficialTitle: true,
  showPrimaryDomains: true,
  emailSenderName: 'NexGen Council',
  emailSenderEmail: 'admin@nexgencouncil.bond',
  emailReplyTo: '',
  emailLogoUrl: 'https://i.postimg.cc/5yM8rqz0/logo-(1).png',
  volunteerWhatsappGroupLink: '',
  volunteerWhatsappGroupLinkMale: '',
  volunteerWhatsappGroupLinkFemale: ''
};

export function getDefaultSeedFaqs(): FaqItem[] {
  const now = '2026-01-15T10:00:00.000Z';
  return [
    {
      id: 'faq-what-is-nexgen',
      category: 'About NexGen Council',
      question: 'What is NexGen Council (NexGen Women Empowerment & Youth Leadership Council)?',
      answer:
        'NexGen Council is an independent civil society leadership council dedicated to women empowerment, youth leadership development, civic advocacy, and grassroots community service across Pakistan and international chapters.',
      displayOrder: 1,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-leadership-headquarters',
      category: 'About NexGen Council',
      question: 'Where is NexGen Council headquartered and how is it governed?',
      answer:
        'Headquartered in Sialkot, Punjab, Pakistan, NexGen Council operates through an executive leadership board, department heads, program coordinators, and regional volunteer chapters governed by transparent institutional standards.',
      displayOrder: 2,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-founded-vision',
      category: 'About NexGen Council',
      question: 'What core impact areas guide NexGen Council initiatives?',
      answer:
        'Every initiative advances four foundational pillars: Education access & literacy, Community Healthcare outreach, Emergency Community Support, and Women & Youth Economic & Leadership Empowerment.',
      displayOrder: 3,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-volunteer-apply',
      category: 'Volunteers & Member ID',
      question: 'How can women and youth apply to join or volunteer with NexGen Council?',
      answer:
        'Complete the online application form on the Join as Volunteer page (/volunteer) with your background, skills, and preferred focus area. Every application is reviewed by the Council Secretariat.',
      displayOrder: 4,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-track-application',
      category: 'Volunteers & Member ID',
      question: 'How do I check the review status of my volunteer application?',
      answer:
        'Visit the Track Application page (/track) and enter your Application Reference ID or registered email address to view real-time status updates from Pending Review to Approved.',
      displayOrder: 5,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-member-id-card',
      category: 'Volunteers & Member ID',
      question: 'How do approved members download their official NexGen Member ID Card?',
      answer:
        'Once approved, open the Track Application portal (/track), look up your application, upload a clear portrait photo if requested, and download your official NexGen Council Member ID Card directly in PDF format.',
      displayOrder: 6,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-programs-offered',
      category: 'Programs & Events',
      question: 'What is the 30-Day Leadership Series and what other programs are offered?',
      answer:
        'Our flagship 30-Day Leadership Development Series covers public policy, ethical leadership, communication strategy, and community project execution, alongside Women in Tech workshops and entrepreneurship cohorts listed at /programs.',
      displayOrder: 7,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-events-rsvp',
      category: 'Programs & Events',
      question: 'How do I register or RSVP for upcoming conferences and workshops?',
      answer:
        'Explore upcoming workshops and leadership summits at /events, open any event card to view venue details and available seat capacity, and submit your Delegate RSVP online to confirm attendance or join the waitlist.',
      displayOrder: 8,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-certificates',
      category: 'Programs & Events',
      question: 'Do cohort fellows and active volunteers receive official certificates?',
      answer:
        'Yes. Participants who complete leadership cohorts, training workshops, or verified volunteer terms receive official NexGen Council completion or service recognition certificates recorded by the Secretariat.',
      displayOrder: 9,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-donate-how-utilization',
      category: 'Donations & Partnerships',
      question: 'How can I donate to NexGen Council and how are funds utilized?',
      answer:
        'You can donate securely via the official Easypaisa Digital Bank / RAAST Merchant QR (Merchant Till Number: 992191268), Easypaisa (Momna Kokab · 03497100560), or NayaPay / JazzCash (Minahil Imran · 03418408350) on /donate. Every rupee directly funds Education, Healthcare, Community Support, and Women & Youth Empowerment.',
      displayOrder: 10,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-donate-receipt-minimum',
      category: 'Donations & Partnerships',
      question: 'Is there a minimum donation amount, and how do I get a confirmation receipt?',
      answer:
        'No contribution is too small — every rupee helps create positive change. After sending your gift, submit your email, amount, and Transaction ID (TID) on /donate to receive an official Secretariat confirmation reference.',
      displayOrder: 11,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'faq-partnerships-contact',
      category: 'Donations & Partnerships',
      question: 'How can schools, universities, NGOs, or sponsors partner with NexGen Council?',
      answer:
        'Educational institutions, NGOs, and corporate sponsors can submit co-hosting proposals, mentorship partnerships, or in-kind support requests via the Contact Secretariat portal at /contact.',
      displayOrder: 12,
      active: true,
      createdAt: now,
      updatedAt: now
    }
  ];
}

function getSeedData(): DatabaseSchema {
  const adminCreds = resolveAdminCredentials();
  const adminUsername = adminCreds.username;
  const adminEmail = adminCreds.email;
  const adminPassword = adminCreds.password || 'admin123';

  const superAdmin = adminCreds.passwordHash && adminCreds.salt
    ? { hash: adminCreds.passwordHash, salt: adminCreds.salt }
    : hashPassword(adminPassword);

  return {
    users: [
      {
        id: 'usr_super_1',
        username: adminUsername,
        name: 'Executive Director (Super Admin)',
        email: adminEmail,
        role: 'SUPER_ADMIN',
        avatar: '/logo.png',
        createdAt: '2025-01-10T10:00:00.000Z',
        passwordHash: superAdmin.hash,
        salt: superAdmin.salt,
        tokenVersion: 1
      }
    ],
    applications: [],
    volunteers: [],
    programs: [
      {
        id: 'prg_1',
        title: '30-Day Leadership Development Series',
        slug: '30-day-leadership-development-series',
        category: 'Leadership & Civic Action',
        shortDescription: 'Our flagship accelerated cohort program designed to transform young women into self-aware, articulate, and action-oriented civic leaders.',
        fullDescription: 'The 30-Day Leadership Development Series is the foundational initiative of NexGen Council. Through 30 immersive days of daily modules, guest executive masterclasses, peer group circles, and civic capstone projects, participants discover their leadership voice, develop strategic negotiation techniques, and build lifelong professional solidarity networks.',
        coverImage: 'https://images.unsplash.com/photo-1573497491768-dccce02ce85f?w=900&auto=format&fit=crop&q=80',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        featured: true,
        status: 'Published',
        targetAudience: 'Young women aged 18-28 passionate about public service, social innovation, and leadership.',
        curriculumHighlights: [
          'Module 1: Emotional Intelligence & Authentic Self-Leadership',
          'Module 2: Strategic Communication & Public Narrative',
          'Module 3: Project Design, Budgeting & Community Needs Assessment',
          'Module 4: Coalition Building, Advocacy & Institutional Governance',
          'Module 5: Capstone Showcase & Certificate of Distinction'
        ],
        createdAt: '2026-01-05T08:00:00.000Z'
      },
      {
        id: 'prg_2',
        title: 'Women in Tech & Emerging AI Fellowship',
        slug: 'women-in-tech-emerging-ai-fellowship',
        category: 'Technology & STEM',
        shortDescription: 'Pairing aspiring women technologists with senior industry engineers to build open-source civic technology and AI-driven social interventions.',
        fullDescription: 'Bridging the gender gap in cutting-edge computing. The Women in Tech & Emerging AI Fellowship offers comprehensive hands-on training in modern software engineering, data analysis, and generative AI systems, matched with 1-on-1 industry mentorship from global tech leaders.',
        coverImage: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=900&auto=format&fit=crop&q=80',
        startDate: '2026-05-15',
        endDate: '2026-08-15',
        featured: true,
        status: 'Published',
        targetAudience: 'Female university students, recent graduates, and career-switchers in STEM disciplines.',
        curriculumHighlights: [
          'Modern Full-Stack Architectures & Cloud Deployments',
          'Responsible AI & Machine Learning Workflows',
          'Technical Interview Preparation & Portfolio Building',
          'Executive Mentorship Circles with Senior Female CTOs'
        ],
        createdAt: '2026-01-12T09:30:00.000Z'
      },
      {
        id: 'prg_3',
        title: 'Grassroots Economic Independence & Entrepreneurship',
        slug: 'grassroots-economic-independence',
        category: 'Economic Empowerment',
        shortDescription: 'Micro-grant funding, financial literacy, and digital commerce workshops for women micro-entrepreneurs in peri-urban communities.',
        fullDescription: 'Targeting economic vulnerability at its roots. This program empowers women artisans, home bakers, and service creators with mobile banking skills, bookkeeping fundamentals, product branding, and direct seed grants to scale sustainable micro-enterprises.',
        coverImage: 'https://images.unsplash.com/photo-1556740758-90de374c12ad?w=900&auto=format&fit=crop&q=80',
        startDate: '2026-06-01',
        endDate: '2026-09-30',
        featured: true,
        status: 'Published',
        targetAudience: 'Women entrepreneurs seeking to formalize and digitize their micro-enterprises.',
        curriculumHighlights: [
          'Digital Banking, E-Wallets & Micro-Credit Literacy',
          'Social Commerce & Customer Relationship Building',
          'Inventory Management & Sustainable Cashflow',
          'Seed Capital Competition with Seed Micro-Grants'
        ],
        createdAt: '2026-01-20T10:15:00.000Z'
      },
      {
        id: 'prg_4',
        title: 'Youth Civic Policy & Parliamentary Fellowship',
        slug: 'youth-civic-policy-fellowship',
        category: 'Civic Engagement',
        shortDescription: 'Equipping youth representatives with legislative drafting skills, debate etiquette, and direct interaction with policymakers.',
        fullDescription: 'An immersive fellowship providing deep exposure into public policy formulating, stakeholder consensus building, and sustainable municipal governance. Fellows shadow civil servants and draft whitepapers presented to provincial authorities.',
        coverImage: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=900&auto=format&fit=crop&q=80',
        startDate: '2026-07-01',
        endDate: '2026-10-31',
        featured: false,
        status: 'Published',
        targetAudience: 'Youth advocates, law students, and emerging public administration scholars.',
        curriculumHighlights: [
          'Comparative Constitutional Law & Human Rights Norms',
          'Evidence-Based Policy Analysis & Qualitative Field Research',
          'Simulated Youth Parliamentary Debates & Bill Drafting',
          'Delegation Visits to Government Ministries'
        ],
        createdAt: '2026-02-01T14:00:00.000Z'
      }
    ],
    events: [
      {
        id: 'evt_1',
        title: 'Annual Women Leadership & Social Innovation Summit 2026',
        category: 'Conference',
        description: 'Our premier annual flagship gathering bringing together over 500 delegates, diplomats, grassroots activists, and industry trailblazers for visionary keynotes, breakout strategy workshops, and the NexGen Young Changemaker Awards.',
        image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=900&auto=format&fit=crop&q=80',
        date: '2026-05-18',
        time: '09:00 AM - 05:00 PM',
        location: 'Grand Convention Hall, Diplomatic Enclave & Live Streamed Globally',
        isVirtual: false,
        registrationUrl: '#volunteer',
        status: 'Upcoming',
        capacity: 500,
        registeredCount: 385
      },
      {
        id: 'evt_2',
        title: 'Interactive Masterclass: Breaking the Glass Ceiling in Public Governance',
        category: 'Masterclass',
        description: 'An executive seminar led by former parliamentarians and legal experts exploring institutional strategies to overcome systemic barriers and foster inclusive policy formulation.',
        image: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=900&auto=format&fit=crop&q=80',
        date: '2026-04-12',
        time: '03:00 PM - 05:30 PM',
        location: 'NexGen Innovation Hub & Zoom Live',
        isVirtual: true,
        registrationUrl: '#volunteer',
        status: 'Upcoming',
        capacity: 250,
        registeredCount: 198
      },
      {
        id: 'evt_3',
        title: 'Grassroots Community Health & Wellness Clinic',
        category: 'Community Outreach',
        description: 'Mobile community medical camp offering free preventive health screenings, mental health counselling, and maternal health kits for over 400 families.',
        image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=900&auto=format&fit=crop&q=80',
        date: '2026-03-22',
        time: '10:00 AM - 04:00 PM',
        location: 'Community Center, Sector 8-A',
        isVirtual: false,
        registrationUrl: '#volunteer',
        status: 'Upcoming',
        capacity: 400,
        registeredCount: 310
      },
      {
        id: 'evt_4',
        title: 'Graduation Ceremony: 30-Day Leadership Cohort IV',
        category: 'Graduation',
        description: 'Celebrating 120 remarkable graduates who completed our intensive leadership and community development curriculum with honors.',
        image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=900&auto=format&fit=crop&q=80',
        date: '2025-12-10',
        time: '04:00 PM - 07:00 PM',
        location: 'National Library Auditorium',
        isVirtual: false,
        status: 'Past',
        capacity: 300,
        registeredCount: 300
      }
    ],
    news: [
      {
        id: 'news_1',
        title: 'NexGen Council Expands 30-Day Leadership Cohorts to Five New Districts',
        slug: 'nexgen-expands-leadership-cohorts-new-districts',
        category: 'Expansion',
        author: 'Council Media Office',
        authorRole: 'Communications Directorate',
        coverImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=900&auto=format&fit=crop&q=80',
        summary: 'In response to record participation, NexGen Council announces formal expansion across 5 additional regional zones with dedicated community hubs.',
        content: 'NexGen Women Empowerment & Youth Leadership Council is proud to announce the regional rollout of our signature civic leadership curriculum across five new metropolitan and peri-urban districts. Supported by our growing cadre of trained volunteer mentors and educational partners, this expansion will open up access for more than 2,000 new female participants over the next twelve months.',
        publishedAt: '2026-03-01T12:00:00.000Z',
        status: 'Published',
        featured: true
      },
      {
        id: 'news_2',
        title: 'Global Youth Solidarity Accord Signed with International Partners',
        slug: 'global-youth-solidarity-accord-signed',
        category: 'Partnership',
        author: 'Sarah Jenkins',
        authorRole: 'Senior Program Coordinator',
        coverImage: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=900&auto=format&fit=crop&q=80',
        summary: 'A new bilateral cooperation framework unlocks global exchange fellowships and research grants for NexGen youth leaders.',
        content: 'During the international NGO Forum on Youth and Gender Equality, NexGen Council formalized a long-term cooperation charter with youth leadership foundations across North America, Europe, and South Asia. The framework provides funding for cross-border research sabbaticals, virtual debate exchanges, and institutional mentorship.',
        publishedAt: '2026-02-18T10:00:00.000Z',
        status: 'Published',
        featured: false
      },
      {
        id: 'news_3',
        title: 'Spotlight on Grassroots Impact: Meet the 2025 NexGen Community Fellows',
        slug: 'spotlight-on-grassroots-impact-2025-fellows',
        category: 'Stories',
        author: 'Fatima Zahra',
        authorRole: 'Head of Volunteer Engagement',
        coverImage: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=900&auto=format&fit=crop&q=80',
        summary: 'Discover how four alumni transformed their communities through micro-water purification, digital libraries, and youth advocacy circles.',
        content: 'From creating mobile coding caravans in rural villages to launching community grievance redressal channels for female workers, our 2025 fellows demonstrate the immense transformative power of intentional, values-driven youth leadership.',
        publishedAt: '2026-01-29T14:30:00.000Z',
        status: 'Published',
        featured: false
      }
    ],
    team: [
      {
        id: 'tm_1',
        name: 'Dr. Nisha Aslam',
        position: 'Founder & Executive President',
        department: 'Executive Directorate',
        bio: 'Visionary educator, international development practitioner, and human rights advocate with over 15 years championing equitable gender policies and youth civic leadership across the region.',
        image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80',
        displayOrder: 1,
        active: true,
        linkedinUrl: 'https://linkedin.com',
        twitterUrl: 'https://twitter.com',
        email: 'president@nexgencouncil.org'
      },
      {
        id: 'tm_2',
        name: 'Fatima Zahra',
        position: 'Director of Volunteer Operations & Youth Networks',
        department: 'Operations',
        bio: 'Community organizer and certified youth leadership trainer who has structured volunteer networks across 30+ regional chapters with an emphasis on safe, inclusive civic spaces.',
        image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&auto=format&fit=crop&q=80',
        displayOrder: 2,
        active: true,
        linkedinUrl: 'https://linkedin.com',
        email: 'fatima.z@nexgencouncil.org'
      },
      {
        id: 'tm_3',
        name: 'Sarah Jenkins',
        position: 'Head of Strategic Programs & Curriculum',
        department: 'Academics & Strategy',
        bio: 'Curriculum specialist and former university lecturer focusing on experiential pedagogy, public speaking, and institutional governance.',
        image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
        displayOrder: 3,
        active: true,
        linkedinUrl: 'https://linkedin.com',
        email: 'sarah.j@nexgencouncil.org'
      },
      {
        id: 'tm_4',
        name: 'Ayla Malik',
        position: 'Director of Partnerships & Resource Mobilization',
        department: 'Partnerships',
        bio: 'Philanthropy strategist and institutional liaison specialized in multilateral donor cooperation, corporate sustainability, and social impact bonds.',
        image: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=600&auto=format&fit=crop&q=80',
        displayOrder: 4,
        active: true,
        linkedinUrl: 'https://linkedin.com',
        email: 'partnerships@nexgencouncil.org'
      }
    ],
    gallery: [
      {
        id: 'gal_1',
        title: '30-Day Leadership Cohort Masterclass on Public Speaking',
        category: 'Workshops',
        imageUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=900&auto=format&fit=crop&q=80',
        date: '2026-02-15',
        displayOrder: 1
      },
      {
        id: 'gal_2',
        title: 'Women in Tech Civic Coding Hackathon',
        category: 'Technology',
        imageUrl: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=900&auto=format&fit=crop&q=80',
        date: '2026-01-20',
        displayOrder: 2
      },
      {
        id: 'gal_3',
        title: 'Annual Youth Leadership Summit Keynote Session',
        category: 'Summit',
        imageUrl: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=900&auto=format&fit=crop&q=80',
        date: '2025-11-18',
        displayOrder: 3
      },
      {
        id: 'gal_4',
        title: 'Community Health Camp Volunteer Mobilization',
        category: 'Outreach',
        imageUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=900&auto=format&fit=crop&q=80',
        date: '2025-10-05',
        displayOrder: 4
      },
      {
        id: 'gal_5',
        title: 'Fellows Group Discussion & Policy Drafting',
        category: 'Workshops',
        imageUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=900&auto=format&fit=crop&q=80',
        date: '2025-09-12',
        displayOrder: 5
      },
      {
        id: 'gal_6',
        title: 'Graduation Day Honors & Certificate Presentation',
        category: 'Ceremony',
        imageUrl: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=900&auto=format&fit=crop&q=80',
        date: '2025-08-30',
        displayOrder: 6
      }
    ],
    faqs: getDefaultSeedFaqs(),
    idCardRecords: [],
    contacts: [],
    settings: defaultSettings,
    activityLogs: [],
    emailLogs: [],
    meetings: [],
    meetingParticipants: [],
    meetingMessages: [],
    meetingCaptures: [],
    supportConversations: [],
    signatories: [],
    appointmentLetters: []
  };
}

class Database {
  private data: DatabaseSchema;

  private ensureMeetingArrays() {
    if (!this.data.meetings) this.data.meetings = [];
    if (!this.data.meetingParticipants) this.data.meetingParticipants = [];
    if (!this.data.meetingMessages) this.data.meetingMessages = [];
    if (!this.data.emailLogs) this.data.emailLogs = [];
    if (!this.data.supportConversations) this.data.supportConversations = [];
    if (!this.data.meetingCaptures) this.data.meetingCaptures = [];
    if (!this.data.idCardRecords) this.data.idCardRecords = [];
    if (!Array.isArray(this.data.signatories)) {
      this.data.signatories = [];
    }
    if (this.data.signatories.length === 0) {
      const now = new Date().toISOString();
      this.data.signatories.push({
        id: 'sig_exec_default',
        name: 'Executive Director',
        title: 'Executive Director — Council Secretariat',
        roleType: 'Executive Director',
        department: 'Council Secretariat',
        hasSignatureImage: false,
        hasStampImage: false,
        active: true,
        isDefault: true,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'VOLUNTEER_MANAGER'],
        createdAt: now,
        updatedAt: now,
        updatedBy: 'System Initialization'
      });
    }
    if (!Array.isArray(this.data.appointmentLetters)) {
      this.data.appointmentLetters = [];
    }
    if (!Array.isArray(this.data.faqs)) {
      this.data.faqs = getDefaultSeedFaqs();
    }
  }

  constructor() {
    // If a persistent snapshot exists on disk, load it so restarts/rebuilds keep user modifications
    if (fs.existsSync(PERSISTENCE_FILE)) {
      try {
        const raw = fs.readFileSync(PERSISTENCE_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        console.log('[Database] Loaded existing persistent records from disk cache.');
      } catch {
        this.data = getSeedData();
      }
    } else {
      this.data = getSeedData();
    }
    this.ensureMeetingArrays();
    // Only seed a Super Admin if none exists yet; NEVER overwrite already-set DB credentials
    this.syncSuperAdminFromEnv({ persistOnInit: false });
  }

  public async initFromMongo(): Promise<void> {
    try {
      if (isMongoConnected()) {
        this.data = await loadOrSeedMongo(this.data);
        this.ensureMeetingArrays();
        this.syncSuperAdminFromEnv({ persistOnInit: true });
        this.saveToFile(this.data);
        console.log('[Database] Synchronized state with real-time MongoDB collections.');
      } else {
        this.syncSuperAdminFromEnv({ persistOnInit: true });
      }
    } catch (err: any) {
      console.warn('[Database] Sync with MongoDB error:', err.message);
    }
  }

  private writeAdminConfigSnapshot(user: DatabaseSchema['users'][0]) {
    try {
      if (!fs.existsSync(PERSISTENCE_DIR)) {
        fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
      }
      fs.writeFileSync(
        ADMIN_CONFIG_FILE,
        JSON.stringify(
          {
            username: user.username,
            email: user.email,
            passwordHash: user.passwordHash,
            salt: user.salt,
            updatedAt: new Date().toISOString()
          },
          null,
          2
        ),
        { encoding: 'utf-8', mode: 0o600 }
      );
    } catch (err) {
      console.warn('[Database] Could not sync admin_credentials.json:', err);
    }
  }

  public getActiveSuperAdminInfo(): { username: string; email: string; source: 'database' | ResolvedAdminCredentials['source']; isCustomConfigured: boolean } {
    const existing = this.data.users.find(u => u.role === 'SUPER_ADMIN' || u.id === 'usr_super_1');
    if (existing) {
      return {
        username: existing.username,
        email: existing.email,
        source: 'database',
        isCustomConfigured: true
      };
    }
    const creds = resolveAdminCredentials();
    return {
      username: creds.username,
      email: creds.email,
      source: creds.source,
      isCustomConfigured: creds.source !== 'default'
    };
  }

  /**
   * Non-destructive Super Admin initializer:
   * Only seeds initial Super Admin when ZERO Super Admin exists in the database.
   * Once set in MongoDB / persistent storage / UI, existing email & password are NEVER overwritten by .env on rebuild.
   */
  public syncSuperAdminFromEnv(options?: { persistOnInit?: boolean }) {
    const persist = options?.persistOnInit !== false;
    let superAdmin = this.data.users.find(
      u => u.role === 'SUPER_ADMIN' || u.id === 'usr_super_1'
    );

    if (superAdmin) {
      superAdmin.role = 'SUPER_ADMIN';
      if (!superAdmin.tokenVersion) superAdmin.tokenVersion = 1;
      if (persist) {
        this.writeAdminConfigSnapshot(superAdmin);
      }
      return superAdmin;
    }

    // First-time bootstrap only: no Super Admin exists in DB yet
    const creds = resolveAdminCredentials();
    const { hash, salt } = creds.passwordHash && creds.salt
      ? { hash: creds.passwordHash, salt: creds.salt }
      : hashPassword(creds.password || 'admin123');

    superAdmin = {
      id: 'usr_super_1',
      username: creds.username,
      name: 'Executive Director (Super Admin)',
      email: creds.email,
      role: 'SUPER_ADMIN',
      avatar: '/logo.png',
      createdAt: new Date().toISOString(),
      passwordHash: hash,
      salt,
      tokenVersion: 1
    };
    this.data.users.unshift(superAdmin);

    if (persist) {
      this.writeAdminConfigSnapshot(superAdmin);
      this.save();
      mongoUpsert('users', superAdmin.id, superAdmin).catch(() => {});
    }
    return superAdmin;
  }

  private save(dataToSave?: DatabaseSchema) {
    try {
      const data = dataToSave || this.data;
      this.saveToFile(data);
      // Persist directly and asynchronously into MongoDB collections
      syncSchemaToMongo(data).catch(() => {});
    } catch (e) {
      console.error('Error saving data:', e);
    }
  }

  private saveToFile(data: DatabaseSchema) {
    try {
      if (!fs.existsSync(PERSISTENCE_DIR)) {
        fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
      }
      fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Database] Failed to write persistent backup file:', err);
    }
  }

  public async syncAllToMongo() {
    return syncSchemaToMongo(this.data);
  }

  public async purgeMockData() {
    this.data.programs = [];
    this.data.events = [];
    this.data.news = [];
    this.data.team = [];
    this.data.gallery = [];
    this.save();
    await mongoClearCollections(['programs', 'events', 'news', 'team', 'gallery']);
    this.logActivity({
      userId: 'usr_super_1',
      userName: 'Super Admin',
      userRole: 'SUPER_ADMIN',
      action: 'PURGE_MOCK_DATA',
      entityType: 'DATABASE',
      details: 'Purged all demo mock records (clean slate database)'
    });
    return { success: true, message: 'All demo and mock records have been permanently cleared from database.' };
  }

  private toSafeUser(user: DatabaseSchema['users'][0]): User {
    const {
      passwordHash: _p,
      salt: _s,
      twoFactorSecret: _sec,
      twoFactorBackupCodes: backupCodes,
      ...rest
    } = user;
    return {
      ...rest,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      twoFactorBackupCodesRemaining: Array.isArray(backupCodes) ? backupCodes.length : 0
    };
  }

  // --- Auth & Users ---
  getUsers() {
    return this.data.users.map(u => this.toSafeUser(u));
  }

  getUserById(id: string) {
    const user = this.data.users.find(u => u.id === id);
    if (!user) return null;
    return this.toSafeUser(user);
  }

  getUser2faInternal(userId: string) {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      twoFactorSecret: user.twoFactorSecret,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      twoFactorBackupCodes: Array.isArray(user.twoFactorBackupCodes) ? [...user.twoFactorBackupCodes] : []
    };
  }

  setUserPending2faSecret(userId: string, secret: string) {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return null;
    user.twoFactorSecret = secret;
    user.twoFactorEnabled = false;
    this.save();
    mongoUpsert('users', user.id, user).catch(() => {});
    return this.toSafeUser(user);
  }

  enableUser2fa(userId: string, hashedBackupCodes: string[]) {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return null;
    user.twoFactorEnabled = true;
    user.twoFactorBackupCodes = hashedBackupCodes;
    this.save();
    mongoUpsert('users', user.id, user).catch(() => {});
    return this.toSafeUser(user);
  }

  disableUser2fa(userId: string) {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return null;
    user.twoFactorEnabled = false;
    user.twoFactorSecret = '';
    user.twoFactorBackupCodes = [];
    this.save();
    mongoUpsert('users', user.id, user).catch(() => {});
    return this.toSafeUser(user);
  }

  consumeUserBackupCode(userId: string, hashedCode: string): { consumed: boolean; remaining: number } {
    const user = this.data.users.find(u => u.id === userId);
    if (!user || !Array.isArray(user.twoFactorBackupCodes) || user.twoFactorBackupCodes.length === 0) {
      return { consumed: false, remaining: 0 };
    }
    const targetBuf = Buffer.from(hashedCode, 'utf8');
    let matchIndex = -1;
    user.twoFactorBackupCodes.forEach((stored, idx) => {
      const storedBuf = Buffer.from(stored, 'utf8');
      if (storedBuf.length === targetBuf.length && crypto.timingSafeEqual(storedBuf, targetBuf)) {
        matchIndex = idx;
      }
    });
    if (matchIndex === -1) {
      return { consumed: false, remaining: user.twoFactorBackupCodes.length };
    }
    user.twoFactorBackupCodes.splice(matchIndex, 1);
    this.save();
    mongoUpsert('users', user.id, user).catch(() => {});
    return { consumed: true, remaining: user.twoFactorBackupCodes.length };
  }

  getUserTokenVersion(userId: string): number {
    const user = this.data.users.find(u => u.id === userId);
    return user?.tokenVersion || 1;
  }

  getMinValidTokenIssuedAt(): number {
    return this.data.minValidTokenIssuedAt || 0;
  }

  revokeAllSessions() {
    this.data.minValidTokenIssuedAt = Date.now();
    this.data.users.forEach(u => {
      u.tokenVersion = (u.tokenVersion || 1) + 1;
    });
    this.save();
    return this.data.minValidTokenIssuedAt;
  }

  authenticate(usernameOrEmail: string, passwordPlain: string) {
    const cleanUser = (usernameOrEmail || '').trim();
    const cleanPass = (passwordPlain || '').trim();
    if (!cleanUser || !cleanPass) return null;

    // Only bootstrap Super Admin if database somehow has zero users; never overwrite existing DB credentials
    if (this.data.users.length === 0) {
      this.syncSuperAdminFromEnv();
    }

    const user = this.data.users.find(
      u => u.username.toLowerCase() === cleanUser.toLowerCase() ||
           u.email.toLowerCase() === cleanUser.toLowerCase()
    );
    if (!user) return null;
    const isValid = verifyPassword(cleanPass, user.passwordHash, user.salt);
    if (!isValid) return null;

    // Seamless upgrade of legacy 1k-iter PBKDF2 hashes to 120k-iter v2$ hashes on login
    if (!user.passwordHash.startsWith('v2$')) {
      const upgraded = hashPassword(cleanPass);
      user.passwordHash = upgraded.hash;
      user.salt = upgraded.salt;
      this.save();
      mongoUpsert('users', user.id, user).catch(() => {});
    }

    return this.toSafeUser(user);
  }

  verifyUserPassword(userId: string, passwordPlain: string): boolean {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return false;
    return verifyPassword(passwordPlain, user.passwordHash, user.salt);
  }

  updateSuperAdminCredentials(newUsername: string, newPassword: string, newEmail?: string) {
    const username = newUsername.trim().toLowerCase();
    const password = newPassword.trim();
    if (!username || !password) {
      throw new Error('Admin username and password cannot be empty.');
    }
    if (password.length < 8) {
      throw new Error('Super Admin password must be at least 8 characters long.');
    }
    if (!/[a-zA-Z]/.test(password) || !/[\d\W_]/.test(password)) {
      throw new Error('Super Admin password must include letters and at least one number or symbol.');
    }
    if (/^(admin123|password|12345678|qwerty123)$/i.test(password)) {
      throw new Error('Please choose a stronger, non-trivial Super Admin password.');
    }

    let superAdmin = this.data.users.find(u => u.role === 'SUPER_ADMIN' || u.id === 'usr_super_1');
    const email = (newEmail && newEmail.trim()
      ? newEmail
      : superAdmin?.email || 'admin@nexgencouncil.org'
    ).trim().toLowerCase();

    const hashed = hashPassword(password);

    if (superAdmin) {
      superAdmin.username = username;
      superAdmin.email = email;
      superAdmin.role = 'SUPER_ADMIN';
      superAdmin.passwordHash = hashed.hash;
      superAdmin.salt = hashed.salt;
      superAdmin.tokenVersion = (superAdmin.tokenVersion || 1) + 1;
    } else {
      superAdmin = {
        id: 'usr_super_1',
        username,
        name: 'Executive Director (Super Admin)',
        email,
        role: 'SUPER_ADMIN',
        avatar: '/logo.png',
        createdAt: new Date().toISOString(),
        passwordHash: hashed.hash,
        salt: hashed.salt,
        tokenVersion: 1
      };
      this.data.users.unshift(superAdmin);
    }

    this.writeAdminConfigSnapshot(superAdmin);

    // Also synchronize into .env file on disk if writable
    const envPath = path.join(process.cwd(), '.env');
    try {
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        if (envContent.includes('ADMIN_USERNAME=')) {
          envContent = envContent.replace(/^ADMIN_USERNAME=.*$/m, `ADMIN_USERNAME=${username}`);
        } else {
          envContent += `\nADMIN_USERNAME=${username}`;
        }
        if (envContent.includes('ADMIN_PASSWORD=')) {
          envContent = envContent.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${password}`);
        } else {
          envContent += `\nADMIN_PASSWORD=${password}`;
        }
        if (envContent.includes('ADMIN_EMAIL=')) {
          envContent = envContent.replace(/^ADMIN_EMAIL=.*$/m, `ADMIN_EMAIL=${email}`);
        } else {
          envContent += `\nADMIN_EMAIL=${email}`;
        }
        fs.writeFileSync(envPath, envContent, 'utf-8');
      }
    } catch (err) {
      console.warn('[Database] Could not write to .env:', err);
    }

    this.save();
    mongoUpsert('users', superAdmin.id, superAdmin).catch(() => {});
    return this.toSafeUser(superAdmin);
  }

  createUser(userData: { username: string; name: string; email: string; role: any; password: string; avatar?: string }) {
    const cleanUsername = userData.username.trim().toLowerCase();
    const cleanEmail = userData.email.trim().toLowerCase();

    const duplicate = this.data.users.find(
      u => u.username.toLowerCase() === cleanUsername || u.email.toLowerCase() === cleanEmail
    );
    if (duplicate) {
      throw new Error('A staff account with that username or email already exists.');
    }

    const { hash, salt } = hashPassword(userData.password);
    const newUser: DatabaseSchema['users'][0] = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUsername,
      name: userData.name.trim(),
      email: cleanEmail,
      role: userData.role,
      avatar: userData.avatar?.trim() || '/logo.png',
      createdAt: new Date().toISOString(),
      passwordHash: hash,
      salt,
      tokenVersion: 1,
      twoFactorEnabled: false,
      twoFactorBackupCodes: []
    };
    this.data.users.push(newUser);
    this.save();
    mongoUpsert('users', newUser.id, newUser).catch(() => {});
    return this.toSafeUser(newUser);
  }

  deleteUser(id: string) {
    const target = this.data.users.find(u => u.id === id);
    if (!target) return false;
    if (target.role === 'SUPER_ADMIN') {
      const superAdmins = this.data.users.filter(u => u.role === 'SUPER_ADMIN');
      if (superAdmins.length <= 1) {
        throw new Error('Cannot delete the last remaining Super Admin account.');
      }
    }
    this.data.users = this.data.users.filter(u => u.id !== id);
    this.save();
    mongoDelete('users', id).catch(() => {});
    return true;
  }

  updateUser(id: string, updates: { username?: string; name?: string; email?: string; role?: any; password?: string; avatar?: string }) {
    const user = this.data.users.find(u => u.id === id);
    if (!user) return null;

    if (updates.email && updates.email.trim()) {
      const nextEmail = updates.email.trim().toLowerCase();
      if (this.data.users.some(u => u.id !== id && u.email.toLowerCase() === nextEmail)) {
        throw new Error('Email is already assigned to another staff account.');
      }
      user.email = nextEmail;
    }
    if (updates.username && updates.username.trim()) {
      const nextUsername = updates.username.trim().toLowerCase();
      if (this.data.users.some(u => u.id !== id && u.username.toLowerCase() === nextUsername)) {
        throw new Error('Username is already taken.');
      }
      user.username = nextUsername;
    }
    if (updates.name && updates.name.trim()) {
      user.name = updates.name.trim();
    }
    if (typeof updates.avatar === 'string' && updates.avatar.trim()) {
      user.avatar = updates.avatar.trim();
    }
    if (updates.role && updates.role !== user.role) {
      if (user.role === 'SUPER_ADMIN' && updates.role !== 'SUPER_ADMIN') {
        const superAdmins = this.data.users.filter(u => u.role === 'SUPER_ADMIN');
        if (superAdmins.length <= 1) {
          throw new Error('Cannot demote the last remaining Super Admin account.');
        }
      }
      user.role = updates.role;
      user.tokenVersion = (user.tokenVersion || 1) + 1; // Immediately invalidate old role tokens
    }
    if (updates.password && updates.password.trim()) {
      const { hash, salt } = hashPassword(updates.password.trim());
      user.passwordHash = hash;
      user.salt = salt;
      user.tokenVersion = (user.tokenVersion || 1) + 1; // Immediately invalidate existing sessions on password reset
    }

    this.save();
    mongoUpsert('users', user.id, user).catch(() => {});

    // Keep persistent admin_credentials.json & .env in sync when Super Admin details are edited via Staff Management
    if (
      (user.role === 'SUPER_ADMIN' || user.id === 'usr_super_1') &&
      (updates.username || updates.email || updates.password)
    ) {
      this.writeAdminConfigSnapshot(user);
      const envPath = path.join(process.cwd(), '.env');
      try {
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          if (updates.username) {
            envContent = envContent.includes('ADMIN_USERNAME=')
              ? envContent.replace(/^ADMIN_USERNAME=.*$/m, `ADMIN_USERNAME=${user.username}`)
              : `${envContent}\nADMIN_USERNAME=${user.username}`;
          }
          if (updates.email) {
            envContent = envContent.includes('ADMIN_EMAIL=')
              ? envContent.replace(/^ADMIN_EMAIL=.*$/m, `ADMIN_EMAIL=${user.email}`)
              : `${envContent}\nADMIN_EMAIL=${user.email}`;
          }
          if (updates.password && updates.password.trim()) {
            envContent = envContent.includes('ADMIN_PASSWORD=')
              ? envContent.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${updates.password.trim()}`)
              : `${envContent}\nADMIN_PASSWORD=${updates.password.trim()}`;
          }
          fs.writeFileSync(envPath, envContent, 'utf-8');
        }
      } catch (err) {
        console.warn('[Database] Could not write to .env on user update:', err);
      }
    }

    return this.toSafeUser(user);
  }

  // --- Volunteer Applications ---
  getApplications(query: {
    search?: string;
    status?: string;
    city?: string;
    fromDate?: string;
    toDate?: string;
    sort?: 'newest' | 'oldest';
    page?: number;
    perPage?: number;
  } = {}) {
    let list = [...this.data.applications];

    if (query.search) {
      const q = query.search.toLowerCase();
      list = list.filter(a =>
        a.fullName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        a.referenceCode.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        (a.preferredRole && a.preferredRole.toLowerCase().includes(q))
      );
    }

    if (query.status) {
      list = list.filter(a => a.status === query.status);
    }

    if (query.city) {
      list = list.filter(a => a.city.toLowerCase().includes(query.city!.toLowerCase()));
    }

    if (query.fromDate) {
      const from = new Date(query.fromDate).getTime();
      list = list.filter(a => new Date(a.createdAt).getTime() >= from);
    }

    if (query.toDate) {
      const to = new Date(query.toDate).getTime() + 86400000;
      list = list.filter(a => new Date(a.createdAt).getTime() <= to);
    }

    list.sort((a, b) => {
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return query.sort === 'oldest' ? tA - tB : tB - tA;
    });

    const total = list.length;
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const perPage = query.perPage && query.perPage > 0 ? Number(query.perPage) : 10;
    const start = (page - 1) * perPage;
    const paginated = list.slice(start, start + perPage);

    return {
      data: paginated,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage)
    };
  }

  getApplicationById(id: string) {
    return this.data.applications.find(a => a.id === id || a.referenceCode === id) || null;
  }

  private normalizeEmailId(email?: string): string {
    return (email || '').trim().toLowerCase();
  }

  private normalizePhoneId(phone?: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }

  findDuplicateApplicationByIdentity(email?: string, phone?: string): {
    duplicate: boolean;
    matchedBy?: 'email' | 'phone' | 'both';
    existingStatus?: string;
  } {
    const normEmail = this.normalizeEmailId(email);
    const normPhone = this.normalizePhoneId(phone);

    let matchedEmail = false;
    let matchedPhone = false;
    let existingStatus: string | undefined;

    for (const a of this.data.applications) {
      if (a.status === 'Rejected') continue;
      const eMatch = Boolean(normEmail && this.normalizeEmailId(a.email) === normEmail);
      const pMatch = Boolean(normPhone && this.normalizePhoneId(a.phone) === normPhone);
      if (eMatch || pMatch) {
        if (eMatch) matchedEmail = true;
        if (pMatch) matchedPhone = true;
        existingStatus = existingStatus || a.status;
      }
    }

    for (const v of this.data.volunteers) {
      const eMatch = Boolean(normEmail && this.normalizeEmailId(v.email) === normEmail);
      const pMatch = Boolean(normPhone && this.normalizePhoneId(v.phone) === normPhone);
      if (eMatch || pMatch) {
        if (eMatch) matchedEmail = true;
        if (pMatch) matchedPhone = true;
        existingStatus = existingStatus || 'Approved';
      }
    }

    if (matchedEmail && matchedPhone) return { duplicate: true, matchedBy: 'both', existingStatus };
    if (matchedEmail) return { duplicate: true, matchedBy: 'email', existingStatus };
    if (matchedPhone) return { duplicate: true, matchedBy: 'phone', existingStatus };
    return { duplicate: false };
  }

  createApplication(payload: Omit<VolunteerApplication, 'id' | 'referenceCode' | 'status' | 'createdAt' | 'updatedAt'>) {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const referenceCode = `NXG-${year}-${randomSuffix}`;
    const now = new Date().toISOString();

    const application: VolunteerApplication = {
      ...payload,
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      referenceCode,
      status: 'Pending',
      createdAt: now,
      updatedAt: now
    };

    this.data.applications.unshift(application);
    this.save();
    mongoUpsert('applications', application.id, application).catch(() => {});
    return application;
  }

  updateApplication(id: string, updates: Partial<VolunteerApplication>) {
    const idx = this.data.applications.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this.data.applications[idx] = {
      ...this.data.applications[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    mongoUpsert('applications', id, this.data.applications[idx]).catch(() => {});
    return this.data.applications[idx];
  }

  updateApplicationStatus(id: string, status: VolunteerApplication['status'], internalNotes?: string, reviewer?: { name: string; id: string }) {
    const app = this.getApplicationById(id);
    if (!app) return null;

    app.status = status;
    if (internalNotes !== undefined) app.internalNotes = internalNotes;
    if (reviewer) {
      app.reviewerName = reviewer.name;
      app.reviewedAt = new Date().toISOString();
    }
    app.updatedAt = new Date().toISOString();

    // If approved, verify if already converted to volunteer, else add to volunteers table
    if (status === 'Approved') {
      const existingVol = this.data.volunteers.find(v => v.applicationId === app.id || v.email === app.email);
      if (!existingVol) {
        const newVolunteer: Volunteer = {
          id: `vol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          applicationId: app.id,
          fullName: app.fullName,
          email: app.email,
          phone: app.phone,
          city: app.city,
          skills: app.skills || [],
          assignedRole: app.preferredRole || 'General Volunteer',
          assignedProgram: '30-Day Leadership Development Series',
          hoursLogged: 0,
          joinedDate: new Date().toISOString().split('T')[0],
          status: 'Active',
          avatar: app.avatar,
          emergencyContact: app.emergencyContactName ? `${app.emergencyContactName} (${app.emergencyContactPhone || ''})` : undefined
        };
        this.data.volunteers.unshift(newVolunteer);
        mongoUpsert('volunteers', newVolunteer.id, newVolunteer).catch(() => {});
      }
    }

    this.save();
    mongoUpsert('applications', app.id, app).catch(() => {});
    return app;
  }

  deleteApplication(id: string) {
    const initialLen = this.data.applications.length;
    this.data.applications = this.data.applications.filter(a => a.id !== id);
    this.save();
    mongoDelete('applications', id).catch(() => {});
    return this.data.applications.length < initialLen;
  }

  // --- Volunteers Directory ---
  getVolunteers(search?: string, status?: string) {
    let list = [...this.data.volunteers];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.fullName.toLowerCase().includes(q) ||
        v.email.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        v.assignedRole.toLowerCase().includes(q) ||
        v.skills.some(s => s.toLowerCase().includes(q))
      );
    }
    if (status) {
      list = list.filter(v => v.status === status);
    }
    return list;
  }

  createVolunteer(data: Partial<Volunteer> & { fullName: string; email: string }) {
    const newVol: Volunteer = {
      id: 'vol_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      applicationId: data.applicationId || '',
      fullName: data.fullName,
      email: data.email,
      phone: data.phone || '',
      city: data.city || 'National Secretariat',
      assignedRole: data.assignedRole || 'Youth Leadership Volunteer',
      assignedProgram: data.assignedProgram,
      joinedDate: data.joinedDate || new Date().toISOString(),
      hoursContributed: data.hoursContributed || 0,
      status: data.status || 'Active',
      avatar: data.avatar,
      membershipTier: data.membershipTier,
      skills: data.skills || ['Community Outreach']
    };
    this.data.volunteers.unshift(newVol);
    this.save();
    mongoUpsert('volunteers', newVol.id, newVol).catch(() => {});
    return newVol;
  }

  updateVolunteer(id: string, updates: Partial<Volunteer>) {
    const idx = this.data.volunteers.findIndex(v => v.id === id);
    if (idx === -1) return null;
    this.data.volunteers[idx] = { ...this.data.volunteers[idx], ...updates };
    this.save();
    mongoUpsert('volunteers', id, this.data.volunteers[idx]).catch(() => {});
    return this.data.volunteers[idx];
  }

  deleteVolunteer(id: string) {
    const initialLen = this.data.volunteers.length;
    this.data.volunteers = this.data.volunteers.filter(v => v.id !== id);
    this.save();
    mongoDelete('volunteers', id).catch(() => {});
    return this.data.volunteers.length < initialLen;
  }

  // --- Official ID Card Records (Single-Upload & One-Time Cross-ID Submission Lock) ---
  resolveHolderByRefCode(refCode: string) {
    this.ensureMeetingArrays();
    const clean = (refCode || '').trim();
    const normalized = clean.toUpperCase();
    let appItem =
      this.data.applications.find(
        a => a.referenceCode.toUpperCase() === normalized || a.id.toUpperCase() === normalized
      ) || null;

    let volMatch =
      (appItem
        ? this.data.volunteers.find(
            v =>
              v.applicationId === appItem!.id ||
              (this.normalizeEmailId(v.email) &&
                this.normalizeEmailId(v.email) === this.normalizeEmailId(appItem!.email))
          )
        : null) || null;

    if (!volMatch) {
      const nxgMatch = normalized.match(/^NXG-\d{4}-([A-Z0-9]{4,8})$/);
      const nxgSuffix = nxgMatch ? nxgMatch[1] : '';
      volMatch =
        this.data.volunteers.find(v => {
          const volCode = `NG-VOL-${v.id.slice(-6).toUpperCase()}`;
          const legacyCardCode = `NXG-${new Date(v.joinedDate || Date.now()).getFullYear()}-${v.id.slice(-4).toUpperCase()}`;
          return (
            v.id.toUpperCase() === normalized ||
            volCode === normalized ||
            legacyCardCode === normalized ||
            (nxgSuffix.length >= 4 && v.id.slice(-nxgSuffix.length).toUpperCase() === nxgSuffix)
          );
        }) || null;
    }

    // Also resolve directly via persisted official ID card records if present
    const directCardRecord = (this.data.idCardRecords || []).find(
      r => r.referenceCode.toUpperCase() === normalized
    );
    if (directCardRecord) {
      if (!appItem && directCardRecord.applicationId) {
        appItem =
          this.data.applications.find(a => a.id === directCardRecord.applicationId) || null;
      }
      if (!volMatch && directCardRecord.volunteerId) {
        volMatch =
          this.data.volunteers.find(v => v.id === directCardRecord.volunteerId) || null;
      }
      if (!appItem && directCardRecord.email) {
        const recEmail = this.normalizeEmailId(directCardRecord.email);
        appItem =
          this.data.applications.find(a => this.normalizeEmailId(a.email) === recEmail) || null;
      }
      if (!volMatch && directCardRecord.email) {
        const recEmail = this.normalizeEmailId(directCardRecord.email);
        volMatch =
          this.data.volunteers.find(v => this.normalizeEmailId(v.email) === recEmail) || null;
      }
    }

    // Reverse resolve appItem if lookup started from a volunteer code (NG-VOL-...)
    if (volMatch && !appItem) {
      appItem =
        this.data.applications.find(
          a =>
            a.id === volMatch!.applicationId ||
            (this.normalizeEmailId(a.email) &&
              this.normalizeEmailId(a.email) === this.normalizeEmailId(volMatch!.email))
        ) || null;
    }

    const canonicalCode = appItem
      ? appItem.referenceCode
      : volMatch
      ? `NG-VOL-${volMatch.id.slice(-6).toUpperCase()}`
      : directCardRecord
      ? directCardRecord.referenceCode
      : normalized;

    const resolvedEmail = this.normalizeEmailId(
      volMatch?.email || appItem?.email || directCardRecord?.email
    );
    const resolvedPhone = this.normalizePhoneId(
      volMatch?.phone || appItem?.phone || directCardRecord?.phone
    );

    return { appItem, volMatch, canonicalCode, resolvedEmail, resolvedPhone };
  }

  getIdCardRecords(search?: string): IdCardRecord[] {
    this.ensureMeetingArrays();
    let list = [...(this.data.idCardRecords || [])];
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        r =>
          r.fullName.toLowerCase().includes(q) ||
          r.referenceCode.toLowerCase().includes(q) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.phone && r.phone.toLowerCase().includes(q)) ||
          (r.city && r.city.toLowerCase().includes(q)) ||
          (r.assignedRole && r.assignedRole.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }

  getIdCardRecordByCode(refCode: string, extraPhone?: string): IdCardRecord | null {
    this.ensureMeetingArrays();
    const clean = (refCode || '').trim().toUpperCase();
    if (!clean) return null;
    const { appItem, volMatch, canonicalCode, resolvedEmail, resolvedPhone } = this.resolveHolderByRefCode(refCode);
    const volCode = volMatch ? `NG-VOL-${volMatch.id.slice(-6).toUpperCase()}` : '';
    const extraNormPhone = this.normalizePhoneId(extraPhone);

    // Prefer locked match if multiple exist for same identity
    const matches = (this.data.idCardRecords || []).filter(r => {
      const rCode = r.referenceCode.toUpperCase();
      const codeMatch =
        rCode === clean ||
        rCode === canonicalCode.toUpperCase() ||
        (volCode && rCode === volCode);
      const idMatch =
        Boolean(appItem && r.applicationId === appItem.id) ||
        Boolean(volMatch && r.volunteerId === volMatch.id);
      const emailMatch = Boolean(resolvedEmail && this.normalizeEmailId(r.email) === resolvedEmail);
      const rPhoneNorm = this.normalizePhoneId(r.phone);
      const phoneMatch = Boolean(
        rPhoneNorm &&
          ((resolvedPhone && rPhoneNorm === resolvedPhone) || (extraNormPhone && rPhoneNorm === extraNormPhone))
      );
      return codeMatch || idMatch || emailMatch || phoneMatch;
    });

    if (matches.length === 0) return null;
    return matches.find(m => m.locked) || matches[0];
  }

  getIdCardRecordById(id: string): IdCardRecord | null {
    this.ensureMeetingArrays();
    return (this.data.idCardRecords || []).find(r => r.id === id) || null;
  }

  canUploadMemberIdPhoto(refCode: string): {
    allowed: boolean;
    reason?: 'not_found' | 'not_approved' | 'already_issued' | 'photo_already_uploaded';
    existingRecord?: IdCardRecord | null;
    existingPhotoUrl?: string;
    canonicalCode?: string;
  } {
    const { appItem, volMatch, canonicalCode } = this.resolveHolderByRefCode(refCode);
    if (!appItem && !volMatch) {
      return { allowed: false, reason: 'not_found' };
    }
    if (appItem && appItem.status !== 'Approved') {
      return { allowed: false, reason: 'not_approved' };
    }

    const existing = this.getIdCardRecordByCode(canonicalCode);
    if (existing && existing.locked) {
      return {
        allowed: false,
        reason: 'already_issued',
        existingRecord: existing,
        existingPhotoUrl: existing.photoUrl,
        canonicalCode
      };
    }

    const photoLocked = Boolean(
      existing?.photoLocked || appItem?.idCardPhotoLocked || volMatch?.idCardPhotoLocked
    );
    const existingPhotoUrl =
      existing?.photoUrl || volMatch?.idCardPhotoUrl || appItem?.idCardPhotoUrl || volMatch?.avatar || appItem?.avatar;

    if (photoLocked && existingPhotoUrl) {
      return {
        allowed: false,
        reason: 'photo_already_uploaded',
        existingRecord: existing,
        existingPhotoUrl,
        canonicalCode
      };
    }

    return { allowed: true, existingRecord: existing, canonicalCode };
  }

  lockMemberIdCardPhoto(params: { refCode: string; photoUrl: string }): {
    ok: boolean;
    reason?: 'not_found' | 'not_approved' | 'already_issued' | 'photo_already_uploaded';
    photoUrl?: string;
  } {
    this.ensureMeetingArrays();
    const eligibility = this.canUploadMemberIdPhoto(params.refCode);
    if (!eligibility.allowed) {
      return {
        ok: false,
        reason: eligibility.reason,
        photoUrl: eligibility.existingPhotoUrl
      };
    }

    const { appItem, volMatch, resolvedEmail, resolvedPhone } = this.resolveHolderByRefCode(params.refCode);
    const nowIso = new Date().toISOString();

    if (appItem) {
      appItem.avatar = params.photoUrl;
      appItem.idCardPhotoUrl = params.photoUrl;
      appItem.idCardPhotoLocked = true;
      appItem.updatedAt = nowIso;
      mongoUpsert('applications', appItem.id, appItem).catch(() => {});
    }

    if (volMatch) {
      volMatch.avatar = params.photoUrl;
      volMatch.idCardPhotoUrl = params.photoUrl;
      volMatch.idCardPhotoLocked = true;
      mongoUpsert('volunteers', volMatch.id, volMatch).catch(() => {});
    }

    // Lock photo on any existing unlocked re-issue record sharing identity
    if (eligibility.existingRecord && !eligibility.existingRecord.locked) {
      eligibility.existingRecord.photoUrl = params.photoUrl;
      eligibility.existingRecord.photoLocked = true;
      eligibility.existingRecord.updatedAt = nowIso;
      mongoUpsert('idCardRecords', eligibility.existingRecord.id, eligibility.existingRecord).catch(() => {});
    }

    // Also mark sibling application/volunteer sharing identical email/phone so user cannot upload again via secondary code
    for (const a of this.data.applications) {
      if (a.id === appItem?.id) continue;
      const sameEmail = Boolean(resolvedEmail && this.normalizeEmailId(a.email) === resolvedEmail);
      const samePhone = Boolean(resolvedPhone && this.normalizePhoneId(a.phone) === resolvedPhone);
      if (sameEmail || samePhone) {
        a.idCardPhotoUrl = params.photoUrl;
        a.idCardPhotoLocked = true;
        a.updatedAt = nowIso;
        mongoUpsert('applications', a.id, a).catch(() => {});
      }
    }

    this.save();
    return { ok: true, photoUrl: params.photoUrl };
  }

  canIssueMemberIdCard(refCode: string, extraPhone?: string): {
    allowed: boolean;
    reason?: 'not_found' | 'not_approved' | 'already_issued';
    existingRecord?: IdCardRecord | null;
    canonicalCode?: string;
    lockedPhotoUrl?: string;
    isPhotoLocked?: boolean;
  } {
    const { appItem, volMatch, canonicalCode } = this.resolveHolderByRefCode(refCode);
    if (!appItem && !volMatch) {
      return { allowed: false, reason: 'not_found' };
    }
    if (appItem && appItem.status !== 'Approved') {
      return { allowed: false, reason: 'not_approved' };
    }
    const existing = this.getIdCardRecordByCode(canonicalCode, extraPhone);
    if (existing && existing.locked) {
      return { allowed: false, reason: 'already_issued', existingRecord: existing, canonicalCode };
    }

    const isPhotoLocked = Boolean(
      existing?.photoLocked || appItem?.idCardPhotoLocked || volMatch?.idCardPhotoLocked
    );
    const lockedPhotoUrl = isPhotoLocked
      ? existing?.photoUrl || volMatch?.idCardPhotoUrl || appItem?.idCardPhotoUrl
      : undefined;

    return {
      allowed: true,
      existingRecord: existing,
      canonicalCode,
      lockedPhotoUrl,
      isPhotoLocked
    };
  }

  issueMemberIdCard(params: {
    refCode: string;
    photoUrl: string;
    city?: string;
    phone?: string;
    format?: 'pdf' | 'dual' | 'front' | 'print';
  }): {
    ok: boolean;
    reason?: 'not_found' | 'not_approved' | 'already_issued';
    record?: IdCardRecord;
  } {
    this.ensureMeetingArrays();
    const { appItem, volMatch, canonicalCode, resolvedEmail, resolvedPhone: holderNormPhone } =
      this.resolveHolderByRefCode(params.refCode);
    if (!appItem && !volMatch) {
      return { ok: false, reason: 'not_found' };
    }
    if (appItem && appItem.status !== 'Approved') {
      return { ok: false, reason: 'not_approved' };
    }

    const existing = this.getIdCardRecordByCode(canonicalCode, params.phone);
    if (existing && existing.locked) {
      return { ok: false, reason: 'already_issued', record: existing };
    }

    const nowIso = new Date().toISOString();
    const resolvedCity = (params.city && params.city.trim()) || volMatch?.city || appItem?.city || 'National Chapter';
    const resolvedPhone = (params.phone && params.phone.trim()) || volMatch?.phone || appItem?.phone || '';
    const resolvedName = volMatch?.fullName || appItem?.fullName || 'Council Member';
    const recordEmail = volMatch?.email || appItem?.email || '';
    const resolvedRole = volMatch?.assignedRole || appItem?.preferredRole || 'MEMBER NEXGEN COUNCIL';

    // If a single portrait photo was already locked on first upload, preserve it strictly
    const finalPhotoUrl =
      existing?.photoLocked && existing.photoUrl
        ? existing.photoUrl
        : appItem?.idCardPhotoLocked && appItem.idCardPhotoUrl
        ? appItem.idCardPhotoUrl
        : volMatch?.idCardPhotoLocked && volMatch.idCardPhotoUrl
        ? volMatch.idCardPhotoUrl
        : params.photoUrl;

    if (appItem) {
      appItem.avatar = finalPhotoUrl;
      appItem.idCardPhotoUrl = finalPhotoUrl;
      appItem.idCardPhotoLocked = true;
      appItem.idCardIssued = true;
      appItem.idCardIssuedAt = nowIso;
      appItem.city = resolvedCity;
      if (resolvedPhone) appItem.phone = resolvedPhone;
      appItem.updatedAt = nowIso;
      mongoUpsert('applications', appItem.id, appItem).catch(() => {});
    }

    if (volMatch) {
      volMatch.avatar = finalPhotoUrl;
      volMatch.idCardPhotoUrl = finalPhotoUrl;
      volMatch.idCardPhotoLocked = true;
      volMatch.idCardIssued = true;
      volMatch.idCardIssuedAt = nowIso;
      volMatch.city = resolvedCity;
      if (resolvedPhone) volMatch.phone = resolvedPhone;
      mongoUpsert('volunteers', volMatch.id, volMatch).catch(() => {});
    }

    // Also lock any matching email/phone sibling applications or volunteers
    const submittedNormPhone = this.normalizePhoneId(resolvedPhone);
    for (const a of this.data.applications) {
      if (a.id === appItem?.id) continue;
      const sameEmail = Boolean(resolvedEmail && this.normalizeEmailId(a.email) === resolvedEmail);
      const aPhone = this.normalizePhoneId(a.phone);
      const samePhone = Boolean(
        aPhone && ((holderNormPhone && aPhone === holderNormPhone) || (submittedNormPhone && aPhone === submittedNormPhone))
      );
      if (sameEmail || samePhone) {
        a.idCardIssued = true;
        a.idCardIssuedAt = nowIso;
        a.idCardPhotoUrl = finalPhotoUrl;
        a.idCardPhotoLocked = true;
        a.updatedAt = nowIso;
        mongoUpsert('applications', a.id, a).catch(() => {});
      }
    }

    const record: IdCardRecord = {
      id: existing?.id || `idc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      referenceCode: canonicalCode,
      applicationId: appItem?.id || existing?.applicationId,
      volunteerId: volMatch?.id || existing?.volunteerId,
      fullName: resolvedName,
      email: recordEmail,
      phone: resolvedPhone,
      city: resolvedCity,
      assignedRole: resolvedRole,
      assignedProgram: volMatch?.assignedProgram || existing?.assignedProgram,
      membershipTier: volMatch?.membershipTier || existing?.membershipTier || 'Active Volunteer Scholar',
      photoUrl: finalPhotoUrl,
      photoLocked: true,
      issuedAt: nowIso,
      issuedFormat: params.format || 'pdf',
      downloadCount: (existing?.downloadCount || 0) + 1,
      locked: true,
      resetByAdminAt: existing?.resetByAdminAt,
      resetByAdminName: existing?.resetByAdminName,
      updatedAt: nowIso
    };

    if (existing) {
      this.data.idCardRecords = (this.data.idCardRecords || []).map(r => (r.id === existing.id ? record : r));
    } else {
      this.data.idCardRecords!.unshift(record);
    }

    this.save();
    mongoUpsert('idCardRecords', record.id, record).catch(() => {});
    return { ok: true, record };
  }

  resetIdCardLock(id: string, adminName: string): IdCardRecord | null {
    this.ensureMeetingArrays();
    const record = (this.data.idCardRecords || []).find(
      r => r.id === id || r.referenceCode.toUpperCase() === id.trim().toUpperCase()
    );
    if (!record) return null;

    const nowIso = new Date().toISOString();
    record.locked = false;
    record.photoLocked = false;
    record.resetByAdminAt = nowIso;
    record.resetByAdminName = adminName;
    record.updatedAt = nowIso;

    const recEmail = this.normalizeEmailId(record.email);
    const recPhone = this.normalizePhoneId(record.phone);

    for (const appItem of this.data.applications) {
      const match =
        appItem.id === record.applicationId ||
        (recEmail && this.normalizeEmailId(appItem.email) === recEmail) ||
        (recPhone && this.normalizePhoneId(appItem.phone) === recPhone);
      if (match) {
        appItem.idCardIssued = false;
        appItem.idCardPhotoLocked = false;
        appItem.updatedAt = nowIso;
        mongoUpsert('applications', appItem.id, appItem).catch(() => {});
      }
    }

    for (const vol of this.data.volunteers) {
      const match =
        vol.id === record.volunteerId ||
        (recEmail && this.normalizeEmailId(vol.email) === recEmail) ||
        (recPhone && this.normalizePhoneId(vol.phone) === recPhone);
      if (match) {
        vol.idCardIssued = false;
        vol.idCardPhotoLocked = false;
        mongoUpsert('volunteers', vol.id, vol).catch(() => {});
      }
    }

    this.save();
    mongoUpsert('idCardRecords', record.id, record).catch(() => {});
    return record;
  }

  deleteIdCardRecord(id: string): boolean {
    this.ensureMeetingArrays();
    const record = (this.data.idCardRecords || []).find(r => r.id === id);
    if (!record) return false;

    this.data.idCardRecords = (this.data.idCardRecords || []).filter(r => r.id !== id);
    const nowIso = new Date().toISOString();
    const recEmail = this.normalizeEmailId(record.email);
    const recPhone = this.normalizePhoneId(record.phone);

    for (const appItem of this.data.applications) {
      const match =
        appItem.id === record.applicationId ||
        (recEmail && this.normalizeEmailId(appItem.email) === recEmail) ||
        (recPhone && this.normalizePhoneId(appItem.phone) === recPhone);
      if (match) {
        appItem.idCardIssued = false;
        appItem.idCardIssuedAt = undefined;
        appItem.idCardPhotoLocked = false;
        appItem.updatedAt = nowIso;
        mongoUpsert('applications', appItem.id, appItem).catch(() => {});
      }
    }

    for (const vol of this.data.volunteers) {
      const match =
        vol.id === record.volunteerId ||
        (recEmail && this.normalizeEmailId(vol.email) === recEmail) ||
        (recPhone && this.normalizePhoneId(vol.phone) === recPhone);
      if (match) {
        vol.idCardIssued = false;
        vol.idCardIssuedAt = undefined;
        vol.idCardPhotoLocked = false;
        mongoUpsert('volunteers', vol.id, vol).catch(() => {});
      }
    }

    this.save();
    mongoDelete('idCardRecords', id).catch(() => {});
    return true;
  }

  // --- Signatories & Protected Institutional Stamps ---
  private normalizeSignatoryRoleList(roles: unknown): string[] {
    const valid = ['SUPER_ADMIN', 'ADMIN', 'VOLUNTEER_MANAGER'];
    if (!Array.isArray(roles)) return ['SUPER_ADMIN', 'ADMIN'];
    const filtered = Array.from(
      new Set(
        roles
          .map(r => String(r || '').trim().toUpperCase())
          .filter(r => valid.includes(r))
      )
    );
    if (!filtered.includes('SUPER_ADMIN')) filtered.unshift('SUPER_ADMIN');
    return filtered;
  }

  getSignatories(options?: { activeOnly?: boolean; userRole?: string }): SignatoryProfile[] {
    this.ensureMeetingArrays();
    let list = [...(this.data.signatories || [])];
    if (options?.activeOnly) {
      list = list.filter(s => s.active);
    }
    if (options?.userRole) {
      const roleNorm = options.userRole.trim().toUpperCase();
      if (roleNorm !== 'SUPER_ADMIN') {
        list = list.filter(s => Array.isArray(s.allowedRoles) && s.allowedRoles.includes(roleNorm));
      }
    }
    return list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  }

  getSignatoryById(id?: string): SignatoryProfile | null {
    this.ensureMeetingArrays();
    if (!id) return null;
    return (this.data.signatories || []).find(s => s.id === id) || null;
  }

  createSignatory(
    input: Partial<SignatoryProfile> & { name: string; title: string },
    actorName: string
  ): SignatoryProfile {
    this.ensureMeetingArrays();
    const now = new Date().toISOString();
    const validRoleTypes: SignatoryProfile['roleType'][] = [
      'Executive Director',
      'President',
      'Director',
      'Authorized Signatory'
    ];
    const roleType = validRoleTypes.includes(input.roleType as any)
      ? (input.roleType as SignatoryProfile['roleType'])
      : 'Authorized Signatory';

    const shouldBeDefault = Boolean(input.isDefault) || this.data.signatories!.length === 0;
    if (shouldBeDefault) {
      for (const s of this.data.signatories!) {
        if (s.isDefault) {
          s.isDefault = false;
          mongoUpsert('signatories', s.id, s).catch(() => {});
        }
      }
    }

    const sig: SignatoryProfile = {
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: input.name.trim(),
      title: input.title.trim(),
      roleType,
      department: input.department?.trim() || 'Council Secretariat',
      signatureAssetFilename: input.signatureAssetFilename?.trim() || undefined,
      stampAssetFilename: input.stampAssetFilename?.trim() || undefined,
      hasSignatureImage: Boolean(input.signatureAssetFilename?.trim()),
      hasStampImage: Boolean(input.stampAssetFilename?.trim()),
      active: input.active !== false,
      isDefault: shouldBeDefault,
      allowedRoles: this.normalizeSignatoryRoleList(input.allowedRoles),
      createdAt: now,
      updatedAt: now,
      updatedBy: actorName
    };

    this.data.signatories!.unshift(sig);
    this.save();
    mongoUpsert('signatories', sig.id, sig).catch(() => {});
    return sig;
  }

  updateSignatory(
    id: string,
    updates: Partial<SignatoryProfile>,
    actorName: string
  ): SignatoryProfile | null {
    this.ensureMeetingArrays();
    const idx = (this.data.signatories || []).findIndex(s => s.id === id);
    if (idx === -1) return null;
    const current = this.data.signatories![idx];
    const now = new Date().toISOString();

    const validRoleTypes: SignatoryProfile['roleType'][] = [
      'Executive Director',
      'President',
      'Director',
      'Authorized Signatory'
    ];

    if (updates.isDefault === true) {
      for (const s of this.data.signatories!) {
        if (s.id !== id && s.isDefault) {
          s.isDefault = false;
          mongoUpsert('signatories', s.id, s).catch(() => {});
        }
      }
    }

    const nextSigFilename =
      updates.signatureAssetFilename !== undefined
        ? updates.signatureAssetFilename?.trim() || undefined
        : current.signatureAssetFilename;
    const nextStampFilename =
      updates.stampAssetFilename !== undefined
        ? updates.stampAssetFilename?.trim() || undefined
        : current.stampAssetFilename;

    const updated: SignatoryProfile = {
      ...current,
      name: typeof updates.name === 'string' && updates.name.trim() ? updates.name.trim() : current.name,
      title: typeof updates.title === 'string' && updates.title.trim() ? updates.title.trim() : current.title,
      roleType: validRoleTypes.includes(updates.roleType as any)
        ? (updates.roleType as SignatoryProfile['roleType'])
        : current.roleType,
      department:
        typeof updates.department === 'string'
          ? updates.department.trim() || 'Council Secretariat'
          : current.department,
      signatureAssetFilename: nextSigFilename,
      stampAssetFilename: nextStampFilename,
      hasSignatureImage: Boolean(nextSigFilename),
      hasStampImage: Boolean(nextStampFilename),
      active: typeof updates.active === 'boolean' ? updates.active : current.active,
      isDefault: typeof updates.isDefault === 'boolean' ? updates.isDefault : current.isDefault,
      allowedRoles:
        updates.allowedRoles !== undefined
          ? this.normalizeSignatoryRoleList(updates.allowedRoles)
          : current.allowedRoles,
      updatedAt: now,
      updatedBy: actorName
    };

    this.data.signatories![idx] = updated;
    this.save();
    mongoUpsert('signatories', updated.id, updated).catch(() => {});
    return updated;
  }

  deleteSignatory(id: string): boolean {
    this.ensureMeetingArrays();
    const list = this.data.signatories || [];
    if (list.length <= 1) return false;
    const target = list.find(s => s.id === id);
    if (!target) return false;

    this.data.signatories = list.filter(s => s.id !== id);
    if (target.isDefault && this.data.signatories.length > 0) {
      this.data.signatories[0].isDefault = true;
      mongoUpsert('signatories', this.data.signatories[0].id, this.data.signatories[0]).catch(() => {});
    }
    this.save();
    mongoDelete('signatories', id).catch(() => {});
    return true;
  }

  // --- Official Appointment Letters & QR Verification ---
  getEffectiveAppointmentStatus(letter: AppointmentLetter): EffectiveAppointmentStatus {
    if (letter.status === 'Revoked') return 'REVOKED';
    if (letter.expiryDate && letter.expiryDate.trim()) {
      const expTime = new Date(`${letter.expiryDate.trim()}T23:59:59Z`).getTime();
      if (!Number.isNaN(expTime) && Date.now() > expTime) {
        return 'EXPIRED';
      }
    }
    return 'ACTIVE';
  }

  private hydrateAppointmentLetter(letter: AppointmentLetter): AppointmentLetter {
    return {
      ...letter,
      effectiveStatus: this.getEffectiveAppointmentStatus(letter)
    };
  }

  private generateUniqueAppointmentNumber(): string {
    const year = new Date().getFullYear();
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let attempt = 0; attempt < 25; attempt++) {
      let suffix = '';
      for (let i = 0; i < 4; i++) {
        suffix += chars[crypto.randomInt(0, chars.length)];
      }
      const candidate = `NXG-APT-${year}-${suffix}`;
      if (!(this.data.appointmentLetters || []).some(l => l.letterNumber.toUpperCase() === candidate)) {
        return candidate;
      }
    }
    return `NXG-APT-${year}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  getAppointmentLetters(filters?: {
    search?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): AppointmentLetter[] {
    this.ensureMeetingArrays();
    let list = (this.data.appointmentLetters || []).map(l => this.hydrateAppointmentLetter(l));

    if (filters?.status && filters.status !== 'All') {
      const st = filters.status.toUpperCase();
      list = list.filter(l => l.effectiveStatus === st);
    }

    if (filters?.fromDate) {
      const fromTs = new Date(filters.fromDate).getTime();
      if (!Number.isNaN(fromTs)) {
        list = list.filter(l => new Date(l.issuedAt).getTime() >= fromTs);
      }
    }

    if (filters?.toDate) {
      const toTs = new Date(`${filters.toDate}T23:59:59Z`).getTime();
      if (!Number.isNaN(toTs)) {
        list = list.filter(l => new Date(l.issuedAt).getTime() <= toTs);
      }
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        l =>
          l.letterNumber.toLowerCase().includes(q) ||
          l.referenceCode.toLowerCase().includes(q) ||
          l.appointeeName.toLowerCase().includes(q) ||
          l.designation.toLowerCase().includes(q) ||
          l.department.toLowerCase().includes(q) ||
          l.chapter.toLowerCase().includes(q) ||
          l.signatoryName.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }

  getAppointmentLetterById(id: string): AppointmentLetter | null {
    this.ensureMeetingArrays();
    const found = (this.data.appointmentLetters || []).find(
      l => l.id === id || l.letterNumber.toUpperCase() === id.trim().toUpperCase()
    );
    return found ? this.hydrateAppointmentLetter(found) : null;
  }

  getAppointmentLetterByToken(token: string): AppointmentLetter | null {
    this.ensureMeetingArrays();
    const clean = (token || '').trim();
    if (!clean || clean.length < 16) return null;
    const tokenBuf = Buffer.from(clean, 'utf8');
    const found = (this.data.appointmentLetters || []).find(l => {
      if (!l.verificationToken) return false;
      const storedBuf = Buffer.from(l.verificationToken, 'utf8');
      return storedBuf.length === tokenBuf.length && crypto.timingSafeEqual(storedBuf, tokenBuf);
    });
    return found ? this.hydrateAppointmentLetter(found) : null;
  }

  getAppointmentLetterByRefCode(refCode: string): AppointmentLetter | null {
    this.ensureMeetingArrays();
    const { appItem, volMatch, canonicalCode } = this.resolveHolderByRefCode(refCode);
    const cleanUpper = (refCode || '').trim().toUpperCase();
    const matches = (this.data.appointmentLetters || []).filter(l => {
      return (
        l.referenceCode.toUpperCase() === cleanUpper ||
        l.referenceCode.toUpperCase() === canonicalCode.toUpperCase() ||
        l.letterNumber.toUpperCase() === cleanUpper ||
        Boolean(appItem && l.applicationId === appItem.id) ||
        Boolean(volMatch && l.volunteerId === volMatch.id)
      );
    });
    if (matches.length === 0) return null;
    const hydrated = matches.map(m => this.hydrateAppointmentLetter(m));
    hydrated.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
    return hydrated.find(m => m.effectiveStatus === 'ACTIVE') || hydrated[0];
  }

  getEligibleApprovedApplications(): Array<{
    applicationId: string;
    volunteerId?: string;
    referenceCode: string;
    fullName: string;
    email: string;
    phone: string;
    city: string;
    preferredRole: string;
    photoUrl?: string;
    approvedAt: string;
    hasActiveLetter: boolean;
    latestLetterId?: string;
    latestLetterNumber?: string;
    latestLetterStatus?: EffectiveAppointmentStatus;
  }> {
    this.ensureMeetingArrays();
    const approvedApps = this.data.applications.filter(a => a.status === 'Approved');
    return approvedApps.map(app => {
      const vol = this.data.volunteers.find(
        v =>
          v.applicationId === app.id ||
          (this.normalizeEmailId(v.email) &&
            this.normalizeEmailId(v.email) === this.normalizeEmailId(app.email))
      );
      const letter = this.getAppointmentLetterByRefCode(app.referenceCode);
      return {
        applicationId: app.id,
        volunteerId: vol?.id,
        referenceCode: app.referenceCode,
        fullName: vol?.fullName || app.fullName,
        email: app.email,
        phone: vol?.phone || app.phone,
        city: vol?.city || app.city,
        preferredRole: vol?.assignedRole || app.preferredRole || 'Council Volunteer',
        photoUrl: vol?.idCardPhotoUrl || app.idCardPhotoUrl || vol?.avatar || app.avatar,
        approvedAt: app.reviewedAt || app.updatedAt || app.createdAt,
        hasActiveLetter: Boolean(letter && letter.effectiveStatus === 'ACTIVE'),
        latestLetterId: letter?.id,
        latestLetterNumber: letter?.letterNumber,
        latestLetterStatus: letter?.effectiveStatus
      };
    });
  }

  createAppointmentLetter(params: {
    applicationId?: string;
    volunteerId?: string;
    referenceCode: string;
    appointeeName?: string;
    appointeeEmail?: string;
    appointeePhone?: string;
    appointeePhotoUrl?: string;
    country?: string;
    designation: string;
    department: string;
    chapter: string;
    appointmentType: AppointmentType;
    membershipTier: string;
    effectiveDate: string;
    expiryDate?: string;
    tenure: string;
    renewalEligibility: string;
    reportingAuthority: string;
    customNotes?: string;
    signatoryId?: string;
    issuer: { userId: string; name: string; role: string };
  }): { ok: true; letter: AppointmentLetter } | { ok: false; error: string; status: number } {
    this.ensureMeetingArrays();
    const { appItem, volMatch, canonicalCode } = this.resolveHolderByRefCode(
      params.referenceCode || params.applicationId || params.volunteerId || ''
    );

    const targetApp =
      (params.applicationId ? this.getApplicationById(params.applicationId) : null) || appItem;
    const targetVol =
      (params.volunteerId ? this.data.volunteers.find(v => v.id === params.volunteerId) : null) ||
      volMatch;

    if (!targetApp && !targetVol) {
      return { ok: false, status: 404, error: 'Referenced approved application or volunteer was not found.' };
    }
    if (targetApp && targetApp.status !== 'Approved') {
      return {
        ok: false,
        status: 403,
        error: 'Appointment letters may only be generated for Approved applications.'
      };
    }

    // Resolve signatory & permission
    const allSignatories = this.getSignatories({ activeOnly: false });
    const chosenSignatory =
      (params.signatoryId ? allSignatories.find(s => s.id === params.signatoryId) : null) ||
      allSignatories.find(s => s.active && s.isDefault) ||
      allSignatories.find(s => s.active);

    if (!chosenSignatory) {
      return { ok: false, status: 400, error: 'No active authorized signatory configured.' };
    }
    if (!chosenSignatory.active) {
      return { ok: false, status: 400, error: 'Selected signatory is currently inactive.' };
    }
    const issuerRoleNorm = params.issuer.role.trim().toUpperCase();
    if (
      issuerRoleNorm !== 'SUPER_ADMIN' &&
      Array.isArray(chosenSignatory.allowedRoles) &&
      !chosenSignatory.allowedRoles.includes(issuerRoleNorm)
    ) {
      return {
        ok: false,
        status: 403,
        error: `Your role (${params.issuer.role}) does not have permission to issue letters under signatory ${chosenSignatory.name}.`
      };
    }

    const nowIso = new Date().toISOString();
    const letter: AppointmentLetter = {
      id: `apt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      applicationId: targetApp?.id,
      volunteerId: targetVol?.id,
      referenceCode: targetApp?.referenceCode || canonicalCode || params.referenceCode.trim().toUpperCase(),
      letterNumber: this.generateUniqueAppointmentNumber(),
      verificationToken: crypto.randomBytes(24).toString('hex'),
      appointeeName: (params.appointeeName || targetVol?.fullName || targetApp?.fullName || 'Council Member').trim(),
      appointeeEmail: (params.appointeeEmail || targetVol?.email || targetApp?.email || '').trim().toLowerCase(),
      appointeePhone: (params.appointeePhone || targetVol?.phone || targetApp?.phone || '').trim(),
      appointeePhotoUrl:
        params.appointeePhotoUrl ||
        targetVol?.idCardPhotoUrl ||
        targetApp?.idCardPhotoUrl ||
        targetVol?.avatar ||
        targetApp?.avatar,
      country: (params.country || 'Pakistan').trim(),
      designation: params.designation.trim(),
      department: params.department.trim(),
      chapter: (params.chapter || targetVol?.city || targetApp?.city || 'Sialkot').trim(),
      appointmentType: params.appointmentType || 'Volunteer',
      membershipTier: (params.membershipTier || targetVol?.membershipTier || 'Active Volunteer Scholar').trim(),
      effectiveDate: (params.effectiveDate || nowIso.split('T')[0]).trim(),
      expiryDate: params.expiryDate?.trim() || undefined,
      tenure: (params.tenure || '12 Months (Renewable)').trim(),
      renewalEligibility: (params.renewalEligibility || 'Eligible upon satisfactory performance review').trim(),
      reportingAuthority: (params.reportingAuthority || 'Director of Operations & Council Secretariat').trim(),
      customNotes: params.customNotes?.trim() || '',
      signatoryId: chosenSignatory.id,
      signatoryName: chosenSignatory.name,
      signatoryTitle: chosenSignatory.title,
      signatoryRoleType: chosenSignatory.roleType,
      issuedBy: params.issuer.userId,
      issuedByName: params.issuer.name,
      issuedByRole: params.issuer.role,
      issuedAt: nowIso,
      updatedAt: nowIso,
      downloadCount: 0,
      status: 'Active',
      emailNotificationCount: 0
    };

    this.data.appointmentLetters!.unshift(letter);
    this.save();
    mongoUpsert('appointmentLetters', letter.id, letter).catch(() => {});
    return { ok: true, letter: this.hydrateAppointmentLetter(letter) };
  }

  updateAppointmentLetter(
    id: string,
    updates: Partial<AppointmentLetter>,
    editorRole: string
  ): { ok: true; letter: AppointmentLetter } | { ok: false; status: number; error: string } {
    this.ensureMeetingArrays();
    const idx = (this.data.appointmentLetters || []).findIndex(l => l.id === id);
    if (idx === -1) return { ok: false, status: 404, error: 'Appointment letter not found.' };
    const current = this.data.appointmentLetters![idx];

    let nextSignatoryName = current.signatoryName;
    let nextSignatoryTitle = current.signatoryTitle;
    let nextSignatoryRoleType = current.signatoryRoleType;
    let nextSignatoryId = current.signatoryId;

    if (updates.signatoryId && updates.signatoryId !== current.signatoryId) {
      const sig = this.getSignatoryById(updates.signatoryId);
      if (!sig || !sig.active) {
        return { ok: false, status: 400, error: 'Selected signatory is invalid or inactive.' };
      }
      const roleNorm = editorRole.trim().toUpperCase();
      if (roleNorm !== 'SUPER_ADMIN' && Array.isArray(sig.allowedRoles) && !sig.allowedRoles.includes(roleNorm)) {
        return { ok: false, status: 403, error: `Role ${editorRole} is not authorized to assign signatory ${sig.name}.` };
      }
      nextSignatoryId = sig.id;
      nextSignatoryName = sig.name;
      nextSignatoryTitle = sig.title;
      nextSignatoryRoleType = sig.roleType;
    }

    // Strict immutability protection: never allow client mutation of letterNumber, verificationToken, issuedBy*, issuedAt
    const updated: AppointmentLetter = {
      ...current,
      appointeeName:
        typeof updates.appointeeName === 'string' && updates.appointeeName.trim()
          ? updates.appointeeName.trim()
          : current.appointeeName,
      country: typeof updates.country === 'string' ? updates.country.trim() || current.country : current.country,
      designation:
        typeof updates.designation === 'string' && updates.designation.trim()
          ? updates.designation.trim()
          : current.designation,
      department:
        typeof updates.department === 'string' && updates.department.trim()
          ? updates.department.trim()
          : current.department,
      chapter:
        typeof updates.chapter === 'string' && updates.chapter.trim()
          ? updates.chapter.trim()
          : current.chapter,
      appointmentType: updates.appointmentType || current.appointmentType,
      membershipTier:
        typeof updates.membershipTier === 'string' && updates.membershipTier.trim()
          ? updates.membershipTier.trim()
          : current.membershipTier,
      effectiveDate:
        typeof updates.effectiveDate === 'string' && updates.effectiveDate.trim()
          ? updates.effectiveDate.trim()
          : current.effectiveDate,
      expiryDate: updates.expiryDate !== undefined ? updates.expiryDate?.trim() || undefined : current.expiryDate,
      tenure:
        typeof updates.tenure === 'string' && updates.tenure.trim() ? updates.tenure.trim() : current.tenure,
      renewalEligibility:
        typeof updates.renewalEligibility === 'string' && updates.renewalEligibility.trim()
          ? updates.renewalEligibility.trim()
          : current.renewalEligibility,
      reportingAuthority:
        typeof updates.reportingAuthority === 'string' && updates.reportingAuthority.trim()
          ? updates.reportingAuthority.trim()
          : current.reportingAuthority,
      customNotes: updates.customNotes !== undefined ? updates.customNotes.trim() : current.customNotes,
      signatoryId: nextSignatoryId,
      signatoryName: nextSignatoryName,
      signatoryTitle: nextSignatoryTitle,
      signatoryRoleType: nextSignatoryRoleType,
      updatedAt: new Date().toISOString()
    };

    this.data.appointmentLetters![idx] = updated;
    this.save();
    mongoUpsert('appointmentLetters', updated.id, updated).catch(() => {});
    return { ok: true, letter: this.hydrateAppointmentLetter(updated) };
  }

  updateAppointmentLetterStatus(
    id: string,
    status: AppointmentLetterStatus,
    actor: { userId: string; name: string },
    reason?: string
  ): AppointmentLetter | null {
    this.ensureMeetingArrays();
    const idx = (this.data.appointmentLetters || []).findIndex(l => l.id === id);
    if (idx === -1) return null;
    const current = this.data.appointmentLetters![idx];
    const nowIso = new Date().toISOString();

    const updated: AppointmentLetter = {
      ...current,
      status,
      updatedAt: nowIso,
      ...(status === 'Revoked'
        ? {
            revokedBy: actor.userId,
            revokedByName: actor.name,
            revokedAt: nowIso,
            revocationReason: (reason || 'Revoked by authorized Secretariat administrator.').trim()
          }
        : {
            revokedBy: undefined,
            revokedByName: undefined,
            revokedAt: undefined,
            revocationReason: undefined
          })
    };

    this.data.appointmentLetters![idx] = updated;
    this.save();
    mongoUpsert('appointmentLetters', updated.id, updated).catch(() => {});
    return this.hydrateAppointmentLetter(updated);
  }

  incrementAppointmentLetterDownload(id: string): AppointmentLetter | null {
    this.ensureMeetingArrays();
    const idx = (this.data.appointmentLetters || []).findIndex(l => l.id === id);
    if (idx === -1) return null;
    const current = this.data.appointmentLetters![idx];
    current.downloadCount = (current.downloadCount || 0) + 1;
    this.save();
    mongoUpsert('appointmentLetters', current.id, current).catch(() => {});
    return this.hydrateAppointmentLetter(current);
  }

  markAppointmentEmailSent(id: string): AppointmentLetter | null {
    this.ensureMeetingArrays();
    const idx = (this.data.appointmentLetters || []).findIndex(l => l.id === id);
    if (idx === -1) return null;
    const current = this.data.appointmentLetters![idx];
    current.lastEmailSentAt = new Date().toISOString();
    current.emailNotificationCount = (current.emailNotificationCount || 0) + 1;
    this.save();
    mongoUpsert('appointmentLetters', current.id, current).catch(() => {});
    return this.hydrateAppointmentLetter(current);
  }

  // --- Programs ---
  getPrograms(publishedOnly = false) {
    if (publishedOnly) {
      return this.data.programs.filter(p => p.status === 'Published');
    }
    return this.data.programs;
  }

  getProgramBySlugOrId(identifier: string) {
    const clean = (identifier || '').trim().toLowerCase();
    return this.data.programs.find(
      p => p.id.toLowerCase() === clean || (p.slug && p.slug.toLowerCase() === clean)
    ) || null;
  }

  getProgramBySlug(slug: string) {
    const clean = (slug || '').trim().toLowerCase();
    return this.data.programs.find(
      p => (p.slug && p.slug.toLowerCase() === clean) || p.id.toLowerCase() === clean
    ) || null;
  }

  createProgram(programData: Omit<Program, 'id' | 'createdAt'>) {
    const newProgram: Program = {
      ...programData,
      id: `prg_${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    this.data.programs.unshift(newProgram);
    this.save();
    mongoUpsert('programs', newProgram.id, newProgram).catch(() => {});
    return newProgram;
  }

  updateProgram(id: string, updates: Partial<Program>) {
    const idx = this.data.programs.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.data.programs[idx] = { ...this.data.programs[idx], ...updates };
    this.save();
    mongoUpsert('programs', id, this.data.programs[idx]).catch(() => {});
    return this.data.programs[idx];
  }

  deleteProgram(id: string) {
    this.data.programs = this.data.programs.filter(p => p.id !== id);
    this.save();
    mongoDelete('programs', id).catch(() => {});
  }

  // --- Events ---
  getEvents(filter?: 'Upcoming' | 'Past' | 'All') {
    if (filter === 'Upcoming') {
      return this.data.events.filter(e => e.status === 'Upcoming');
    }
    if (filter === 'Past') {
      return this.data.events.filter(e => e.status === 'Past');
    }
    return this.data.events;
  }

  getEventBySlug(slug: string) {
    const clean = (slug || '').trim().toLowerCase();
    return this.data.events.find(
      e => (e.slug && e.slug.toLowerCase() === clean) || e.id.toLowerCase() === clean
    ) || null;
  }

  private sanitizeKeywordList(input: unknown, maxItems = 25): string[] {
    if (Array.isArray(input)) {
      return Array.from(
        new Set(
          input
            .map(v => (typeof v === 'string' ? v.trim() : ''))
            .filter(Boolean)
        )
      ).slice(0, maxItems);
    }
    if (typeof input === 'string') {
      return Array.from(
        new Set(
          input
            .split(',')
            .map(v => v.trim())
            .filter(Boolean)
        )
      ).slice(0, maxItems);
    }
    return [];
  }

  private normalizeEventFields(raw: Partial<EventItem>): Partial<EventItem> {
    const out: Partial<EventItem> = { ...raw };
    const cleanImg = (val: unknown): string | undefined => {
      if (typeof val !== 'string') return undefined;
      const trimmed = val.trim();
      if (!trimmed) return '';
      return trimmed.startsWith('uploads/') ? `/${trimmed}` : trimmed;
    };
    const cleanedCover = cleanImg(out.coverImage);
    const cleanedImage = cleanImg(out.image);
    if (cleanedCover !== undefined || cleanedImage !== undefined) {
      const resolved = cleanedCover !== undefined && cleanedCover !== '' ? cleanedCover : cleanedImage ?? '';
      out.coverImage = resolved;
      out.image = cleanedImage !== undefined && cleanedImage !== '' ? cleanedImage : resolved;
    }
    if (out.capacity !== undefined) {
      const cap = Number(out.capacity);
      out.capacity = Number.isFinite(cap) && cap > 0 ? Math.min(100000, Math.floor(cap)) : 0;
    }
    if (out.registeredCount !== undefined) {
      const reg = Number(out.registeredCount);
      out.registeredCount = Number.isFinite(reg) && reg >= 0 ? Math.min(100000, Math.floor(reg)) : 0;
    }
    if (out.showCapacity !== undefined) {
      out.showCapacity = Boolean(out.showCapacity);
    }
    if (out.waitlistEnabled !== undefined) {
      out.waitlistEnabled = Boolean(out.waitlistEnabled);
    }
    return out;
  }

  createEvent(eventData: Omit<EventItem, 'id'>) {
    const normalized = this.normalizeEventFields(eventData);
    const now = new Date().toISOString();
    const newEvent: EventItem = {
      ...(normalized as Omit<EventItem, 'id'>),
      id: `evt_${Date.now()}`,
      slug:
        normalized.slug ||
        (normalized.title || 'event')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
      showCapacity: normalized.showCapacity !== undefined ? normalized.showCapacity : true,
      waitlistEnabled: Boolean(normalized.waitlistEnabled),
      registeredCount: normalized.registeredCount ?? 0,
      createdAt: now,
      updatedAt: now
    };
    this.data.events.unshift(newEvent);
    this.save();
    mongoUpsert('events', newEvent.id, newEvent).catch(() => {});
    return newEvent;
  }

  updateEvent(id: string, updates: Partial<EventItem>) {
    const idx = this.data.events.findIndex(e => e.id === id);
    if (idx === -1) return null;
    const normalized = this.normalizeEventFields(updates);
    this.data.events[idx] = {
      ...this.data.events[idx],
      ...normalized,
      updatedAt: new Date().toISOString()
    };
    this.save();
    mongoUpsert('events', id, this.data.events[idx]).catch(() => {});
    return this.data.events[idx];
  }

  registerEventRsvp(id: string): {
    status: 'ok' | 'waitlisted' | 'full' | 'not_found';
    event?: EventItem;
  } {
    const idx = this.data.events.findIndex(e => e.id === id || e.slug === id);
    if (idx === -1) return { status: 'not_found' };
    const evt = this.data.events[idx];
    const cap = Number(evt.capacity || 0);
    const currentReg = Number(evt.registeredCount || 0);

    if (cap > 0 && currentReg >= cap) {
      if (!evt.waitlistEnabled) {
        return { status: 'full', event: evt };
      }
      const updated: EventItem = {
        ...evt,
        registeredCount: currentReg + 1,
        updatedAt: new Date().toISOString()
      };
      this.data.events[idx] = updated;
      this.save();
      mongoUpsert('events', updated.id, updated).catch(() => {});
      return { status: 'waitlisted', event: updated };
    }

    const updated: EventItem = {
      ...evt,
      registeredCount: currentReg + 1,
      updatedAt: new Date().toISOString()
    };
    this.data.events[idx] = updated;
    this.save();
    mongoUpsert('events', updated.id, updated).catch(() => {});
    return { status: 'ok', event: updated };
  }

  deleteEvent(id: string) {
    this.data.events = this.data.events.filter(e => e.id !== id);
    this.save();
    mongoDelete('events', id).catch(() => {});
  }

  // --- News ---
  getNews(publishedOnly = false) {
    if (publishedOnly) {
      return this.data.news.filter(n => n.status === 'Published');
    }
    return this.data.news;
  }

  getNewsBySlug(slug: string) {
    const clean = (slug || '').trim().toLowerCase();
    return this.data.news.find(
      n => (n.slug && n.slug.toLowerCase() === clean) || n.id.toLowerCase() === clean
    ) || null;
  }

  private normalizeNewsFields(raw: Partial<NewsItem>): Partial<NewsItem> {
    const out: Partial<NewsItem> = { ...raw };
    if (typeof out.slug === 'string' && out.slug.trim()) {
      out.slug = out.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }
    if (out.tags !== undefined) {
      out.tags = this.sanitizeKeywordList(out.tags, 15);
    }
    if (out.seoKeywords !== undefined) {
      out.seoKeywords = this.sanitizeKeywordList(out.seoKeywords, 30);
    }
    if (typeof out.seoTitle === 'string') {
      out.seoTitle = out.seoTitle.trim().slice(0, 120);
    }
    if (typeof out.seoDescription === 'string') {
      out.seoDescription = out.seoDescription.trim().slice(0, 320);
    }
    if (typeof out.canonicalUrl === 'string') {
      const c = out.canonicalUrl.trim();
      out.canonicalUrl = !c || /^(\/|https?:\/\/)/i.test(c) ? c : '';
    }
    if (typeof out.coverImage === 'string') {
      const cleaned = out.coverImage.trim();
      out.coverImage = cleaned.startsWith('uploads/') ? `/${cleaned}` : cleaned;
    }
    if (out.readTimeMinutes !== undefined) {
      const rt = Number(out.readTimeMinutes);
      out.readTimeMinutes = Number.isFinite(rt) && rt > 0 ? Math.min(120, Math.round(rt)) : undefined;
    }
    return out;
  }

  createNews(newsData: Omit<NewsItem, 'id'>) {
    const normalized = this.normalizeNewsFields(newsData);
    const item: NewsItem = {
      ...(normalized as Omit<NewsItem, 'id'>),
      id: `news_${Date.now()}`
    };
    this.data.news.unshift(item);
    this.save();
    mongoUpsert('news', item.id, item).catch(() => {});
    return item;
  }

  updateNews(id: string, updates: Partial<NewsItem>) {
    const idx = this.data.news.findIndex(n => n.id === id);
    if (idx === -1) return null;
    const normalized = this.normalizeNewsFields(updates);
    this.data.news[idx] = { ...this.data.news[idx], ...normalized };
    this.save();
    mongoUpsert('news', id, this.data.news[idx]).catch(() => {});
    return this.data.news[idx];
  }

  deleteNews(id: string) {
    this.data.news = this.data.news.filter(n => n.id !== id);
    this.save();
    mongoDelete('news', id).catch(() => {});
  }

  // --- Team ---
  getTeam(activeOnly = false) {
    let list = this.data.team.map((t, idx) => ({
      ...t,
      displayOrder: Number.isFinite(Number(t.displayOrder ?? (t as any).order))
        ? Number(t.displayOrder ?? (t as any).order)
        : idx + 1
    }));
    if (activeOnly) {
      list = list.filter(t => t.active);
    }
    return list.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  createTeamMember(member: Omit<TeamMember, 'id'>) {
    const rawOrder = member.displayOrder ?? (member as any).order;
    const displayOrder = Number.isFinite(Number(rawOrder)) && Number(rawOrder) > 0
      ? Number(rawOrder)
      : this.data.team.length + 1;
    const newMember: TeamMember = {
      ...member,
      displayOrder,
      linkedinUrl: member.linkedinUrl || (member as any).linkedin || '',
      id: `tm_${Date.now()}`
    };
    delete (newMember as any).order;
    delete (newMember as any).linkedin;
    this.data.team.push(newMember);
    this.save();
    mongoUpsert('team', newMember.id, newMember).catch(() => {});
    return newMember;
  }

  updateTeamMember(id: string, updates: Partial<TeamMember>) {
    const idx = this.data.team.findIndex(t => t.id === id);
    if (idx === -1) return null;
    const normalizedUpdates: Partial<TeamMember> = { ...updates };
    const rawOrder = normalizedUpdates.displayOrder ?? (normalizedUpdates as any).order;
    if (rawOrder !== undefined && Number.isFinite(Number(rawOrder))) {
      normalizedUpdates.displayOrder = Number(rawOrder);
    }
    if ((normalizedUpdates as any).linkedin !== undefined && !normalizedUpdates.linkedinUrl) {
      normalizedUpdates.linkedinUrl = (normalizedUpdates as any).linkedin;
    }
    delete (normalizedUpdates as any).order;
    delete (normalizedUpdates as any).linkedin;

    this.data.team[idx] = { ...this.data.team[idx], ...normalizedUpdates };
    this.save();
    mongoUpsert('team', id, this.data.team[idx]).catch(() => {});
    return this.data.team[idx];
  }

  reorderTeamMembers(orderedIds: string[]) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return this.getTeam(false);
    }

    const orderMap = new Map<string, number>();
    orderedIds.forEach((id, index) => {
      if (!orderMap.has(id)) {
        orderMap.set(id, index + 1);
      }
    });

    let nextOrder = orderMap.size + 1;
    const sortedCurrent = this.getTeam(false);

    this.data.team = sortedCurrent.map((member) => {
      const assignedOrder = orderMap.has(member.id)
        ? orderMap.get(member.id)!
        : nextOrder++;
      const updatedMember: TeamMember = {
        ...member,
        displayOrder: assignedOrder
      };
      delete (updatedMember as any).order;
      return updatedMember;
    });

    this.data.team.sort((a, b) => a.displayOrder - b.displayOrder);
    this.save();

    for (const member of this.data.team) {
      mongoUpsert('team', member.id, member).catch(() => {});
    }

    return this.getTeam(false);
  }

  deleteTeamMember(id: string) {
    this.data.team = this.data.team.filter(t => t.id !== id);
    this.save();
    mongoDelete('team', id).catch(() => {});
  }

  // --- Gallery ---
  getGallery() {
    return [...this.data.gallery].sort((a, b) => a.displayOrder - b.displayOrder);
  }

  createGalleryItem(item: Omit<GalleryItem, 'id'>) {
    const newItem: GalleryItem = {
      ...item,
      date: item.date || new Date().toISOString().split('T')[0],
      displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : this.data.gallery.length + 1,
      id: `gal_${Date.now()}`
    };
    this.data.gallery.push(newItem);
    this.save();
    mongoUpsert('gallery', newItem.id, newItem).catch(() => {});
    return newItem;
  }

  updateGalleryItem(id: string, updates: Partial<GalleryItem>) {
    const idx = this.data.gallery.findIndex(g => g.id === id);
    if (idx === -1) return null;
    const current = this.data.gallery[idx];
    const updated: GalleryItem = {
      ...current,
      ...(typeof updates.title === 'string' && updates.title.trim() ? { title: updates.title.trim() } : {}),
      ...(typeof updates.category === 'string' && updates.category.trim() ? { category: updates.category.trim() } : {}),
      ...(typeof updates.imageUrl === 'string' && updates.imageUrl.trim() ? { imageUrl: updates.imageUrl.trim() } : {}),
      ...(typeof updates.caption === 'string' ? { caption: updates.caption.trim() } : {}),
      ...(typeof updates.date === 'string' && updates.date.trim() ? { date: updates.date.trim() } : {}),
      ...(typeof updates.displayOrder === 'number' && !Number.isNaN(updates.displayOrder)
        ? { displayOrder: updates.displayOrder }
        : {})
    };
    this.data.gallery[idx] = updated;
    this.save();
    mongoUpsert('gallery', updated.id, updated).catch(() => {});
    return updated;
  }

  deleteGalleryItem(id: string) {
    this.data.gallery = this.data.gallery.filter(g => g.id !== id);
    this.save();
    mongoDelete('gallery', id).catch(() => {});
  }

  // --- FAQs ---
  getFaqs(activeOnly = false): FaqItem[] {
    const list = Array.isArray(this.data.faqs) ? this.data.faqs : getDefaultSeedFaqs();
    const mapped = list.map((f, idx) => ({
      ...f,
      category: (f.category || 'About NexGen Council').trim(),
      question: (f.question || '').trim(),
      answer: (f.answer || '').trim(),
      displayOrder: Number.isFinite(Number(f.displayOrder)) ? Number(f.displayOrder) : idx + 1,
      active: f.active !== false
    }));
    const filtered = activeOnly ? mapped.filter(f => f.active) : mapped;
    return filtered.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  createFaq(item: Omit<FaqItem, 'id' | 'createdAt' | 'updatedAt'>): FaqItem {
    if (!Array.isArray(this.data.faqs)) {
      this.data.faqs = getDefaultSeedFaqs();
    }
    const now = new Date().toISOString();
    const maxOrder = this.data.faqs.reduce((m, f) => Math.max(m, Number(f.displayOrder || 0)), 0);
    const newFaq: FaqItem = {
      id: `faq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category: (item.category || 'About NexGen Council').trim(),
      question: (item.question || '').trim(),
      answer: (item.answer || '').trim(),
      displayOrder:
        typeof item.displayOrder === 'number' && Number.isFinite(item.displayOrder) && item.displayOrder > 0
          ? Math.floor(item.displayOrder)
          : maxOrder + 1,
      active: item.active !== false,
      createdAt: now,
      updatedAt: now
    };
    this.data.faqs.push(newFaq);
    this.save();
    mongoUpsert('faqs', newFaq.id, newFaq).catch(() => {});
    return newFaq;
  }

  updateFaq(id: string, updates: Partial<FaqItem>): FaqItem | null {
    if (!Array.isArray(this.data.faqs)) {
      this.data.faqs = getDefaultSeedFaqs();
    }
    const idx = this.data.faqs.findIndex(f => f.id === id);
    if (idx === -1) return null;
    const current = this.data.faqs[idx];
    const updated: FaqItem = {
      ...current,
      ...(typeof updates.category === 'string' && updates.category.trim()
        ? { category: updates.category.trim() }
        : {}),
      ...(typeof updates.question === 'string' && updates.question.trim()
        ? { question: updates.question.trim() }
        : {}),
      ...(typeof updates.answer === 'string' && updates.answer.trim()
        ? { answer: updates.answer.trim() }
        : {}),
      ...(typeof updates.displayOrder === 'number' && Number.isFinite(updates.displayOrder) && updates.displayOrder > 0
        ? { displayOrder: Math.floor(updates.displayOrder) }
        : {}),
      ...(typeof updates.active === 'boolean' ? { active: updates.active } : {}),
      updatedAt: new Date().toISOString()
    };
    this.data.faqs[idx] = updated;
    this.save();
    mongoUpsert('faqs', updated.id, updated).catch(() => {});
    return updated;
  }

  reorderFaqs(orderedIds: string[]): FaqItem[] {
    if (!Array.isArray(this.data.faqs)) {
      this.data.faqs = getDefaultSeedFaqs();
    }
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return this.getFaqs(false);
    }
    const orderMap = new Map<string, number>();
    orderedIds.forEach((id, index) => {
      if (!orderMap.has(id)) {
        orderMap.set(id, index + 1);
      }
    });
    let nextOrder = orderMap.size + 1;
    const sorted = this.getFaqs(false);
    this.data.faqs = sorted.map(f => ({
      ...f,
      displayOrder: orderMap.has(f.id) ? orderMap.get(f.id)! : nextOrder++,
      updatedAt: new Date().toISOString()
    }));
    this.data.faqs.sort((a, b) => a.displayOrder - b.displayOrder);
    this.save();
    for (const faq of this.data.faqs) {
      mongoUpsert('faqs', faq.id, faq).catch(() => {});
    }
    return this.getFaqs(false);
  }

  deleteFaq(id: string): boolean {
    if (!Array.isArray(this.data.faqs)) {
      this.data.faqs = getDefaultSeedFaqs();
    }
    const before = this.data.faqs.length;
    this.data.faqs = this.data.faqs.filter(f => f.id !== id);
    if (this.data.faqs.length === before) return false;
    this.save();
    mongoDelete('faqs', id).catch(() => {});
    return true;
  }

  // --- Contacts ---
  private normalizeContactSource(
    contact: Partial<ContactMessage>
  ): 'Support Widget' | 'Contact Page' {
    const rawSource = typeof contact.source === 'string' ? contact.source.trim().toLowerCase() : '';
    if (rawSource.includes('widget')) return 'Support Widget';
    if (rawSource.includes('contact')) return 'Contact Page';

    const hasWhatsapp = typeof contact.whatsapp === 'string' && contact.whatsapp.trim().length > 0;
    if (hasWhatsapp) return 'Support Widget';

    const widgetOnlySubjects = [
      'Certificate / Cohort Verification',
      'Volunteer / Fellowship Application',
      'Event / Meeting Access Issue',
      'Website / Portal Bug Report'
    ];
    if (contact.subject && widgetOnlySubjects.includes(contact.subject.trim())) {
      return 'Support Widget';
    }

    return 'Contact Page';
  }

  private normalizeTicketStatus(msg: Partial<ContactMessage>): TicketStatus {
    if (msg.ticketStatus === 'Open' || msg.ticketStatus === 'In Review' || msg.ticketStatus === 'Resolved') {
      return msg.ticketStatus;
    }
    if (msg.status === 'Resolved' || msg.status === 'Replied') return 'Resolved';
    if (msg.status === 'In Review' || msg.status === 'Read') return 'In Review';
    return 'Open';
  }

  private generateUniqueTicketNumber(): string {
    const year = new Date().getFullYear();
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let attempt = 0; attempt < 15; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += chars[crypto.randomInt(0, chars.length)];
      }
      const candidate = `NXG-TKT-${year}-${code}`;
      if (!this.data.contacts.some(c => c.ticketNumber?.toUpperCase() === candidate)) {
        return candidate;
      }
    }
    return `NXG-TKT-${year}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  private deriveLegacyTicketNumber(msg: ContactMessage): string {
    if (msg.ticketNumber && msg.ticketNumber.trim()) return msg.ticketNumber.trim().toUpperCase();
    const year = new Date(msg.createdAt || Date.now()).getFullYear() || new Date().getFullYear();
    const suffix = (msg.id || '0000').replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase().padStart(4, '0');
    return `NXG-TKT-${year}-${suffix}`;
  }

  private hydrateContactTicket(c: ContactMessage): ContactMessage {
    return {
      ...c,
      source: this.normalizeContactSource(c),
      ticketNumber: this.deriveLegacyTicketNumber(c),
      ticketStatus: this.normalizeTicketStatus(c),
      priority: c.priority === 'Urgent' ? 'Urgent' : 'Normal',
      replies: Array.isArray(c.replies) ? c.replies : []
    };
  }

  getContacts() {
    return [...this.data.contacts]
      .map(c => this.hydrateContactTicket(c))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getContactByTicketNumber(rawTicketNumber: string): ContactMessage | null {
    const clean = (rawTicketNumber || '').trim().replace(/^#/, '').toUpperCase();
    if (!clean) return null;
    const match = this.data.contacts.find(c => {
      const hydrated = this.hydrateContactTicket(c);
      return (
        hydrated.ticketNumber?.toUpperCase() === clean ||
        c.id.toUpperCase() === clean
      );
    });
    return match ? this.hydrateContactTicket(match) : null;
  }

  createContact(
    contact: Omit<ContactMessage, 'id' | 'status' | 'createdAt' | 'ticketNumber' | 'ticketStatus' | 'replies'> & {
      priority?: 'Normal' | 'Urgent';
    }
  ) {
    const normalizedSource = this.normalizeContactSource(contact);
    const nowIso = new Date().toISOString();
    const ticketNumber = this.generateUniqueTicketNumber();
    const newMsg: ContactMessage = {
      ...contact,
      source: normalizedSource,
      id: `cnt_${Date.now()}`,
      ticketNumber,
      status: 'Unread',
      ticketStatus: 'Open',
      priority: contact.priority === 'Urgent' ? 'Urgent' : 'Normal',
      replies: [],
      createdAt: nowIso,
      updatedAt: nowIso
    };
    this.data.contacts.unshift(newMsg);
    this.save();
    mongoUpsert('contacts', newMsg.id, newMsg).catch(() => {});
    return newMsg;
  }

  updateContactStatus(idOrTicket: string, rawStatus: ContactMessage['status'] | TicketStatus) {
    const clean = (idOrTicket || '').trim();
    const msg = this.data.contacts.find(
      c => c.id === clean || this.deriveLegacyTicketNumber(c) === clean.toUpperCase()
    );
    if (!msg) return null;

    const nowIso = new Date().toISOString();
    let mappedTicketStatus: TicketStatus = 'Open';
    let mappedLegacyStatus: ContactMessage['status'] = 'Unread';

    if (rawStatus === 'Resolved' || rawStatus === 'Replied') {
      mappedTicketStatus = 'Resolved';
      mappedLegacyStatus = 'Replied';
      msg.resolvedAt = nowIso;
    } else if (rawStatus === 'In Review' || rawStatus === 'Read') {
      mappedTicketStatus = 'In Review';
      mappedLegacyStatus = 'Read';
      msg.resolvedAt = undefined;
    } else {
      mappedTicketStatus = 'Open';
      mappedLegacyStatus = 'Unread';
      msg.resolvedAt = undefined;
    }

    if (!msg.ticketNumber) {
      msg.ticketNumber = this.deriveLegacyTicketNumber(msg);
    }
    msg.ticketStatus = mappedTicketStatus;
    msg.status = mappedLegacyStatus;
    msg.updatedAt = nowIso;

    this.save();
    mongoUpsert('contacts', msg.id, msg).catch(() => {});
    return this.hydrateContactTicket(msg);
  }

  addTicketReply(
    idOrTicket: string,
    payload: { senderRole: 'visitor' | 'admin'; senderName: string; message: string },
    nextStatus?: TicketStatus
  ): { ticket: ContactMessage; reply: SupportTicketReply } | null {
    const clean = (idOrTicket || '').trim().replace(/^#/, '');
    const msg = this.data.contacts.find(
      c =>
        c.id === clean ||
        this.deriveLegacyTicketNumber(c).toUpperCase() === clean.toUpperCase()
    );
    if (!msg) return null;

    const nowIso = new Date().toISOString();
    if (!msg.ticketNumber) {
      msg.ticketNumber = this.deriveLegacyTicketNumber(msg);
    }
    if (!Array.isArray(msg.replies)) {
      msg.replies = [];
    }

    const reply: SupportTicketReply = {
      id: `trep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      senderRole: payload.senderRole,
      senderName: payload.senderName.trim() || (payload.senderRole === 'admin' ? 'Council Secretariat' : msg.name),
      message: payload.message.trim(),
      createdAt: nowIso
    };

    msg.replies.push(reply);
    msg.updatedAt = nowIso;

    const currentTicketStatus = this.normalizeTicketStatus(msg);
    if (payload.senderRole === 'admin') {
      msg.assignedTo = reply.senderName;
      const targetStatus: TicketStatus =
        nextStatus || (currentTicketStatus === 'Open' ? 'In Review' : currentTicketStatus);
      msg.ticketStatus = targetStatus;
      msg.status = targetStatus === 'Resolved' ? 'Replied' : 'Read';
      if (targetStatus === 'Resolved') {
        msg.resolvedAt = nowIso;
      } else {
        msg.resolvedAt = undefined;
      }
    } else {
      // Visitor follow-up reopens a Resolved ticket so admins see it cleanly in queue
      if (currentTicketStatus === 'Resolved') {
        msg.ticketStatus = 'Open';
        msg.status = 'Unread';
        msg.resolvedAt = undefined;
      }
    }

    this.save();
    mongoUpsert('contacts', msg.id, msg).catch(() => {});
    return { ticket: this.hydrateContactTicket(msg), reply };
  }

  deleteContact(id: string) {
    this.data.contacts = this.data.contacts.filter(c => c.id !== id);
    this.save();
    mongoDelete('contacts', id).catch(() => {});
  }

  // --- AI Support Widget 7-Day Conversation Memory & Admin Logs ---
  purgeExpiredSupportConversations(): number {
    this.ensureMeetingArrays();
    const retentionMs = 7 * 24 * 60 * 60 * 1000;
    const cutoffMs = Date.now() - retentionMs;
    const prevList = this.data.supportConversations || [];
    if (prevList.length === 0) return 0;

    let changed = false;
    let deletedCount = 0;
    const surviving: SupportConversation[] = [];

    for (const conv of prevList) {
      const recentMsgs = (conv.messages || []).filter(m => {
        const t = new Date(m.timestamp).getTime();
        return !Number.isNaN(t) && t >= cutoffMs;
      });
      const updatedMs = new Date(conv.updatedAt || conv.createdAt).getTime();

      if (recentMsgs.length === 0 || Number.isNaN(updatedMs) || updatedMs < cutoffMs) {
        changed = true;
        deletedCount++;
        mongoDelete('supportConversations', conv.id).catch(() => {});
        continue;
      }

      if (recentMsgs.length !== (conv.messages || []).length) {
        changed = true;
        const latestTs = recentMsgs[recentMsgs.length - 1]?.timestamp || conv.updatedAt;
        const updatedConv: SupportConversation = {
          ...conv,
          messages: recentMsgs,
          updatedAt: latestTs,
          expiresAt: new Date(new Date(latestTs).getTime() + retentionMs).toISOString()
        };
        surviving.push(updatedConv);
        mongoUpsert('supportConversations', updatedConv.id, updatedConv).catch(() => {});
      } else {
        surviving.push(conv);
      }
    }

    if (changed) {
      this.data.supportConversations = surviving;
      this.save();
    }
    return deletedCount;
  }

  getSupportConversations(search?: string): SupportConversation[] {
    this.purgeExpiredSupportConversations();
    let list = [...(this.data.supportConversations || [])];
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        c =>
          (c.visitorName || '').toLowerCase().includes(q) ||
          (c.visitorEmail || '').toLowerCase().includes(q) ||
          (c.visitorWhatsapp || '').toLowerCase().includes(q) ||
          c.sessionId.toLowerCase().includes(q) ||
          (c.messages || []).some(m => m.text.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  getSupportConversationBySession(sessionId: string): SupportConversation | null {
    this.purgeExpiredSupportConversations();
    return (this.data.supportConversations || []).find(c => c.sessionId === sessionId) || null;
  }

  getSupportConversationById(id: string): SupportConversation | null {
    this.purgeExpiredSupportConversations();
    return (this.data.supportConversations || []).find(c => c.id === id) || null;
  }

  appendSupportExchange(params: {
    sessionId: string;
    userText: string;
    assistantText: string;
    visitorName?: string;
    visitorEmail?: string;
    visitorWhatsapp?: string;
    escalatedToHuman?: boolean;
    linkedContactId?: string;
  }): SupportConversation {
    this.purgeExpiredSupportConversations();
    const now = Date.now();
    const retentionMs = 7 * 24 * 60 * 60 * 1000;
    const nowIso = new Date(now).toISOString();
    const expiresAt = new Date(now + retentionMs).toISOString();

    const userMsg: SupportChatMessage = {
      id: `msg_u_${now}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: params.userText,
      timestamp: nowIso
    };

    const assistantMsg: SupportChatMessage = {
      id: `msg_a_${now + 1}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      text: params.assistantText,
      timestamp: new Date(now + 1).toISOString(),
      escalatedTicketId: params.linkedContactId
    };

    const list = this.data.supportConversations!;
    const idx = list.findIndex(c => c.sessionId === params.sessionId);

    if (idx !== -1) {
      const existing = list[idx];
      const updatedMsgs = [...existing.messages, userMsg, assistantMsg].slice(-100);
      const updated: SupportConversation = {
        ...existing,
        visitorName: params.visitorName || existing.visitorName,
        visitorEmail: params.visitorEmail || existing.visitorEmail,
        visitorWhatsapp: params.visitorWhatsapp || existing.visitorWhatsapp,
        escalatedToHuman: Boolean(params.escalatedToHuman || existing.escalatedToHuman),
        linkedContactId: params.linkedContactId || existing.linkedContactId,
        messages: updatedMsgs,
        updatedAt: nowIso,
        expiresAt
      };
      list[idx] = updated;
      this.save();
      mongoUpsert('supportConversations', updated.id, updated).catch(() => {});
      return updated;
    }

    const created: SupportConversation = {
      id: `conv_${now}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId: params.sessionId,
      visitorName: params.visitorName,
      visitorEmail: params.visitorEmail,
      visitorWhatsapp: params.visitorWhatsapp,
      escalatedToHuman: Boolean(params.escalatedToHuman),
      linkedContactId: params.linkedContactId,
      messages: [userMsg, assistantMsg],
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt
    };

    list.unshift(created);
    if (list.length > 500) {
      const dropped = list.pop();
      if (dropped) mongoDelete('supportConversations', dropped.id).catch(() => {});
    }
    this.save();
    mongoUpsert('supportConversations', created.id, created).catch(() => {});
    return created;
  }

  // --- Live Human Support Chat Methods ---
  requestHumanSupportHandoff(params: {
    sessionId: string;
    visitorName?: string;
    visitorEmail?: string;
    visitorWhatsapp?: string;
    initialMessage?: string;
  }): { conversation: SupportConversation; message: SupportChatMessage | null } {
    this.purgeExpiredSupportConversations();
    this.ensureMeetingArrays();
    const now = Date.now();
    const retentionMs = 7 * 24 * 60 * 60 * 1000;
    const nowIso = new Date(now).toISOString();
    const expiresAt = new Date(now + retentionMs).toISOString();

    const list = this.data.supportConversations!;
    const idx = list.findIndex(c => c.sessionId === params.sessionId);

    const newMessages: SupportChatMessage[] = [];
    let visitorMsg: SupportChatMessage | null = null;
    if (params.initialMessage && params.initialMessage.trim()) {
      visitorMsg = {
        id: `msg_u_${now}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        text: params.initialMessage.trim(),
        senderName: params.visitorName?.trim() || 'Website Visitor',
        timestamp: nowIso
      };
      newMessages.push(visitorMsg);
    }

    const systemNotice: SupportChatMessage = {
      id: `msg_sys_${now + 1}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'agent',
      senderName: 'NexGen Support Desk',
      text: 'You are now connected to Live Human Support. A Secretariat coordinator has been notified and will reply here in real time.',
      timestamp: new Date(now + 1).toISOString()
    };
    newMessages.push(systemNotice);

    if (idx !== -1) {
      const existing = list[idx];
      const updated: SupportConversation = {
        ...existing,
        visitorName: params.visitorName?.trim() || existing.visitorName,
        visitorEmail: params.visitorEmail?.trim() || existing.visitorEmail,
        visitorWhatsapp: params.visitorWhatsapp?.trim() || existing.visitorWhatsapp,
        mode: 'human',
        status: 'open',
        humanRequestedAt: nowIso,
        escalatedToHuman: true,
        assignedAgentName: undefined,
        unreadByAgent: (existing.unreadByAgent || 0) + 1,
        messages: [...(existing.messages || []), ...newMessages].slice(-150),
        updatedAt: nowIso,
        expiresAt
      };
      list[idx] = updated;
      this.save();
      mongoUpsert('supportConversations', updated.id, updated).catch(() => {});
      return { conversation: updated, message: visitorMsg || systemNotice };
    }

    const created: SupportConversation = {
      id: `conv_${now}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId: params.sessionId,
      visitorName: params.visitorName?.trim() || 'Website Visitor',
      visitorEmail: params.visitorEmail?.trim(),
      visitorWhatsapp: params.visitorWhatsapp?.trim(),
      mode: 'human',
      status: 'open',
      humanRequestedAt: nowIso,
      assignedAgentName: undefined,
      unreadByAgent: 1,
      escalatedToHuman: true,
      messages: newMessages,
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt
    };

    list.unshift(created);
    if (list.length > 500) {
      const dropped = list.pop();
      if (dropped) mongoDelete('supportConversations', dropped.id).catch(() => {});
    }
    this.save();
    mongoUpsert('supportConversations', created.id, created).catch(() => {});
    return { conversation: created, message: visitorMsg || systemNotice };
  }

  addVisitorLiveMessage(params: {
    sessionId: string;
    text: string;
    visitorName?: string;
    visitorEmail?: string;
    visitorWhatsapp?: string;
  }): { conversation: SupportConversation; message: SupportChatMessage } {
    this.purgeExpiredSupportConversations();
    this.ensureMeetingArrays();
    const now = Date.now();
    const retentionMs = 7 * 24 * 60 * 60 * 1000;
    const nowIso = new Date(now).toISOString();
    const expiresAt = new Date(now + retentionMs).toISOString();

    const list = this.data.supportConversations!;
    const idx = list.findIndex(c => c.sessionId === params.sessionId);

    const visitorMsg: SupportChatMessage = {
      id: `msg_u_${now}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: params.text.trim(),
      senderName: params.visitorName?.trim() || (idx !== -1 ? list[idx].visitorName : undefined) || 'Website Visitor',
      timestamp: nowIso
    };

    if (idx !== -1) {
      const existing = list[idx];
      const updated: SupportConversation = {
        ...existing,
        visitorName: params.visitorName?.trim() || existing.visitorName,
        visitorEmail: params.visitorEmail?.trim() || existing.visitorEmail,
        visitorWhatsapp: params.visitorWhatsapp?.trim() || existing.visitorWhatsapp,
        mode: 'human',
        status: 'open',
        humanRequestedAt: existing.humanRequestedAt || nowIso,
        escalatedToHuman: true,
        unreadByAgent: (existing.unreadByAgent || 0) + 1,
        messages: [...(existing.messages || []), visitorMsg].slice(-150),
        updatedAt: nowIso,
        expiresAt
      };
      list[idx] = updated;
      this.save();
      mongoUpsert('supportConversations', updated.id, updated).catch(() => {});
      return { conversation: updated, message: visitorMsg };
    }

    const created: SupportConversation = {
      id: `conv_${now}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId: params.sessionId,
      visitorName: params.visitorName?.trim() || 'Website Visitor',
      visitorEmail: params.visitorEmail?.trim(),
      visitorWhatsapp: params.visitorWhatsapp?.trim(),
      mode: 'human',
      status: 'open',
      humanRequestedAt: nowIso,
      unreadByAgent: 1,
      escalatedToHuman: true,
      messages: [visitorMsg],
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt
    };

    list.unshift(created);
    if (list.length > 500) {
      const dropped = list.pop();
      if (dropped) mongoDelete('supportConversations', dropped.id).catch(() => {});
    }
    this.save();
    mongoUpsert('supportConversations', created.id, created).catch(() => {});
    return { conversation: created, message: visitorMsg };
  }

  addAgentLiveReply(params: {
    conversationId: string;
    text: string;
    agentName: string;
  }): { conversation: SupportConversation; message: SupportChatMessage } | null {
    this.purgeExpiredSupportConversations();
    this.ensureMeetingArrays();
    const list = this.data.supportConversations!;
    const idx = list.findIndex(c => c.id === params.conversationId || c.sessionId === params.conversationId);
    if (idx === -1) return null;

    const existing = list[idx];
    const now = Date.now();
    const retentionMs = 7 * 24 * 60 * 60 * 1000;
    const nowIso = new Date(now).toISOString();
    const expiresAt = new Date(now + retentionMs).toISOString();

    const agentMsg: SupportChatMessage = {
      id: `msg_agent_${now}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'agent',
      text: params.text.trim(),
      senderName: params.agentName || 'Council Coordinator',
      timestamp: nowIso
    };

    const updated: SupportConversation = {
      ...existing,
      mode: 'human',
      status: 'open',
      escalatedToHuman: true,
      assignedAgentName: existing.assignedAgentName || params.agentName || 'Council Coordinator',
      unreadByAgent: 0,
      messages: [...(existing.messages || []), agentMsg].slice(-150),
      updatedAt: nowIso,
      expiresAt
    };

    list[idx] = updated;
    this.save();
    mongoUpsert('supportConversations', updated.id, updated).catch(() => {});
    return { conversation: updated, message: agentMsg };
  }

  markSupportConversationRead(conversationId: string): SupportConversation | null {
    this.ensureMeetingArrays();
    const list = this.data.supportConversations!;
    const idx = list.findIndex(c => c.id === conversationId || c.sessionId === conversationId);
    if (idx === -1) return null;
    const existing = list[idx];
    const nowIso = new Date().toISOString();
    let changed = false;
    const updatedMessages = (existing.messages || []).map(m => {
      if (m.role === 'agent' && !m.isRead) {
        changed = true;
        return { ...m, isRead: true, readAt: nowIso };
      }
      return m;
    });

    if ((existing.unreadByAgent || 0) === 0 && !changed) return existing;

    const updated: SupportConversation = {
      ...existing,
      unreadByAgent: 0,
      messages: updatedMessages
    };
    list[idx] = updated;
    this.save();
    mongoUpsert('supportConversations', updated.id, updated).catch(() => {});
    return updated;
  }

  assignSupportConversation(conversationId: string, agentName: string): SupportConversation | null {
    this.ensureMeetingArrays();
    const list = this.data.supportConversations!;
    const idx = list.findIndex(c => c.id === conversationId || c.sessionId === conversationId);
    if (idx === -1) return null;
    const existing = list[idx];
    const updated: SupportConversation = {
      ...existing,
      assignedAgentName: agentName.trim() || undefined,
      updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    this.save();
    mongoUpsert('supportConversations', updated.id, updated).catch(() => {});
    return updated;
  }

  updateSupportConversationStatus(
    conversationId: string,
    status: 'open' | 'resolved',
    mode?: 'ai' | 'human'
  ): SupportConversation | null {
    this.ensureMeetingArrays();
    const list = this.data.supportConversations!;
    const idx = list.findIndex(c => c.id === conversationId || c.sessionId === conversationId);
    if (idx === -1) return null;
    const updated: SupportConversation = {
      ...list[idx],
      status,
      ...(mode ? { mode } : {}),
      unreadByAgent: status === 'resolved' ? 0 : list[idx].unreadByAgent,
      updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    this.save();
    mongoUpsert('supportConversations', updated.id, updated).catch(() => {});
    return updated;
  }

  rateSupportConversation(sessionId: string, rating: number, feedback?: string): SupportConversation | null {
    this.ensureMeetingArrays();
    const list = this.data.supportConversations!;
    const idx = list.findIndex(c => c.sessionId === sessionId || c.id === sessionId);
    if (idx === -1) return null;
    const existing = list[idx];
    const updated: SupportConversation = {
      ...existing,
      satisfactionRating: Math.max(1, Math.min(5, rating)),
      satisfactionFeedback: feedback?.trim() || undefined,
      updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    this.save();
    mongoUpsert('supportConversations', updated.id, updated).catch(() => {});
    return updated;
  }

  switchSupportConversationMode(sessionId: string, mode: 'ai' | 'human'): SupportConversation | null {
    this.ensureMeetingArrays();
    const list = this.data.supportConversations!;
    const idx = list.findIndex(c => c.sessionId === sessionId);
    if (idx === -1) return null;
    const updated: SupportConversation = {
      ...list[idx],
      mode,
      status: 'open',
      updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    this.save();
    mongoUpsert('supportConversations', updated.id, updated).catch(() => {});
    return updated;
  }

  deleteSupportConversation(id: string): boolean {
    this.ensureMeetingArrays();
    const prevLen = this.data.supportConversations!.length;
    this.data.supportConversations = this.data.supportConversations!.filter(c => c.id !== id);
    if (this.data.supportConversations!.length < prevLen) {
      this.save();
      mongoDelete('supportConversations', id).catch(() => {});
      return true;
    }
    return false;
  }

  // --- Settings ---
  getSettings() {
    const siteUrl = this.data.settings?.siteUrl || process.env.SITE_URL || 'https://nexgencouncil.bond';
    return { ...defaultSettings, siteUrl, ...this.data.settings };
  }

  updateSettings(updates: Partial<WebsiteSettings>) {
    const cleanUpdates: Record<string, any> = {};
    const raw = (updates && typeof updates === 'object') ? updates as Record<string, any> : {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      cleanUpdates[k] = v;
    }

    if (cleanUpdates.socialLinks && typeof cleanUpdates.socialLinks === 'object') {
      const sanitizedLinks: Record<string, string> = { ...(this.data.settings?.socialLinks || {}) };
      for (const platform of ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube']) {
        if (typeof cleanUpdates.socialLinks[platform] === 'string') {
          const val = cleanUpdates.socialLinks[platform].trim();
          if (!val) {
            sanitizedLinks[platform] = '';
          } else if (/^https?:\/\//i.test(val)) {
            sanitizedLinks[platform] = val;
          }
        }
      }
      cleanUpdates.socialLinks = sanitizedLinks;
    }

    if (cleanUpdates.socialLinksVisibility && typeof cleanUpdates.socialLinksVisibility === 'object') {
      const vis: Record<string, boolean> = { ...(this.data.settings?.socialLinksVisibility || {}) };
      for (const platform of ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube']) {
        if (typeof cleanUpdates.socialLinksVisibility[platform] === 'boolean') {
          vis[platform] = cleanUpdates.socialLinksVisibility[platform];
        }
      }
      cleanUpdates.socialLinksVisibility = vis;
    }
    if (typeof cleanUpdates.siteUrl === 'string') {
      const s = cleanUpdates.siteUrl.trim();
      if (!s || /^https?:\/\//i.test(s)) {
        cleanUpdates.siteUrl = s;
      } else {
        delete cleanUpdates.siteUrl;
      }
    }
    if (typeof cleanUpdates.emailLogoUrl === 'string') {
      const l = cleanUpdates.emailLogoUrl.trim();
      if (!l || /^(\/|https?:\/\/)/i.test(l)) {
        cleanUpdates.emailLogoUrl = l;
      } else {
        delete cleanUpdates.emailLogoUrl;
      }
    }
    if (cleanUpdates.showSocialLinks !== undefined) {
      cleanUpdates.showSocialLinks = Boolean(cleanUpdates.showSocialLinks);
    }
    if (typeof cleanUpdates.newsSeoTitle === 'string') {
      cleanUpdates.newsSeoTitle = cleanUpdates.newsSeoTitle.trim().slice(0, 120);
    }
    if (typeof cleanUpdates.newsSeoDescription === 'string') {
      cleanUpdates.newsSeoDescription = cleanUpdates.newsSeoDescription.trim().slice(0, 320);
    }
    if (cleanUpdates.newsSeoKeywords !== undefined) {
      cleanUpdates.newsSeoKeywords = this.sanitizeKeywordList(cleanUpdates.newsSeoKeywords, 35);
    }

    this.data.settings = { ...defaultSettings, ...this.data.settings, ...cleanUpdates };
    this.save();
    mongoUpsert('settings', 'global_settings', this.data.settings).catch(() => {});
    return this.getSettings();
  }

  // --- Activity Logs ---
  logActivity(log: Omit<ActivityLog, 'id' | 'timestamp'>) {
    const item: ActivityLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      timestamp: new Date().toISOString()
    };
    this.data.activityLogs.unshift(item);
    if (this.data.activityLogs.length > 200) {
      this.data.activityLogs.pop();
    }
    this.save();
    mongoUpsert('activityLogs', item.id, item).catch(() => {});
    return item;
  }

  getActivityLogs(limit = 50) {
    return this.data.activityLogs.slice(0, limit);
  }

  // --- Email Sender Config & Sent History ---
  getEmailSenderConfig() {
    const s = this.getSettings();
    return {
      senderName: (s.emailSenderName || 'NexGen Council').trim(),
      senderEmail: (s.emailSenderEmail || 'admin@nexgencouncil.bond').trim().toLowerCase(),
      replyTo: (s.emailReplyTo || '').trim(),
      logoUrl: (s.emailLogoUrl ?? 'https://i.postimg.cc/5yM8rqz0/logo-(1).png').trim()
    };
  }

  updateEmailSenderConfig(updates: {
    senderName?: string;
    senderEmail?: string;
    replyTo?: string;
    logoUrl?: string;
  }) {
    const current = this.getEmailSenderConfig();
    const senderName = updates.senderName !== undefined ? updates.senderName.trim() : current.senderName;
    const senderEmail = updates.senderEmail !== undefined ? updates.senderEmail.trim().toLowerCase() : current.senderEmail;
    const replyTo = updates.replyTo !== undefined ? updates.replyTo.trim() : current.replyTo;
    const logoUrl = updates.logoUrl !== undefined ? updates.logoUrl.trim() : current.logoUrl;

    this.updateSettings({
      emailSenderName: senderName || 'NexGen Council',
      emailSenderEmail: senderEmail || 'admin@nexgencouncil.bond',
      emailReplyTo: replyTo,
      emailLogoUrl: logoUrl
    });

    return this.getEmailSenderConfig();
  }

  getEmailLogs(limit = 200): EmailLog[] {
    this.ensureMeetingArrays();
    return [...(this.data.emailLogs || [])]
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .slice(0, limit);
  }

  addEmailLog(entry: Omit<EmailLog, 'id' | 'sentAt'> & { sentAt?: string }): EmailLog {
    this.ensureMeetingArrays();
    const logItem: EmailLog = {
      ...entry,
      id: `eml_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sentAt: entry.sentAt || new Date().toISOString()
    };
    this.data.emailLogs!.unshift(logItem);
    if (this.data.emailLogs!.length > 500) {
      this.data.emailLogs!.pop();
    }
    this.save();
    mongoUpsert('emailLogs', logItem.id, logItem).catch(() => {});
    return logItem;
  }

  deleteEmailLog(id: string): boolean {
    this.ensureMeetingArrays();
    const prevLen = this.data.emailLogs!.length;
    this.data.emailLogs = this.data.emailLogs!.filter(e => e.id !== id);
    this.save();
    mongoDelete('emailLogs', id).catch(() => {});
    return this.data.emailLogs!.length < prevLen;
  }

  // --- Analytics & Stats ---
  getDashboardStats(): DashboardStats {
    const apps = this.data.applications;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const pending = apps.filter(a => a.status === 'Pending').length;
    const approved = apps.filter(a => a.status === 'Approved').length;
    const rejected = apps.filter(a => a.status === 'Rejected').length;
    const today = apps.filter(a => a.createdAt.startsWith(todayStr)).length;

    // Monthly breakdown for the last 6 months
    const monthsMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      monthsMap.set(key, 0);
    }
    apps.forEach(a => {
      const d = new Date(a.createdAt);
      const key = d.toLocaleString('default', { month: 'short' });
      if (monthsMap.has(key)) {
        monthsMap.set(key, (monthsMap.get(key) || 0) + 1);
      }
    });

    const monthlyApplications = Array.from(monthsMap.entries()).map(([month, count]) => ({
      month,
      count
    }));

    // Interest distribution
    const interestCounts: Record<string, number> = {};
    apps.forEach(a => {
      (a.interestAreas || []).forEach(ia => {
        interestCounts[ia] = (interestCounts[ia] || 0) + 1;
      });
    });

    const interestDistribution = Object.entries(interestCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      totalVolunteers: this.data.volunteers.length,
      totalApplications: apps.length,
      pendingApplications: pending,
      approvedApplications: approved,
      rejectedApplications: rejected,
      newApplicationsToday: today,
      totalPrograms: this.data.programs.length,
      totalEvents: this.data.events.length,
      totalNewsPosts: this.data.news.length,
      totalInquiries: this.data.contacts.length,
      unreadInquiries: this.data.contacts.filter(
        c => this.normalizeTicketStatus(c) === 'Open' || c.status === 'Unread'
      ).length,
      recentActivity: this.data.activityLogs.slice(0, 8),
      monthlyApplications,
      interestDistribution
    };
  }

  getAnalyticsOrgContext() {
    this.ensureMeetingArrays();
    const apps = this.data.applications || [];
    const vols = this.data.volunteers || [];
    const contacts = this.data.contacts || [];
    const meetings = this.data.meetings || [];
    const emailLogs = this.data.emailLogs || [];
    const nowMs = Date.now();
    const oneDayAgoMs = nowMs - 24 * 60 * 60 * 1000;

    const pendingApplications = apps.filter(a => a.status === 'Pending').length;
    const underReviewApplications = apps.filter(a => a.status === 'Under Review').length;
    const approvedApplications = apps.filter(a => a.status === 'Approved').length;
    const rejectedApplications = apps.filter(a => a.status === 'Rejected').length;

    const activeVolunteers = vols.filter(v => v.status === 'Active').length;
    const unreadInquiries = contacts.filter(
      c => this.normalizeTicketStatus(c) === 'Open' || c.status === 'Unread'
    ).length;
    const widgetInquiries = contacts.filter(c => c.source === 'Support Widget').length;
    const contactPageInquiries = contacts.filter(c => c.source !== 'Support Widget').length;

    const liveMeetings = meetings.filter(m => m.status === 'Active').length;
    const recentEmailLogs24h = emailLogs.filter(e => {
      const t = new Date(e.sentAt).getTime();
      return !Number.isNaN(t) && t >= oneDayAgoMs;
    }).length;

    const interestCounts: Record<string, number> = {};
    const cityCounts: Record<string, number> = {};
    apps.forEach(a => {
      (a.interestAreas || []).forEach(ia => {
        if (ia) interestCounts[ia] = (interestCounts[ia] || 0) + 1;
      });
      const rawCity = (a.city || '').trim();
      if (rawCity) {
        const normalizedCity = rawCity.charAt(0).toUpperCase() + rawCity.slice(1);
        cityCounts[normalizedCity] = (cityCounts[normalizedCity] || 0) + 1;
      }
    });

    vols.forEach(v => {
      const rawCity = (v.city || '').trim();
      if (rawCity && apps.length === 0) {
        const normalizedCity = rawCity.charAt(0).toUpperCase() + rawCity.slice(1);
        cityCounts[normalizedCity] = (cityCounts[normalizedCity] || 0) + 1;
      }
    });

    return {
      totalApplications: apps.length,
      pendingApplications,
      underReviewApplications,
      approvedApplications,
      rejectedApplications,
      totalVolunteers: vols.length,
      activeVolunteers,
      totalInquiries: contacts.length,
      unreadInquiries,
      widgetInquiries,
      contactPageInquiries,
      totalPrograms: (this.data.programs || []).length,
      totalEvents: (this.data.events || []).length,
      totalNews: (this.data.news || []).length,
      totalMeetings: meetings.length,
      liveMeetings,
      totalEmailsSent: emailLogs.length,
      recentEmailLogs24h,
      interestDistribution: Object.entries(interestCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      cityDistribution: Object.entries(cityCounts)
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
    };
  }

  // ----------------------------------------------------
  // SELF-HOSTED JITSI MEETINGS ENGINE
  // ----------------------------------------------------

  getMeetings(statusFilter?: string, search?: string): Meeting[] {
    this.ensureMeetingArrays();
    let list = [...(this.data.meetings || [])];

    if (statusFilter && statusFilter !== 'All') {
      list = list.filter(m => m.status === statusFilter);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.meetingCode.toLowerCase().includes(q) ||
        m.hostName.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getMeetingById(id: string): Meeting | null {
    this.ensureMeetingArrays();
    return this.data.meetings?.find(m => m.id === id || m.meetingCode === id || m.roomName === id) || null;
  }

  getMeetingByCode(code: string): Meeting | null {
    this.ensureMeetingArrays();
    const clean = code.trim().toLowerCase();
    return this.data.meetings?.find(m => m.meetingCode.toLowerCase() === clean || m.roomName.toLowerCase() === clean || m.id === clean) || null;
  }

  createMeeting(meetingData: {
    title: string;
    roomSlug?: string;
    description?: string;
    hostId: string;
    hostName: string;
    scheduledStart?: string;
    scheduledEnd?: string;
    password?: string;
    waitingRoomEnabled?: boolean;
    screenShareEnabled?: boolean;
    startWithAudioMuted?: boolean;
    startWithVideoMuted?: boolean;
    maxParticipants?: number;
    status?: Meeting['status'];
  }): Meeting {
    this.ensureMeetingArrays();
    const now = new Date().toISOString();

    const sanitizeSlug = (val: string) =>
      val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/(^-|-$)/g, '');

    let baseSlug = meetingData.roomSlug ? sanitizeSlug(meetingData.roomSlug) : '';
    if (!baseSlug) {
      const titlePart = sanitizeSlug(meetingData.title).slice(0, 28);
      const randSuffix = Math.random().toString(36).substring(2, 6);
      baseSlug = titlePart ? `${titlePart}-${randSuffix}` : `nex-${Math.random().toString(36).substring(2, 6)}-${randSuffix}`;
    }

    let meetingCode = baseSlug;
    let counter = 2;
    while (this.data.meetings?.some(m => m.meetingCode.toLowerCase() === meetingCode.toLowerCase())) {
      meetingCode = `${baseSlug}-${counter}`;
      counter++;
    }

    const roomName = `nexgencouncil-${meetingCode}`;

    let passwordHash: string | undefined = undefined;
    let hasPassword = false;
    if (meetingData.password && meetingData.password.trim()) {
      const hp = hashPassword(meetingData.password.trim());
      passwordHash = hp.hash + ':' + hp.salt;
      hasPassword = true;
    }

    const rawMax = Number(meetingData.maxParticipants);
    const maxParticipants = Number.isFinite(rawMax) && rawMax >= 2 ? Math.min(1000, Math.round(rawMax)) : 50;

    const newMeeting: Meeting = {
      id: `mtg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      meetingCode,
      roomName,
      title: meetingData.title.trim(),
      description: meetingData.description?.trim() || '',
      hostId: meetingData.hostId,
      hostName: meetingData.hostName,
      scheduledStart: meetingData.scheduledStart || now,
      scheduledEnd: meetingData.scheduledEnd,
      status: meetingData.status || 'Scheduled',
      passwordHash,
      hasPassword,
      waitingRoomEnabled: meetingData.waitingRoomEnabled !== undefined ? meetingData.waitingRoomEnabled : false,
      screenShareEnabled: meetingData.screenShareEnabled !== undefined ? meetingData.screenShareEnabled : true,
      startWithAudioMuted: meetingData.startWithAudioMuted !== undefined ? meetingData.startWithAudioMuted : false,
      startWithVideoMuted: meetingData.startWithVideoMuted !== undefined ? meetingData.startWithVideoMuted : false,
      maxParticipants,
      isLocked: false,
      createdAt: now,
      updatedAt: now
    };

    this.data.meetings!.unshift(newMeeting);
    this.save();
    mongoUpsert('meetings', newMeeting.id, newMeeting).catch(() => {});
    return newMeeting;
  }

  updateMeeting(id: string, updates: Partial<Meeting> & { password?: string }): Meeting | null {
    this.ensureMeetingArrays();
    const index = this.data.meetings!.findIndex(m => m.id === id || m.meetingCode === id);
    if (index === -1) return null;

    const current = this.data.meetings![index];
    let passwordHash = current.passwordHash;
    let hasPassword = current.hasPassword;

    if (updates.password !== undefined) {
      if (updates.password && updates.password.trim()) {
        const hp = hashPassword(updates.password.trim());
        passwordHash = hp.hash + ':' + hp.salt;
        hasPassword = true;
      } else {
        passwordHash = undefined;
        hasPassword = false;
      }
    }

    const { password, maxParticipants: rawUpdateMax, ...restUpdates } = updates;
    let nextMaxParticipants = current.maxParticipants || 50;
    if (rawUpdateMax !== undefined) {
      const parsedMax = Number(rawUpdateMax);
      if (Number.isFinite(parsedMax)) {
        nextMaxParticipants = Math.max(2, Math.min(1000, Math.round(parsedMax)));
      }
    }

    const updated: Meeting = {
      ...current,
      ...restUpdates,
      maxParticipants: nextMaxParticipants,
      passwordHash,
      hasPassword,
      updatedAt: new Date().toISOString()
    };

    this.data.meetings![index] = updated;
    this.save();
    mongoUpsert('meetings', updated.id, updated).catch(() => {});
    return updated;
  }

  verifyMeetingPassword(meeting: Meeting, passwordAttempt: string): boolean {
    if (!meeting.hasPassword || !meeting.passwordHash) return true;
    const parts = meeting.passwordHash.split(':');
    if (parts.length !== 2) return false;
    return verifyPassword(passwordAttempt, parts[0], parts[1]);
  }

  deleteMeeting(id: string): boolean {
    this.ensureMeetingArrays();
    const initLen = this.data.meetings!.length;
    this.data.meetings = this.data.meetings!.filter(m => m.id !== id && m.meetingCode !== id);
    this.save();
    mongoDelete('meetings', id).catch(() => {});
    return this.data.meetings!.length < initLen;
  }

  // --- Meeting Participants ---
  getMeetingParticipants(meetingId: string): MeetingParticipant[] {
    this.ensureMeetingArrays();
    return (this.data.meetingParticipants || []).filter(p => p.meetingId === meetingId);
  }

  upsertMeetingParticipant(meetingId: string, participantData: {
    userId?: string;
    displayName: string;
    role?: MeetingParticipant['role'];
    admissionStatus?: AdmissionStatus;
    connectionStatus?: MeetingParticipant['connectionStatus'];
    identity?: string;
  }): MeetingParticipant {
    this.ensureMeetingArrays();
    const now = new Date().toISOString();
    let participant = this.data.meetingParticipants!.find(
      p => p.meetingId === meetingId && ((p.userId && p.userId === participantData.userId) || p.identity === participantData.identity)
    );

    if (participant) {
      const wasDisconnected = participant.connectionStatus === 'disconnected';
      if (participantData.displayName) participant.displayName = participantData.displayName;
      if (participantData.admissionStatus) participant.admissionStatus = participantData.admissionStatus;
      if (participantData.connectionStatus) participant.connectionStatus = participantData.connectionStatus;
      if (participantData.role) participant.role = participantData.role;
      if (participantData.identity) participant.identity = participantData.identity;
      if (wasDisconnected && participantData.connectionStatus === 'connected') {
        participant.joinedAt = now;
        participant.leftAt = undefined;
      } else {
        participant.joinedAt = participant.joinedAt || now;
      }
    } else {
      participant = {
        id: `mpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        meetingId,
        userId: participantData.userId,
        displayName: participantData.displayName,
        role: participantData.role || 'participant',
        joinedAt: now,
        admissionStatus: participantData.admissionStatus || 'waiting',
        connectionStatus: participantData.connectionStatus || 'waiting',
        identity: participantData.identity || `user_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
      };
      this.data.meetingParticipants!.push(participant);
    }

    this.save();
    mongoUpsert('meeting_participants', participant.id, participant).catch(() => {});
    return participant;
  }

  updateParticipantAdmission(meetingId: string, participantId: string, status: AdmissionStatus): MeetingParticipant | null {
    this.ensureMeetingArrays();
    const matches = this.data.meetingParticipants!.filter(
      item =>
        item.meetingId === meetingId &&
        (item.id === participantId ||
          (item.userId && item.userId === participantId) ||
          item.identity === participantId)
    );
    if (matches.length === 0) return null;

    const now = new Date().toISOString();
    for (const p of matches) {
      p.admissionStatus = status;
      p.connectionStatus =
        status === 'admitted' ? 'connected' : status === 'waiting' ? 'waiting' : 'disconnected';
      if (status === 'rejected') {
        p.leftAt = now;
      } else if (status === 'admitted') {
        p.leftAt = undefined;
      }
      mongoUpsert('meeting_participants', p.id, p).catch(() => {});
    }
    this.save();
    return matches[matches.length - 1];
  }

  updateParticipantRole(
    meetingId: string,
    participantIdOrIdentity: string,
    role: MeetingParticipant['role']
  ): MeetingParticipant | null {
    this.ensureMeetingArrays();
    const p = this.data.meetingParticipants!.find(
      item =>
        item.meetingId === meetingId &&
        (item.id === participantIdOrIdentity ||
          item.userId === participantIdOrIdentity ||
          item.identity === participantIdOrIdentity)
    );
    if (!p) return null;

    p.role = role;
    this.save();
    mongoUpsert('meeting_participants', p.id, p).catch(() => {});
    return p;
  }

  markParticipantLeft(meetingId: string, participantIdOrIdentity: string): MeetingParticipant | null {
    this.ensureMeetingArrays();
    if (!participantIdOrIdentity) return null;
    const now = new Date().toISOString();
    const matches = this.data.meetingParticipants!.filter(
      item =>
        item.meetingId === meetingId &&
        item.connectionStatus !== 'disconnected' &&
        (item.id === participantIdOrIdentity ||
          (item.userId && item.userId === participantIdOrIdentity) ||
          item.identity === participantIdOrIdentity)
    );
    if (matches.length === 0) return null;

    for (const p of matches) {
      p.connectionStatus = 'disconnected';
      p.leftAt = now;
      mongoUpsert('meeting_participants', p.id, p).catch(() => {});
    }
    this.save();
    return matches[matches.length - 1];
  }

  markAllMeetingParticipantsDisconnected(meetingId: string): void {
    this.ensureMeetingArrays();
    const now = new Date().toISOString();
    let changed = false;
    for (const p of this.data.meetingParticipants || []) {
      if (p.meetingId === meetingId && p.connectionStatus !== 'disconnected') {
        p.connectionStatus = 'disconnected';
        p.leftAt = now;
        changed = true;
        mongoUpsert('meeting_participants', p.id, p).catch(() => {});
      }
    }
    if (changed) {
      this.save();
    }
  }

  // --- Meeting Messages ---
  getMeetingMessages(meetingId: string): MeetingMessage[] {
    this.ensureMeetingArrays();
    return (this.data.meetingMessages || [])
      .filter(m => m.meetingId === meetingId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  addMeetingMessage(meetingId: string, senderId: string, senderName: string, message: string): MeetingMessage {
    this.ensureMeetingArrays();
    const newMsg: MeetingMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      meetingId,
      senderId,
      senderName,
      message: message.trim(),
      createdAt: new Date().toISOString()
    };

    this.data.meetingMessages!.push(newMsg);
    this.save();
    mongoUpsert('meeting_messages', newMsg.id, newMsg).catch(() => {});
    return newMsg;
  }

  // --- Meeting Captures (Recordings & Screenshots with 3-Day TTL Auto-Delete) ---
  purgeExpiredMeetingCaptures(): number {
    this.ensureMeetingArrays();
    const retentionMs = 3 * 24 * 60 * 60 * 1000;
    const cutoffMs = Date.now() - retentionMs;
    const list = this.data.meetingCaptures || [];
    if (list.length === 0) return 0;

    const surviving: MeetingCapture[] = [];
    let deletedCount = 0;

    for (const cap of list) {
      const t = new Date(cap.createdAt).getTime();
      if (Number.isNaN(t) || t < cutoffMs) {
        deletedCount++;
        mongoDelete('meetingCaptures', cap.id).catch(() => {});
        const relPath = cap.filename.startsWith('/') ? cap.filename.slice(1) : cap.filename;
        for (const baseDir of ['public', 'data']) {
          try {
            const filePath = path.join(process.cwd(), baseDir, relPath);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch {}
        }
      } else {
        surviving.push(cap);
      }
    }

    if (deletedCount > 0) {
      this.data.meetingCaptures = surviving;
      this.save();
    }
    return deletedCount;
  }

  getMeetingCaptures(meetingId?: string): MeetingCapture[] {
    this.purgeExpiredMeetingCaptures();
    this.ensureMeetingArrays();
    let list = [...(this.data.meetingCaptures || [])];
    if (meetingId) {
      list = list.filter(c => c.meetingId === meetingId);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  addMeetingCapture(data: {
    meetingId: string;
    meetingCode: string;
    meetingTitle: string;
    kind: 'recording' | 'screenshot';
    filename: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    durationSeconds?: number;
    capturedBy: string;
    hasAudio?: boolean;
    hasVideo?: boolean;
  }): MeetingCapture {
    this.purgeExpiredMeetingCaptures();
    this.ensureMeetingArrays();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const retentionMs = 3 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now + retentionMs).toISOString();

    const capture: MeetingCapture = {
      id: `cap_${now}_${Math.random().toString(36).slice(2, 6)}`,
      ...data,
      createdAt: nowIso,
      expiresAt
    };

    this.data.meetingCaptures!.unshift(capture);
    this.save();
    mongoUpsert('meetingCaptures', capture.id, capture).catch(() => {});
    return capture;
  }

  deleteMeetingCapture(id: string): boolean {
    this.ensureMeetingArrays();
    const list = this.data.meetingCaptures || [];
    const target = list.find(c => c.id === id);
    if (!target) return false;

    this.data.meetingCaptures = list.filter(c => c.id !== id);
    this.save();
    mongoDelete('meetingCaptures', id).catch(() => {});
    const relPath = target.filename.startsWith('/') ? target.filename.slice(1) : target.filename;
    for (const baseDir of ['public', 'data']) {
      try {
        const filePath = path.join(process.cwd(), baseDir, relPath);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }
    return true;
  }
}

export const db = new Database();
