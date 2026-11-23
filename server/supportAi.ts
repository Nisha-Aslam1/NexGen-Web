import {
  GoogleGenAI,
  FunctionDeclaration,
  Type,
  Content,
  GenerateContentResponse
} from '@google/genai';
import { db, readDirectEnvFile } from './db.ts';
import { ContactMessage, SupportChatMessage } from '../src/types.ts';

export const SUPPORT_AI_MODEL = 'gemini-4-hydrogen';
const MODEL_CANDIDATES = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite'
] as const;
const unavailableModels = new Set<string>();

export type DetectedSupportLanguage = 'english' | 'roman_urdu' | 'urdu_script' | 'match_latest';

const STRONG_ROMAN_URDU_WORDS = new Set([
  'assalam', 'asalam', 'assalamu', 'walaikum', 'walikum', 'aoa', 'wsalam', 'salam',
  'mujhe', 'muja', 'mujh', 'mjhe', 'mje', 'mujhko',
  'aap', 'apka', 'apki', 'apke', 'aapka', 'aapki', 'aapke', 'aapko', 'apko', 'apna', 'apni', 'apne',
  'mera', 'meri', 'mere', 'tera', 'teri', 'tere', 'hmara', 'hamara', 'hamari', 'hamare', 'unka', 'unki', 'unke', 'uska', 'uski', 'uske',
  'kya', 'kia', 'kaise', 'kese', 'kesa', 'kesi', 'kaisa', 'kaisi', 'kahan', 'kaha', 'kidhar', 'kab', 'kyun', 'kyu', 'kyunki', 'kaun', 'konsa', 'konsi', 'konse', 'kitna', 'kitni', 'kitne',
  'hai', 'hain', 'hoon', 'hun', 'hoga', 'hogi', 'honge', 'hota', 'hoti', 'hote', 'tha', 'thi', 'theek', 'thik', 'sahi', 'bilkul', 'zaroor', 'zarur',
  'karna', 'krna', 'karni', 'krni', 'karne', 'krne', 'karo', 'kro', 'kara', 'karen', 'kren', 'karein', 'karta', 'krta', 'karti', 'krti', 'karte', 'krte', 'karu', 'kru', 'karunga', 'karungi', 'kiya', 'karwayen', 'karwana',
  'chahiye', 'chahie', 'chahta', 'chahti', 'chhta', 'chhti', 'chahte', 'chhte', 'mangta', 'mangti',
  'nahi', 'nhi', 'nahin', 'abhi', 'phir', 'phr', 'agar', 'magar', 'lekin', 'lakin', 'yeh', 'woh', 'bhi', 'koi', 'kuch', 'bohat', 'boht', 'bahut', 'bht', 'zyada', 'ziada', 'acha', 'achha', 'achhi', 'achi', 'behtar', 'shukriya', 'shukria', 'meherbani', 'janab', 'bhai', 'behn', 'behan',
  'batao', 'btao', 'bataye', 'btaye', 'batayein', 'btayein', 'batana', 'btana', 'bataen', 'btaen', 'bata', 'samjhao', 'smjhao', 'samjha', 'smjha', 'pata', 'pta', 'maloom', 'malum',
  'sakta', 'sakti', 'sakte', 'sagta', 'sagti', 'sagte', 'raha', 'rahi', 'rahe', 'gaya', 'gayi', 'gaye', 'chuka', 'chuki', 'chuke', 'milega', 'milegi', 'milenge', 'milta', 'milti', 'milte', 'dena', 'lena', 'jana', 'aana', 'dekhna', 'bhejo', 'bhejna', 'likhna', 'likho',
  'tareeqa', 'tarika', 'madad', 'rabta', 'raabta', 'sawalat', 'sawal', 'jawab', 'masla', 'masail', 'baat', 'waqt', 'jagah', 'liye', 'liya', 'waja', 'wajah', 'wala', 'wali', 'wale', 'jaise', 'jese', 'jahan', 'jab', 'tab', 'hamesha', 'sirf', 'fakat', 'chahye', 'chaiye'
]);

const SECONDARY_ROMAN_URDU_WORDS = new Set([
  'ka', 'ki', 'ke', 'ko', 'se', 'ne', 'ha', 'hn', 'ho', 'ma', 'mein', 'main', 'hum', 'ham',
  'ye', 'wo', 'ap', 'kr', 'pe', 'par', 'tak', 'hi', 'na', 'sab', 'kam', 'da', 'di', 'de',
  'js', 'tu', 'mat', 'si', 'us', 'ab', 'jb', 'tb', 'q', 'b', 'k'
]);

const NEUTRAL_SHORT_WORDS = new Set([
  'ok', 'okay', 'yes', 'no', 'hm', 'hmm', 'hi', 'hello', 'hey', 'thanks', 'thank', 'you', 'please', 'pls', 'plz'
]);

