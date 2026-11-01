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
  ContactMessage,
  WebsiteSettings,
  ActivityLog,
  DashboardStats,
  Meeting,
  MeetingParticipant,
  MeetingMessage,
  MeetingAttendance,
  AdmissionStatus
} from '../src/types.ts';
import { syncSchemaToMongo, loadOrSeedMongo, mongoUpsert, mongoDelete, mongoClearCollections, isMongoConnected } from './mongo.ts';

const PERSISTENCE_DIR = path.join(process.cwd(), 'data');
const PERSISTENCE_FILE = path.join(PERSISTENCE_DIR, 'persistent_db.json');
const ADMIN_CONFIG_FILE = path.join(PERSISTENCE_DIR, 'admin_credentials.json');

export interface ResolvedAdminCredentials {
  username: string;
  email: string;
  password?: string;
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
            // If inline comment exists after unquoted text, remove it
            if (!val.startsWith('"') && !val.startsWith("'")) {
              const hashIdx = val.indexOf(' #');
              if (hashIdx !== -1) {
                val = val.slice(0, hashIdx).trim();
              }
            }
            // Strip surrounding quotes
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
  // 1. Check UI saved credentials in admin_credentials.json
  if (fs.existsSync(ADMIN_CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf-8'));
      if (data && data.username && data.password) {
        return {
          username: data.username.trim(),
          email: (data.email || 'admin@nexgencouncil.org').trim().toLowerCase(),
          password: data.password.trim(),
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

  // 4. Default fallback
  return {
    username: 'admin',
    email: 'admin@nexgencouncil.org',
    password: 'admin123',
    source: 'default'
  };
}

export interface DatabaseSchema {
  users: (User & { passwordHash: string; salt: string })[];
  applications: VolunteerApplication[];
  volunteers: Volunteer[];
  programs: Program[];
  events: EventItem[];
  news: NewsItem[];
  team: TeamMember[];
  gallery: GalleryItem[];
  contacts: ContactMessage[];
  settings: WebsiteSettings;
  activityLogs: ActivityLog[];
  meetings?: Meeting[];
  meetingParticipants?: MeetingParticipant[];
  meetingMessages?: MeetingMessage[];
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, s, 1000, 64, 'sha512').toString('hex');
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return computed === hash;
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
  siteUrl: 'https://nexgencouncil.bond',
  metaDescription: 'NexGen Women Empowerment & Youth Leadership Council is an international civil society organization dedicated to accelerating female leadership, youth civic engagement, and socio-economic advancement.',
  googleSiteVerification: '',
  googleAnalyticsId: ''
};

function getSeedData(): DatabaseSchema {
  const adminCreds = resolveAdminCredentials();
  const adminUsername = adminCreds.username;
  const adminEmail = adminCreds.email;
  const adminPassword = adminCreds.password || 'admin123';

  const superAdmin = hashPassword(adminPassword);
  const volunteerMgr = hashPassword('volunteer123');
  const contentMgr = hashPassword('editor123');

  return {
    users: [
      {
        id: 'usr_super_1',
        username: adminUsername,
        name: 'Executive Director (Super Admin)',
        email: adminEmail,
        role: 'SUPER_ADMIN',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        createdAt: '2025-01-10T10:00:00.000Z',
        passwordHash: superAdmin.hash,
        salt: superAdmin.salt
      },
      {
        id: 'usr_vol_2',
        username: 'fatima.volunteer',
        name: 'Fatima Zahra',
        email: 'fatima.z@nexgencouncil.org',
        role: 'VOLUNTEER_MANAGER',
        avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
        createdAt: '2025-02-14T09:30:00.000Z',
        passwordHash: volunteerMgr.hash,
        salt: volunteerMgr.salt
      },
      {
        id: 'usr_content_3',
        username: 'sarah.content',
        name: 'Sarah Jenkins',
        email: 'sarah.j@nexgencouncil.org',
        role: 'CONTENT_MANAGER',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        createdAt: '2025-03-01T11:00:00.000Z',
        passwordHash: contentMgr.hash,
        salt: contentMgr.salt
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
    contacts: [],
    settings: defaultSettings,
    activityLogs: [],
    meetings: [],
    meetingParticipants: [],
    meetingMessages: []
  };
}

class Database {
  private data: DatabaseSchema;

  private ensureMeetingArrays() {
    if (!this.data.meetings) this.data.meetings = [];
    if (!this.data.meetingParticipants) this.data.meetingParticipants = [];
    if (!this.data.meetingMessages) this.data.meetingMessages = [];
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
    // Always initialize Super Admin credentials from .env / config immediately
    this.syncSuperAdminFromEnv();
  }

  public async initFromMongo(): Promise<void> {
    try {
      if (isMongoConnected()) {
        this.data = await loadOrSeedMongo(this.data);
        this.saveToFile(this.data);
        console.log('[Database] Synchronized state with real-time MongoDB collections.');
      }
      this.syncSuperAdminFromEnv();
    } catch (err: any) {
      console.warn('[Database] Sync with MongoDB error:', err.message);
    }
  }

  public syncSuperAdminFromEnv() {
    const creds = resolveAdminCredentials();
    const adminUsername = creds.username;
    const adminEmail = creds.email;
    const adminPassword = creds.password || 'admin123';

    // Find any existing super admin or user with username "admin" or id usr_super_1
    let superAdmin = this.data.users.find(
      u => u.role === 'SUPER_ADMIN' || u.id === 'usr_super_1' || u.username.toLowerCase() === adminUsername.toLowerCase()
    );

    const { hash, salt } = hashPassword(adminPassword);

    if (superAdmin) {
      superAdmin.username = adminUsername;
      superAdmin.email = adminEmail;
      superAdmin.role = 'SUPER_ADMIN';
      superAdmin.passwordHash = hash;
      superAdmin.salt = salt;
    } else {
      superAdmin = {
        id: 'usr_super_1',
        username: adminUsername,
        name: 'Executive Director (Super Admin)',
        email: adminEmail,
        role: 'SUPER_ADMIN',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        createdAt: new Date().toISOString(),
        passwordHash: hash,
        salt
      };
      this.data.users.unshift(superAdmin);
    }
    this.save();
    mongoUpsert('users', superAdmin.id, superAdmin).catch(() => {});
    console.log(`[Database] Super Admin credentials active (source: ${creds.source}): user="${adminUsername}", email="${adminEmail}"`);
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

  // --- Auth & Users ---
  getUsers() {
    return this.data.users.map(({ passwordHash, salt, ...safeUser }) => safeUser);
  }

  getUserById(id: string) {
    const user = this.data.users.find(u => u.id === id);
    if (!user) return null;
    const { passwordHash, salt, ...safeUser } = user;
    return safeUser;
  }

  authenticate(usernameOrEmail: string, passwordPlain: string) {
    const cleanUser = (usernameOrEmail || '').trim();
    const cleanPass = (passwordPlain || '').trim();
    if (!cleanUser || !cleanPass) return null;

    // Dynamically re-sync with latest .env on disk or config
    const superAdmin = this.syncSuperAdminFromEnv();
    const creds = resolveAdminCredentials();

    // Check if logging in with Super Admin credentials
    const isSuperAdminTarget = (
      cleanUser.toLowerCase() === superAdmin.username.toLowerCase() ||
      cleanUser.toLowerCase() === superAdmin.email.toLowerCase() ||
      cleanUser.toLowerCase() === creds.username.toLowerCase() ||
      cleanUser.toLowerCase() === creds.email.toLowerCase()
    );

    if (isSuperAdminTarget) {
      // 1. Direct plaintext match with resolved password
      if (creds.password && cleanPass === creds.password) {
        const { passwordHash: _, salt: __, ...safeUser } = superAdmin;
        return safeUser;
      }
      // 2. PBKDF2 hash verification
      if (verifyPassword(cleanPass, superAdmin.passwordHash, superAdmin.salt)) {
        const { passwordHash: _, salt: __, ...safeUser } = superAdmin;
        return safeUser;
      }
    }

    // Otherwise check among all registered users
    const user = this.data.users.find(
      u => u.username.toLowerCase() === cleanUser.toLowerCase() ||
           u.email.toLowerCase() === cleanUser.toLowerCase()
    );
    if (!user) return null;
    const isValid = verifyPassword(cleanPass, user.passwordHash, user.salt);
    if (!isValid) return null;
    const { passwordHash, salt, ...safeUser } = user;
    return safeUser;
  }

  updateSuperAdminCredentials(newUsername: string, newPassword: string, newEmail?: string) {
    const username = newUsername.trim();
    const password = newPassword.trim();
    if (!username || !password) {
      throw new Error('Admin username and password cannot be empty.');
    }
    const email = (newEmail || 'admin@nexgencouncil.org').trim().toLowerCase();

    if (!fs.existsSync(PERSISTENCE_DIR)) {
      fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
    }
    fs.writeFileSync(
      ADMIN_CONFIG_FILE,
      JSON.stringify({ username, password, email, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );

    // Also synchronize into .env file on disk if exists
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

    const updated = this.syncSuperAdminFromEnv();
    const { passwordHash: _, salt: __, ...safeAdmin } = updated;
    return safeAdmin;
  }

  createUser(userData: { username: string; name: string; email: string; role: any; password: string }) {
    const { hash, salt } = hashPassword(userData.password);
    const newUser: DatabaseSchema['users'][0] = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: userData.username,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userData.name)}`,
      createdAt: new Date().toISOString(),
      passwordHash: hash,
      salt
    };
    this.data.users.push(newUser);
    this.save();
    mongoUpsert('users', newUser.id, newUser).catch(() => {});
    const { passwordHash: _, salt: __, ...safeUser } = newUser;
    return safeUser;
  }

  deleteUser(id: string) {
    this.data.users = this.data.users.filter(u => u.id !== id);
    this.save();
    mongoDelete('users', id).catch(() => {});
  }

  updateUser(id: string, updates: { username?: string; name?: string; email?: string; role?: any; password?: string }) {
    const user = this.data.users.find(u => u.id === id);
    if (!user) return null;

    if (updates.name && updates.name.trim()) {
      user.name = updates.name.trim();
    }
    if (updates.email && updates.email.trim()) {
      user.email = updates.email.trim().toLowerCase();
    }
    if (updates.username && updates.username.trim()) {
      user.username = updates.username.trim().toLowerCase();
    }
    if (updates.role) {
      user.role = updates.role;
    }
    if (updates.password && updates.password.trim()) {
      const { hash, salt } = hashPassword(updates.password.trim());
      user.passwordHash = hash;
      user.salt = salt;
    }

    this.save();
    mongoUpsert('users', user.id, user).catch(() => {});
    const { passwordHash: _, salt: __, ...safeUser } = user;
    return safeUser;
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
      joinedDate: data.joinedDate || new Date().toISOString(),
      hoursContributed: data.hoursContributed || 0,
      status: data.status || 'Active',
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

  // --- Programs ---
  getPrograms(publishedOnly = false) {
    if (publishedOnly) {
      return this.data.programs.filter(p => p.status === 'Published');
    }
    return this.data.programs;
  }

  getProgramBySlugOrId(identifier: string) {
    return this.data.programs.find(p => p.id === identifier || p.slug === identifier) || null;
  }

  getProgramBySlug(slug: string) {
    return this.data.programs.find(p => p.slug === slug || p.id === slug) || null;
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
    return this.data.events.find(e => e.slug === slug || e.id === slug) || null;
  }

  createEvent(eventData: Omit<EventItem, 'id'>) {
    const newEvent: EventItem = {
      ...eventData,
      id: `evt_${Date.now()}`
    };
    this.data.events.unshift(newEvent);
    this.save();
    mongoUpsert('events', newEvent.id, newEvent).catch(() => {});
    return newEvent;
  }

  updateEvent(id: string, updates: Partial<EventItem>) {
    const idx = this.data.events.findIndex(e => e.id === id);
    if (idx === -1) return null;
    this.data.events[idx] = { ...this.data.events[idx], ...updates };
    this.save();
    mongoUpsert('events', id, this.data.events[idx]).catch(() => {});
    return this.data.events[idx];
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
    return this.data.news.find(n => n.slug === slug || n.id === slug) || null;
  }

  createNews(newsData: Omit<NewsItem, 'id'>) {
    const item: NewsItem = {
      ...newsData,
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
    this.data.news[idx] = { ...this.data.news[idx], ...updates };
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
    let list = [...this.data.team];
    if (activeOnly) {
      list = list.filter(t => t.active);
    }
    return list.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  createTeamMember(member: Omit<TeamMember, 'id'>) {
    const newMember: TeamMember = {
      ...member,
      id: `tm_${Date.now()}`
    };
    this.data.team.push(newMember);
    this.save();
    mongoUpsert('team', newMember.id, newMember).catch(() => {});
    return newMember;
  }

  updateTeamMember(id: string, updates: Partial<TeamMember>) {
    const idx = this.data.team.findIndex(t => t.id === id);
    if (idx === -1) return null;
    this.data.team[idx] = { ...this.data.team[idx], ...updates };
    this.save();
    mongoUpsert('team', id, this.data.team[idx]).catch(() => {});
    return this.data.team[idx];
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
      id: `gal_${Date.now()}`
    };
    this.data.gallery.push(newItem);
    this.save();
    mongoUpsert('gallery', newItem.id, newItem).catch(() => {});
    return newItem;
  }

  deleteGalleryItem(id: string) {
    this.data.gallery = this.data.gallery.filter(g => g.id !== id);
    this.save();
    mongoDelete('gallery', id).catch(() => {});
  }

  // --- Contacts ---
  getContacts() {
    return [...this.data.contacts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  createContact(contact: Omit<ContactMessage, 'id' | 'status' | 'createdAt'>) {
    const newMsg: ContactMessage = {
      ...contact,
      id: `cnt_${Date.now()}`,
      status: 'Unread',
      createdAt: new Date().toISOString()
    };
    this.data.contacts.unshift(newMsg);
    this.save();
    mongoUpsert('contacts', newMsg.id, newMsg).catch(() => {});
    return newMsg;
  }

  updateContactStatus(id: string, status: ContactMessage['status']) {
    const msg = this.data.contacts.find(c => c.id === id);
    if (!msg) return null;
    msg.status = status;
    this.save();
    mongoUpsert('contacts', id, msg).catch(() => {});
    return msg;
  }

  deleteContact(id: string) {
    this.data.contacts = this.data.contacts.filter(c => c.id !== id);
    this.save();
    mongoDelete('contacts', id).catch(() => {});
  }

  // --- Settings ---
  getSettings() {
    const siteUrl = this.data.settings?.siteUrl || process.env.SITE_URL || 'https://nexgencouncil.bond';
    return { ...defaultSettings, siteUrl, ...this.data.settings };
  }

  updateSettings(updates: Partial<WebsiteSettings>) {
    this.data.settings = { ...defaultSettings, ...this.data.settings, ...updates };
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
      unreadInquiries: this.data.contacts.filter(c => c.status === 'Unread').length,
      recentActivity: this.data.activityLogs.slice(0, 8),
      monthlyApplications,
      interestDistribution
    };
  }

  // ----------------------------------------------------
  // LIVEKIT MEETINGS ENGINE
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
    description?: string;
    hostId: string;
    hostName: string;
    scheduledStart?: string;
    scheduledEnd?: string;
    password?: string;
    waitingRoomEnabled?: boolean;
    screenShareEnabled?: boolean;
    maxParticipants?: number;
    status?: Meeting['status'];
  }): Meeting {
    this.ensureMeetingArrays();
    const now = new Date().toISOString();
    const randCodePart1 = Math.random().toString(36).substring(2, 6);
    const randCodePart2 = Math.random().toString(36).substring(2, 6);
    const meetingCode = `nex-${randCodePart1}-${randCodePart2}`;
    const roomName = `room_${meetingCode}`;

    let passwordHash: string | undefined = undefined;
    let hasPassword = false;
    if (meetingData.password && meetingData.password.trim()) {
      const hp = hashPassword(meetingData.password.trim());
      passwordHash = hp.hash + ':' + hp.salt;
      hasPassword = true;
    }

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
      waitingRoomEnabled: meetingData.waitingRoomEnabled !== undefined ? meetingData.waitingRoomEnabled : true,
      screenShareEnabled: meetingData.screenShareEnabled !== undefined ? meetingData.screenShareEnabled : true,
      maxParticipants: meetingData.maxParticipants && meetingData.maxParticipants > 0 ? meetingData.maxParticipants : 50,
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

    const { password, ...restUpdates } = updates;
    const updated: Meeting = {
      ...current,
      ...restUpdates,
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
      if (participantData.displayName) participant.displayName = participantData.displayName;
      if (participantData.admissionStatus) participant.admissionStatus = participantData.admissionStatus;
      if (participantData.connectionStatus) participant.connectionStatus = participantData.connectionStatus;
      if (participantData.role) participant.role = participantData.role;
      if (participantData.identity) participant.identity = participantData.identity;
      participant.joinedAt = participant.joinedAt || now;
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
    const p = this.data.meetingParticipants!.find(
      item => item.meetingId === meetingId && (item.id === participantId || item.userId === participantId || item.identity === participantId)
    );
    if (!p) return null;

    p.admissionStatus = status;
    p.connectionStatus = status === 'admitted' ? 'connected' : 'disconnected';
    this.save();
    mongoUpsert('meeting_participants', p.id, p).catch(() => {});
    return p;
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
}

export const db = new Database();