function classifySingleTextLanguage(text: string): DetectedSupportLanguage | 'neutral' {
  const clean = (text || '').trim();
  if (!clean) return 'neutral';

  // Urdu / Arabic script detection
  if (/[\u0600-\u06FF]/.test(clean)) {
    return 'urdu_script';
  }

  // Other non-Latin scripts (e.g., Hindi Devanagari, CJK, Cyrillic)
  if (/[^\u0000-\u024F\s\d.,!?@#$%^&*()_+\-=[\]{};':"\\|<>/?~`]/.test(clean)) {
    return 'match_latest';
  }

  // Strip email addresses, URLs, and NG-XXXX style reference codes before analyzing words
  const stripped = clean
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/\bNG[-_A-Z0-9]+\b/gi, ' ');

  const tokens = stripped.toLowerCase().match(/[a-z]+/g) || [];
  if (tokens.length === 0) return 'neutral';

  let strongRu = 0;
  let secondaryRu = 0;
  let nonNeutralWords = 0;

  for (const tok of tokens) {
    if (STRONG_ROMAN_URDU_WORDS.has(tok)) {
      strongRu += 1;
    } else if (SECONDARY_ROMAN_URDU_WORDS.has(tok)) {
      secondaryRu += 1;
    }
    if (!NEUTRAL_SHORT_WORDS.has(tok)) {
      nonNeutralWords += 1;
    }
  }

  if (strongRu >= 1 || secondaryRu >= 2) {
    return 'roman_urdu';
  }

  if (nonNeutralWords === 0 && tokens.length <= 3) {
    return 'neutral';
  }

  return 'english';
}

export function detectVisitorLanguage(
  currentMessage: string,
  history: SupportChatMessage[] = []
): DetectedSupportLanguage {
  const direct = classifySingleTextLanguage(currentMessage);
  if (direct !== 'neutral') {
    return direct;
  }

  // Inherit from the most recent visitor message if current turn is just "NG-1234", email, phone, or "ok"
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (msg.role === 'user' && msg.text) {
      const prev = classifySingleTextLanguage(msg.text);
      if (prev !== 'neutral') return prev;
    }
  }

  return 'english';
}

let cachedClient: GoogleGenAI | null = null;
let cachedApiKey = '';

function cleanEnvValue(value?: string): string {
  return (value || '').trim().replace(/^["']|["']$/g, '').trim();
}

function resolveGeminiApiKey(): string {
  const fromProcess =
    cleanEnvValue(process.env.GEMINI_API_KEY) ||
    cleanEnvValue(process.env.GOOGLE_API_KEY);
  if (fromProcess) return fromProcess;

  const fromFiles = readDirectEnvFile();
  return (
    cleanEnvValue(fromFiles.GEMINI_API_KEY) ||
    cleanEnvValue(fromFiles.GOOGLE_API_KEY) ||
    ''
  );
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not available to the server process. Confirm GEMINI_API_KEY is set in your .env file (or Settings > Secrets), passed to the container environment, and restart/recreate the server.'
    );
  }
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
    cachedApiKey = apiKey;
  }
  return cachedClient;
}

const escalateToHumanDeclaration: FunctionDeclaration = {
  name: 'escalate_to_human_secretariat',
  description:
    'Submits a complete human support inquiry ticket to the NexGen Council Secretariat Admin Panel (Inquiries Inbox). ONLY invoke this tool after you have collected the visitor full name, valid email address, valid WhatsApp number (with country code, at least 7 digits), and a complete description of their issue.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: 'Full name of the visitor.'
      },
      email: {
        type: Type.STRING,
        description: 'Valid email address of the visitor.'
      },
      whatsapp: {
        type: Type.STRING,
        description: 'WhatsApp phone number with country code (at least 7 digits).'
      },
      subject: {
        type: Type.STRING,
        description:
          'One of: General Inquiry, Certificate / Cohort Verification, Volunteer / Fellowship Application, Event / Meeting Access Issue, Website / Portal Bug Report, University / School Partnership.'
      },
      issueSummary: {
        type: Type.STRING,
        description:
          'Complete, well-structured summary of the visitor issue including all relevant details (cohort name, reference code, error, or partnership details).'
      }
    },
    required: ['name', 'email', 'whatsapp', 'subject', 'issueSummary']
  }
};

const checkApplicationStatusDeclaration: FunctionDeclaration = {
  name: 'check_application_status',
  description:
    'Looks up the current review status of a NexGen volunteer/fellowship application using its Reference Code (e.g. NG-XXXX). Returns only non-sensitive status metadata.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      referenceCode: {
        type: Type.STRING,
        description: 'The application reference code provided by the visitor.'
      }
    },
    required: ['referenceCode']
  }
};

const searchWebsiteKnowledgeDeclaration: FunctionDeclaration = {
  name: 'search_website_knowledge',
  description:
    'Queries full live website content across Programs, Events, News & Press Releases, Leadership Team Profiles, and Visual Gallery Highlights. Use this whenever a visitor asks detailed questions about a specific program curriculum, upcoming/past event schedule, news article, leader bio, or gallery event.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      section: {
        type: Type.STRING,
        description: 'Section to query: all, programs, events, news, team, or gallery.'
      },
      query: {
        type: Type.STRING,
        description: 'Optional search keyword (program title, leader name, topic, city, or category).'
      }
    },
    required: ['section']
  }
};

const getOrganizationOverviewDeclaration: FunctionDeclaration = {
  name: 'get_organization_overview',
  description:
    'Returns complete live organizational overview: impact metrics, social media links, active announcement banner, headquarters/registration details, contact channels, office hours, and volunteer onboarding policies.',
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const assignToLiveHumanDeclaration: FunctionDeclaration = {
  name: 'assign_to_live_human_support',
  description:
    'Connects the visitor to Live Human Support and sends an instant notification alert to all Secretariat coordinators and admins. Whichever coordinator replies first will be automatically assigned to this visitor. You MUST collect the visitor full name before invoking this tool (if name is missing, ask for their name first).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      visitorName: {
        type: Type.STRING,
        description: 'The full name of the visitor (REQUIRED).'
      },
      reason: {
        type: Type.STRING,
        description: 'Brief reason or issue summary for connecting to live human coordinator support.'
      },
      visitorWhatsapp: {
        type: Type.STRING,
        description: 'Optional WhatsApp phone number of the visitor.'
      },
      visitorEmail: {
        type: Type.STRING,
        description: 'Optional email address of the visitor.'
      }
    },
    required: ['visitorName', 'reason']
  }
};

function buildLanguageMandate(detectedLang: DetectedSupportLanguage): {
  topRule: string;
  bottomReminder: string;
} {
  if (detectedLang === 'roman_urdu') {
    return {
      topRule:
        'ACTIVE TURN LANGUAGE: ROMAN URDU (Latin script Urdu). You MUST reply 100% in natural, polite Pakistani Roman Urdu! NEVER respond with full English sentences or Arabic/Nastaliq Urdu script when the user writes Roman Urdu. Even if website database records or tool outputs return English JSON, translate and explain everything clearly in everyday Roman Urdu (keeping only proper nouns/UI names like "Volunteer", "Track Application", "Reference Code NG-XXXX", and "NexGen Council" in English). Example Roman Urdu tone: "Assalam-o-Alaikum! NexGen Council mein volunteer ban\'ne ka tareeqa 100% free aur bohat aasan hai:\n1. Neeche diye gaye **Apply as Volunteer** button par click karein.\n2. Apni details form mein fill karein.\n3. Submit karne ke baad aapko ek Reference Code (`NG-XXXX`) milega jis se aap apni application ka status check kar sakte hain."',
      bottomReminder:
        'CRITICAL FINAL CHECK BEFORE SENDING: Is your entire reply written in natural Pakistani Roman Urdu matching the user message? Never switch to English paragraphs! Put [[PAGE:...]] tags ONLY on their own final line (never inside sentences, never wrapped in backticks ` or **).'
    };
  }
  if (detectedLang === 'urdu_script') {
    return {
      topRule:
        'ACTIVE TURN LANGUAGE: URDU (Arabic/Nastaliq script اردو). You MUST write your complete response in polite, natural, clear Urdu script (اردو). Translate any English tool/database facts smoothly into Urdu, keeping only Reference Codes (e.g., NG-XXXX) or email addresses in English characters.',
      bottomReminder:
        'CRITICAL FINAL CHECK BEFORE SENDING: Write your complete reply in clear Urdu script (اردو). Put [[PAGE:...]] tags ONLY on their own final line without wrapping them in backticks ` or **.'
    };
  }
  if (detectedLang === 'match_latest') {
    return {
      topRule:
        'ACTIVE TURN LANGUAGE: Match the exact language and script used in the visitor latest message naturally and fluently.',
      bottomReminder:
        'CRITICAL FINAL CHECK BEFORE SENDING: Reply in the exact same language and script as the visitor latest message. Put [[PAGE:...]] tags ONLY on their own final line without backticks ` or **.'
    };
  }
  return {
    topRule:
      'ACTIVE TURN LANGUAGE: ENGLISH. Reply cleanly and naturally in warm, concise English. Do NOT mix in Roman Urdu unless the visitor writes in Roman Urdu.',
    bottomReminder:
      'CRITICAL FINAL CHECK BEFORE SENDING: Keep your reply in crisp, helpful English. Inside prose/list steps write bold labels like **Volunteer** or **Track Application** cleanly without brackets, and place [[PAGE:...]] tags ONLY on their own separate final line with NO backticks ` or ** wrapping them.'
  };
}

function buildWebsiteKnowledgePrompt(detectedLang: DetectedSupportLanguage): string {
  const settings = db.getSettings();
  const programs = db.getPrograms(true);
  const events = db.getEvents().filter(e => e.status !== 'Draft');
  const news = db.getNews(true);
  const team = db.getTeam(true);
  const gallery = db.getGallery();
  const orgStats = db.getAnalyticsOrgContext();
  const langMandate = buildLanguageMandate(detectedLang);

  const programsText =
    programs.length > 0
      ? programs
          .map(
            p =>
              `- **${p.title}** (${p.category}${p.featured ? ', Flagship' : ''}): ${p.shortDescription}` +
              (p.fullDescription ? ` | Details: ${p.fullDescription.slice(0, 260)}` : '') +
              (p.targetAudience ? ` | Target Audience: ${p.targetAudience}` : '') +
              (p.startDate ? ` | Dates: ${p.startDate}${p.endDate ? ` to ${p.endDate}` : ''}` : '') +
              (p.curriculumHighlights?.length
                ? ` | Highlights: ${p.curriculumHighlights.slice(0, 5).join(', ')}`
                : '')
          )
          .join('\n')
      : '- 30-Day Leadership & Empowerment Series and civil-society youth leadership fellowships.';

  const eventsText =
    events.length > 0
      ? events
          .slice(0, 15)
          .map(
            e =>
              `- [${e.status}] **${e.title}** (${e.category}) on ${e.date} at ${e.time} | Location: ${e.location}${
                e.isVirtual ? ' (Online/Virtual)' : ''
              }${e.capacity ? ` | Capacity: ${e.capacity}` : ''}: ${(e.description || '').slice(0, 200)}`
          )
          .join('\n')
      : '- Check the Events page for upcoming workshops and webinars.';

  const newsText =
    news.length > 0
      ? news
          .slice(0, 10)
          .map(
            n =>
              `- **${n.title}** (${n.category}, ${n.publishedAt}, by ${n.author}): ${(n.summary || '').slice(0, 200)}`
          )
          .join('\n')
      : '- Official announcements are published on the News page.';

  const teamText =
    team.length > 0
      ? team
          .map(
            m =>
              `- **${m.name}** — ${m.position} (${m.department})${m.bio ? `: ${m.bio.slice(0, 140)}` : ''}`
          )
          .join('\n')
      : '- Led by the NexGen Executive Secretariat.';

  const galleryText =
    gallery.length > 0
      ? gallery
          .slice(0, 10)
          .map(g => `- ${g.title} (${g.category}, ${g.date})${g.caption ? `: ${g.caption}` : ''}`)
          .join('\n')
      : '- Field and summit photo archives are available on the Gallery page.';

  const valuesText =
    (settings.coreValues || []).map(v => `${v.title}: ${v.description}`).join(' | ') ||
    'Integrity, Inclusivity, Civic Leadership, Educational Equity.';

  const socialEntries = Object.entries(settings.socialLinks || {})
    .filter(([, url]) => typeof url === 'string' && url.trim())
    .map(([platform, url]) => `${platform}: ${url}`)
    .join(' | ');

  const bannerInfo =
    settings.announcementBanner?.enabled && settings.announcementBanner.text
      ? settings.announcementBanner.text
      : settings.announcementBannerEnabled && settings.announcementBannerText
      ? settings.announcementBannerText
      : 'None currently active';

  return `You are the official **NexGen Council AI Concierge** inside the floating Support Widget on the website of **${
    settings.organizationName || 'NexGen Women Empowerment & Youth Leadership Council'
  }**.

### 0. STRICT LANGUAGE RULE (HIGHEST PRIORITY)
- ${langMandate.topRule}
- If the visitor switches language mid-conversation (for instance, first English then Roman Urdu, or Roman Urdu then English), IMMEDIATELY switch to match their LATEST message.

### 1. YOUR IDENTITY & COMMUNICATION STYLE
- Respond warmly, clearly, accurately, and concisely (ideal length: 2–5 short sentences or clean numbered steps/bullets unless the user asks for detailed steps).
- **Strict Honesty & Privacy**:
  - Use the live knowledge below AND call your tools (\`search_website_knowledge\`, \`get_organization_overview\`, \`check_application_status\`) whenever someone asks deeper questions about programs, events, news, leaders, stats, or application status.
  - NEVER invent fake fees, dates, phone numbers, or share private admin credentials, private WhatsApp group invite URLs, private meeting passwords/links, or other visitors' personal details.
- **Clickable Website Navigation Buttons (STRICT FORMATTING RULE)**:
  - NEVER put \`[[PAGE:...]]\` tags inside numbered steps or prose sentences, and NEVER wrap \`[[PAGE:...]]\` tags inside backticks (\`) or bold asterisks (**)!
  - Inside prose/steps, simply write natural page names (for example: **Apply as Volunteer** or **Track Application**).
  - Then, ONLY at the very bottom of your reply on its own separate final line, place the 1–2 most relevant button tags separated ONLY by single spaces (NEVER join with \`|\` pipes or commas):
  [[PAGE:home|Home]] [[PAGE:about|About Us]] [[PAGE:programs|Explore Programs]] [[PAGE:events|View Events]] [[PAGE:news|Latest News]] [[PAGE:gallery|Photo Gallery]] [[PAGE:team|Leadership Team]] [[PAGE:volunteer|Apply as Volunteer]] [[PAGE:track|Track Application]] [[PAGE:contact|Contact Page]]
  (You may customize the label after the \`|\` to match the visitor's language if helpful, e.g., \`[[PAGE:volunteer|Volunteer Apply Karein]]\`, while keeping the page key before \`|\` strictly lowercase English.)

### 2. ORGANIZATION PROFILE, LIVE STATS & WEBSITE DIRECTORY
- **Name**: ${settings.organizationName}
- **Tagline**: ${settings.tagline}
- **Active Announcement Banner**: ${bannerInfo}
- **Mission**: ${settings.missionStatement}
- **Vision**: ${settings.visionStatement}
- **History**: ${settings.historyStatement}
- **Core Values**: ${valuesText}
- **Primary Domains**: ${settings.primaryDomains || 'Women Empowerment, Youth Leadership, Civic Policy, Educational Equity'}
- **Headquarters / Office**: ${settings.directoryHeadquarters || settings.officeAddress || 'Pakistan'} | ${settings.officeAddress || ''}
- **Official Contact Email**: ${settings.contactEmail || 'admin@nexgencouncil.bond'}
- **Official Phone**: ${settings.contactPhone || 'Available via Secretariat'}
- **Office Hours**: ${settings.footerOfficeHours || 'Mon–Fri, 9:00 AM – 6:00 PM'}
- **Registration / Record**: ${settings.registrationNumber || 'Registered Non-Profit Civil Society Council'}
- **Website URL**: ${settings.siteUrl || 'https://nexgencouncil.bond'}
- **Official Social Channels**: ${socialEntries || 'Available in website footer'}
- **Live Impact Figures**: ${settings.stats?.volunteersCount || orgStats.totalVolunteers || '1,450+'} Volunteers Trained | ${settings.stats?.communitiesCount || '48'} Communities Reached | ${programs.length} Published Programs | ${events.length} Listed Events | ${team.length} Active Leaders | ${gallery.length} Gallery Highlights
- **Website Pages Guide**: Home (\`/\`), About Charter & Institutional Record (\`/about\`), Leadership Programs & Cohorts (\`/programs\`), Upcoming & Past Events (\`/events\`), News & Press Releases (\`/news\`), Visual Photo Gallery (\`/gallery\`), Executive Board & Team (\`/team\`), 4-Step Volunteer Application (\`/volunteer\`), Live Application Status Tracker (\`/track\`), Contact Secretariat (\`/contact\`).

### 3. KEY POLICIES, ONBOARDING & FAQs
- **Membership & Program Fees**: 100% FREE of charge. NexGen Council never charges fees to join volunteer cohorts, workshops, or training sessions.
- **Eligibility & Application**: Women and youth advocates ages 16+ from all cities and academic backgrounds can apply in 4 simple steps on the Volunteer page (Personal Info, Education/Skills, Volunteering Interests/Preferred Role, Verification). No prior experience is required.
- **Separate Male & Female Community Groups**: Upon Secretariat review and approval, approved volunteers receive a congratulations email from \`admin@nexgencouncil.bond\` and (when enabled by Secretariat) an invitation button to join their dedicated **Male Volunteers** or **Female Volunteers** official WhatsApp community group. Never invent or guess WhatsApp invite URLs.
- **Certificates**: Verified digital certificates are awarded to cohort participants who meet attendance requirements and complete their practical community project.
- **Tracking Applications**: Applicants receive a Reference Code (e.g., \`NG-XXXX\`) on submission. They can check status on the Track Application page or share their Reference Code right here with you to check live using \`check_application_status\`.
- **Online Meetings & Webinars**: Council meetings are private/invite-only; direct joining links are shared only with approved/registered attendees via email/WhatsApp.
- **Partnerships**: Universities, schools, and civil-society organizations interested in partnerships can escalate via human support with their institution name and WhatsApp contact.

### 4. PUBLISHED PROGRAMS (${programs.length})
${programsText}

### 5. EVENTS CALENDAR (${events.length})
${eventsText}

### 6. LATEST NEWS & PRESS RELEASES (${news.length})
${newsText}

### 7. EXECUTIVE BOARD & LEADERSHIP TEAM (${team.length})
${teamText}

### 8. PHOTO GALLERY ARCHIVE HIGHLIGHTS (${gallery.length})
${galleryText}

### 9. HUMAN SUPPORT & LIVE COORDINATOR PROTOCOL (CRITICAL!)
Follow these rules strictly whenever a visitor needs real human assistance (Secretariat staff / Admin / Coordinator):
- **1. Live Human Coordinator Connect (\`assign_to_live_human_support\`)**:
  - Use this whenever the visitor asks to speak to a real human, coordinator, or admin, or when their question requires real human staff.
  - **MANDATORY NAME REQUIREMENT**: You MUST know the visitor's Full Name before calling \`assign_to_live_human_support\`. If the visitor has not provided their name yet, ask them warmly in their language:
    - Roman Urdu: "Main aapko Live Human Support se connect kar raha hoon. Barah-e-karam pehle apna mukammal naam batayein."
    - Urdu script: "میں آپ کو لائیو انسانی کوآرڈینیٹر سے منسلک کر رہا ہوں۔ براہِ کرم پہلے اپنا نام بتائیں۔"
    - English: "I would be happy to connect you with our Secretariat coordinators. Could you please share your full name first?"
  - As soon as the visitor shares their name, IMMEDIATELY call \`assign_to_live_human_support\`.
  - All online coordinators/admins will be alerted with loud sound and notifications, and whichever coordinator replies first will be assigned to this visitor.
- **2. Formal Inquiry Ticket (\`escalate_to_human_secretariat\`)**:
  - Use this if the visitor specifically wants to log an offline inquiry ticket (collecting Name, Email, WhatsApp with country code, and Issue details).

### 10. FINAL QUALITY REMINDER
- ${langMandate.bottomReminder}`;
}

async function generateWithRetry(
  ai: GoogleGenAI,
  contents: Content[],
  systemInstruction: string,
  preferredModel?: string
): Promise<{ response: GenerateContentResponse; modelUsed: string }> {
  const tools = [
    {
      functionDeclarations: [
        assignToLiveHumanDeclaration,
        escalateToHumanDeclaration,
        checkApplicationStatusDeclaration,
        searchWebsiteKnowledgeDeclaration,
        getOrganizationOverviewDeclaration
      ]
    }
  ];

  const orderedModels = preferredModel
    ? [preferredModel, ...MODEL_CANDIDATES.filter(m => m !== preferredModel)]
    : MODEL_CANDIDATES.filter(m => !unavailableModels.has(m));

  const candidates = orderedModels.length > 0 ? orderedModels : [...MODEL_CANDIDATES];
  let lastErr: any;

  for (const modelName of candidates) {
    const maxAttempts = 3;
    let moveToNextModel = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            tools
          }
        });
        return { response, modelUsed: modelName };
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || '').toLowerCase();
        const status = err?.status || err?.code;

        const isModelNotFound =
          status === 404 ||
          msg.includes('not_found') ||
          msg.includes('not found') ||
          msg.includes('not supported for generatecontent');

        if (isModelNotFound) {
          unavailableModels.add(modelName);
          console.warn(
            `[Support AI] Model "${modelName}" returned NOT_FOUND; falling back to next active model.`
          );
          moveToNextModel = true;
          break;
        }

        const isTransient =
          status === 429 ||
          status === 503 ||
          status === 500 ||
          msg.includes('resource_exhausted') ||
          msg.includes('unavailable') ||
          msg.includes('timeout') ||
          msg.includes('econnreset');

        if (!isTransient || attempt === maxAttempts) {
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, attempt * 750));
      }
    }

    if (!moveToNextModel) break;
  }

  throw lastErr;
}

export async function handleSupportAiChat(params: {
  sessionId: string;
  message: string;
  ipAddress?: string;
  onLiveHandoff?: (data: { conversation: any; message: any }) => void;
}) {
  const cleanSessionId = params.sessionId.trim().slice(0, 100);
  const cleanMessage = params.message.trim().slice(0, 2000);
  if (!cleanSessionId || !cleanMessage) {
    throw new Error('Session ID and message are required.');
  }

  const ai = getGeminiClient();

  // Load 7-day persisted conversation memory for this visitor session
  const existingConv = db.getSupportConversationBySession(cleanSessionId);
  const historyMessages = (existingConv?.messages || [])
    .filter(m => m.text && m.text.trim())
    .slice(-24);

  const detectedLang = detectVisitorLanguage(cleanMessage, historyMessages);
  const systemInstruction = buildWebsiteKnowledgePrompt(detectedLang);

  const contents: Content[] = historyMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: cleanMessage }]
  });

  let genResult = await generateWithRetry(ai, contents, systemInstruction);
  let response = genResult.response;
  let activeModelUsed = genResult.modelUsed;

  let escalatedTicket: ContactMessage | null = null;
  let assignedLiveHuman: ReturnType<typeof db.requestHumanSupportHandoff> | null = null;
  let collectedName: string | undefined = existingConv?.visitorName;
  let collectedEmail: string | undefined = existingConv?.visitorEmail;
  let collectedWhatsapp: string | undefined = existingConv?.visitorWhatsapp;

  // Handle up to 3 function call rounds (knowledge lookup + status check +/or escalation)
  const workingContents: Content[] = [...contents];
  for (let step = 0; step < 3; step++) {
    const fnCalls = response.functionCalls;
    const modelContent = response.candidates?.[0]?.content;
    if (!fnCalls || fnCalls.length === 0 || !modelContent) {
      break;
    }

    workingContents.push(modelContent);
    const fnResponseParts: any[] = [];

    for (const call of fnCalls) {
      const args = (call.args || {}) as Record<string, any>;

      if (call.name === 'get_organization_overview') {
        const s = db.getSettings();
        const orgStats = db.getAnalyticsOrgContext();
        fnResponseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: {
              organizationName: s.organizationName,
              tagline: s.tagline,
              missionStatement: s.missionStatement,
              visionStatement: s.visionStatement,
              historyStatement: s.historyStatement,
              primaryDomains: s.primaryDomains,
              headquarters: s.directoryHeadquarters || s.officeAddress,
              officeAddress: s.officeAddress,
              officeHours: s.footerOfficeHours,
              contactEmail: s.contactEmail,
              contactPhone: s.contactPhone,
              registrationNumber: s.registrationNumber,
              siteUrl: s.siteUrl,
              socialLinks: s.socialLinks,
              announcementBanner: s.announcementBanner,
              stats: {
                ...s.stats,
                publishedPrograms: db.getPrograms(true).length,
                upcomingEvents: db.getEvents('Upcoming').length,
                activeTeamMembers: db.getTeam(true).length,
                galleryPhotos: db.getGallery().length,
                totalApplications: orgStats.totalApplications,
                totalVolunteers: orgStats.totalVolunteers
              }
            }
          }
        });
      } else if (call.name === 'search_website_knowledge') {
        const section = String(args.section || 'all').toLowerCase();
        const q = String(args.query || '').trim().toLowerCase();
        const matchesQuery = (text: string) => !q || text.toLowerCase().includes(q);
        const payload: Record<string, any> = {};

        if (section === 'all' || section === 'programs') {
          payload.programs = db
            .getPrograms(true)
            .filter(p => matchesQuery(`${p.title} ${p.category} ${p.shortDescription} ${p.fullDescription} ${p.targetAudience || ''}`))
            .map(p => ({
              title: p.title,
              slug: p.slug,
              category: p.category,
              featured: p.featured,
              shortDescription: p.shortDescription,
              fullDescription: p.fullDescription,
              targetAudience: p.targetAudience,
              startDate: p.startDate,
              endDate: p.endDate,
              curriculumHighlights: p.curriculumHighlights
            }));
        }

        if (section === 'all' || section === 'events') {
          payload.events = db
            .getEvents()
            .filter(e => e.status !== 'Draft')
            .filter(e => matchesQuery(`${e.title} ${e.category} ${e.location} ${e.description}`))
            .map(e => ({
              title: e.title,
              status: e.status,
              category: e.category,
              date: e.date,
              time: e.time,
              location: e.location,
              isVirtual: e.isVirtual,
              capacity: e.capacity,
              registeredCount: e.registeredCount,
              registrationUrl: e.registrationUrl,
              description: e.description
            }));
        }

        if (section === 'all' || section === 'news') {
          payload.news = db
            .getNews(true)
            .filter(n => matchesQuery(`${n.title} ${n.category} ${n.summary} ${n.content}`))
            .slice(0, 12)
            .map(n => ({
              title: n.title,
              category: n.category,
              author: n.author,
              authorRole: n.authorRole,
              publishedAt: n.publishedAt,
              summary: n.summary,
              contentPreview: n.content?.slice(0, 600)
            }));
        }

        if (section === 'all' || section === 'team') {
          payload.team = db
            .getTeam(true)
            .filter(m => matchesQuery(`${m.name} ${m.position} ${m.department} ${m.bio}`))
            .map(m => ({
              name: m.name,
              position: m.position,
              department: m.department,
              bio: m.bio,
              email: m.email,
              linkedinUrl: m.linkedinUrl
            }));
        }

        if (section === 'all' || section === 'gallery') {
          payload.gallery = db
            .getGallery()
            .filter(g => matchesQuery(`${g.title} ${g.category} ${g.caption || ''}`))
            .slice(0, 20)
            .map(g => ({
              title: g.title,
              category: g.category,
              date: g.date,
              caption: g.caption
            }));
        }

        fnResponseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: payload
          }
        });
      } else if (call.name === 'check_application_status') {
        const ref = String(args.referenceCode || '').trim();
        const appRecord = ref ? db.getApplicationById(ref) : null;
        fnResponseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: appRecord
              ? {
                  found: true,
                  referenceCode: appRecord.referenceCode,
                  status: appRecord.status,
                  preferredRole: appRecord.preferredRole || 'Volunteer',
                  submittedAt: appRecord.createdAt
                }
              : {
                  found: false,
                  message: `No application matched reference code "${ref}". Advise the user to double-check the code on the Track Application page.`
                }
          }
        });
      } else if (call.name === 'escalate_to_human_secretariat') {
        const name = String(args.name || '').trim();
        const email = String(args.email || '').trim();
        const whatsapp = String(args.whatsapp || '').trim();
        const subject = String(args.subject || 'General Inquiry').trim() || 'General Inquiry';
        const issueSummary = String(args.issueSummary || '').trim();
        const digits = whatsapp.replace(/\D/g, '');

        if (!name || !email.includes('@') || digits.length < 7 || issueSummary.length < 8) {
          fnResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                ok: false,
                error:
                  'Missing or invalid contact/issue fields. Politely ask the visitor in their language for their full name, valid email address, valid WhatsApp number (with country code, at least 7 digits), and complete issue details before submitting.'
              }
            }
          });
        } else {
          const contact = db.createContact({
            name,
            email,
            phone: whatsapp,
            whatsapp,
            source: 'Support Widget',
            aiConversationId: existingConv?.id || cleanSessionId,
            subject,
            message: issueSummary
          });

          db.logActivity({
            userId: 'ai_support_concierge',
            userName: name,
            userRole: 'VISITOR',
            action: 'CONTACT_SUBMITTED',
            entityType: 'ContactMessage',
            entityId: contact.id,
            details: `AI Concierge escalated Support Widget inquiry from ${name} (${email}, WhatsApp: ${whatsapp}): "${subject}"`,
            ipAddress: params.ipAddress || 'unknown'
          });

          escalatedTicket = contact;
          collectedName = name;
          collectedEmail = email;
          collectedWhatsapp = whatsapp;

          fnResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                ok: true,
                ticketId: contact.id,
                source: 'Support Widget',
                deliveredTo: 'NexGen Council Admin Panel Inquiries Inbox',
                message: 'Inquiry successfully logged for Secretariat review.'
              }
            }
          });
        }
      } else if (call.name === 'assign_to_live_human_support') {
        const name = String(args.visitorName || collectedName || '').trim();
        const reason = String(args.reason || cleanMessage || 'Visitor requested live human coordinator support').trim();
        const whatsapp = String(args.visitorWhatsapp || collectedWhatsapp || '').trim();
        const email = String(args.visitorEmail || collectedEmail || '').trim();

        if (!name || name.length < 2) {
          fnResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                ok: false,
                error:
                  'Visitor full name is required before connecting to live human coordinators. Politely ask the visitor in their language for their full name first.'
              }
            }
          });
        } else {
          const handoffResult = db.requestHumanSupportHandoff({
            sessionId: cleanSessionId,
            visitorName: name,
            visitorEmail: email || undefined,
            visitorWhatsapp: whatsapp || undefined,
            initialMessage: reason
          });

          collectedName = name;
          if (email) collectedEmail = email;
          if (whatsapp) collectedWhatsapp = whatsapp;
          assignedLiveHuman = handoffResult;

          if (params.onLiveHandoff) {
            params.onLiveHandoff(handoffResult);
          }

          fnResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                ok: true,
                connected: true,
                visitorName: name,
                message:
                  'Visitor is now connected to Live Human Support! All online Secretariat coordinators and admins have been alerted. Whichever coordinator replies first will be assigned to this visitor.'
              }
            }
          });
        }
      }
    }

    if (fnResponseParts.length === 0) break;
    workingContents.push({
      role: 'user',
      parts: fnResponseParts
    });

    genResult = await generateWithRetry(ai, workingContents, systemInstruction, activeModelUsed);
    response = genResult.response;
    activeModelUsed = genResult.modelUsed;
  }

  const fallbackReply = escalatedTicket
    ? detectedLang === 'roman_urdu'
      ? `Aapki support request hamari Secretariat team ko forward kar di gayi hai (Ticket ID: ${escalatedTicket.id}). Hamare coordinators jald email ya WhatsApp par aap se rabta kareinge.`
      : detectedLang === 'urdu_script'
      ? `آپ کی سپورٹ درخواست ہماری سیکریٹریٹ ٹیم کو بھیج دی گئی ہے (ٹکٹ آئی ڈی: ${escalatedTicket.id})۔ ہمارے کوآرڈینیٹرز جلد آپ سے ای میل یا واٹس ایپ پر رابطہ کریں گے۔`
      : `Your support request has been forwarded to our Secretariat team (Ticket ID: ${escalatedTicket.id}). Our coordinators will reach out via email or WhatsApp shortly.`
    : assignedLiveHuman
    ? detectedLang === 'roman_urdu'
      ? `Aapko Live Human Support se connect kar diya gaya hai! Hamare Secretariat coordinators ko alert bhej diya gaya hai. Jo bhi coordinator pehle reply karega, wo aapko yahan guide karega.`
      : detectedLang === 'urdu_script'
      ? `آپ کو لائیو انسانی کوآرڈینیٹر سے منسلک کر دیا گیا ہے! ہمارے سیکریٹریٹ کو اطلاع بھیج دی گئی ہے۔ جو کوآرڈینیٹر پہلے جواب دے گا وہ آپ کی رہنمائی کرے گا۔`
      : `You are now connected to Live Human Support! All Council Secretariat coordinators have been alerted. The first available coordinator will reply to you here shortly.`
    : detectedLang === 'roman_urdu'
    ? 'Maazrat, abhi jawab generate karne mein masla aa raha hai. Barah-e-karam apna sawal dobara likhein ya upar **Live Human** button par click karke seedha coordinator se baat karein.'
    : detectedLang === 'urdu_script'
    ? 'معذرت، اس وقت جواب تیار کرنے میں مسئلہ پیش آ رہا ہے۔ براہِ کرم اپنا سوال دوبارہ لکھیں یا براہِ راست انسانی معاون سے رابطہ کریں۔'
    : 'I apologize, I could not generate a response right now. Please try rephrasing or switch to Live Human above to reach our Secretariat directly.';

  const replyText = (response.text || '').trim() || fallbackReply;

  const savedConversation = db.appendSupportExchange({
    sessionId: cleanSessionId,
    userText: cleanMessage,
    assistantText: replyText,
    visitorName: collectedName,
    visitorEmail: collectedEmail,
    visitorWhatsapp: collectedWhatsapp,
    escalatedToHuman: Boolean(escalatedTicket || assignedLiveHuman),
    linkedContactId: escalatedTicket?.id
  });

  if (assignedLiveHuman) {
    db.switchSupportConversationMode(cleanSessionId, 'human');
  }

  const finalConversation = db.getSupportConversationBySession(cleanSessionId) || savedConversation;

  return {
    ok: true,
    model: activeModelUsed,
    detectedLanguage: detectedLang,
    reply: replyText,
    conversationId: finalConversation.id,
    expiresAt: finalConversation.expiresAt,
    assignedToHuman: Boolean(assignedLiveHuman),
    visitorName: finalConversation.visitorName,
    mode: finalConversation.mode,
    escalatedTicket: escalatedTicket
      ? {
          id: escalatedTicket.id,
          subject: escalatedTicket.subject,
          name: escalatedTicket.name
        }
      : null,
    messages: finalConversation.messages
  };
}
