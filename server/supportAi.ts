import {
  GoogleGenAI,
  FunctionDeclaration,
  Type,
  Content,
  GenerateContentResponse
} from '@google/genai';
import { db, readDirectEnvFile } from './db.ts';
import { ContactMessage } from '../src/types.ts';

export const SUPPORT_AI_MODEL = 'gemini-3.5-flash-lite';
const MODEL_CANDIDATES = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen'
] as const;
const unavailableModels = new Set<string>();

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

function buildWebsiteKnowledgePrompt(): string {
  const settings = db.getSettings();
  const programs = db.getPrograms(true);
  const events = db.getEvents();
  const news = db.getNews(true).slice(0, 8);
  const team = db.getTeam().filter(t => t.active !== false);

  const programsText =
    programs.length > 0
      ? programs
          .map(
            p =>
              `- ${p.title} (${p.category}${p.featured ? ', Featured' : ''}): ${p.shortDescription}` +
              (p.targetAudience ? ` | Target Audience: ${p.targetAudience}` : '') +
              (p.startDate ? ` | Dates: ${p.startDate}${p.endDate ? ` to ${p.endDate}` : ''}` : '') +
              (p.curriculumHighlights?.length
                ? ` | Highlights: ${p.curriculumHighlights.slice(0, 4).join(', ')}`
                : '')
          )
          .join('\n')
      : '- 30-Day Leadership & Empowerment Series and civil-society youth leadership fellowships.';

  const eventsText =
    events.length > 0
      ? events
          .slice(0, 10)
          .map(
            e =>
              `- [${e.status}] ${e.title} (${e.category}) on ${e.date} at ${e.time} | Location: ${e.location}${
                e.isVirtual ? ' (Online/Virtual)' : ''
              }: ${e.description?.slice(0, 160)}`
          )
          .join('\n')
      : '- Check the Events page for upcoming workshops and webinars.';

  const newsText =
    news.length > 0
      ? news
          .map(n => `- ${n.title} (${n.category}, ${n.publishedAt}): ${n.summary?.slice(0, 150)}`)
          .join('\n')
      : '- Official announcements are published on the News page.';

  const teamText =
    team.length > 0
      ? team.map(m => `- ${m.name} — ${m.position} (${m.department})`).join('\n')
      : '- Led by the NexGen Executive Secretariat.';

  const valuesText =
    (settings.coreValues || []).map(v => `${v.title}: ${v.description}`).join(' | ') ||
    'Integrity, Inclusivity, Civic Leadership, Educational Equity.';

  return `You are the official **NexGen Council AI Concierge** inside the floating Support Widget on the website of **${
    settings.organizationName || 'NexGen Women Empowerment & Youth Leadership Council'
  }**.

### 1. YOUR IDENTITY & COMMUNICATION STYLE
- Respond warmly, clearly, accurately, and concisely (ideal length: 2–5 short sentences or clean bullet points unless the user asks for detailed steps).
- **Language Matching**: Reply in the exact language/script the visitor uses — English, Urdu, or Roman Urdu (e.g., if they write in Roman Urdu like "mujhe volunteer apply karna ha", reply naturally and professionally in Roman Urdu!).
- **Strict Honesty**: Only state facts, schedules, policies, programs, and contact channels verified below or retrieved from tools. Never invent fake fees, dates, phone numbers, or private data.
- **Clickable Website Guidance**: Whenever guiding the visitor to a page on this website, you may include inline navigation chips using this EXACT syntax:
  \`[[PAGE:home|Home]]\`, \`[[PAGE:about|About Us]]\`, \`[[PAGE:programs|Explore Programs]]\`, \`[[PAGE:events|View Events]]\`, \`[[PAGE:news|Latest News]]\`, \`[[PAGE:gallery|Photo Gallery]]\`, \`[[PAGE:team|Leadership Team]]\`, \`[[PAGE:volunteer|Apply as Volunteer]]\`, \`[[PAGE:track|Track Application]]\`, \`[[PAGE:contact|Contact Page]]\`.
  Use these tags naturally so the widget renders interactive navigation buttons for the user!

### 2. ORGANIZATION PROFILE & CONTACT DETAILS
- **Name**: ${settings.organizationName}
- **Tagline**: ${settings.tagline}
- **Mission**: ${settings.missionStatement}
- **Vision**: ${settings.visionStatement}
- **History**: ${settings.historyStatement}
- **Core Values**: ${valuesText}
- **Primary Domains**: ${settings.primaryDomains || 'Women Empowerment, Youth Leadership, Civic Policy, Educational Equity'}
- **Official Contact Email**: ${settings.contactEmail || 'admin@nexgencouncil.bond'}
- **Official Phone**: ${settings.contactPhone || 'Available via Secretariat'}
- **Office Address**: ${settings.officeAddress || 'Headquarters'}
- **Office Hours**: ${settings.footerOfficeHours || 'Mon–Fri, 9:00 AM – 5:00 PM'}
- **Registration / Record**: ${settings.registrationNumber || 'Registered Non-Profit Civil Society Council'}
- **Website URL**: ${settings.siteUrl || 'https://nexgencouncil.bond'}

### 3. KEY POLICIES & FAQs
- **Membership & Program Fees**: 100% FREE of charge. NexGen Council never charges fees to join volunteer cohorts, workshops, or training sessions.
- **Eligibility**: Women and youth advocates ages 16+ from all academic backgrounds and cities can apply on the Volunteer page (\`[[PAGE:volunteer|Apply as Volunteer]]\`). No prior experience is required.
- **Certificates**: Verified digital certificates are awarded to cohort participants who meet attendance requirements and submit their practical community project.
- **Tracking Applications**: Applicants receive a Reference Code (e.g., \`NG-XXXX\`) on submission. They can check status on the Track Application page (\`[[PAGE:track|Track Application]]\`) or share their Reference Code right here with you to check live using \`check_application_status\`.
- **Online Meetings & Webinars**: Direct meeting room links are shared with approved/registered attendees via email/WhatsApp. Waiting room admission opens ~5 minutes before start. Note: Council meetings are private/invite-only and not listed publicly.
- **Partnerships**: Universities, schools, and civil-society organizations interested in partnerships can escalate via human support with their institution name and WhatsApp contact.

### 4. LIVE WEBSITE PROGRAMS (${programs.length})
${programsText}

### 5. LIVE EVENTS (${events.length})
${eventsText}

### 6. LATEST NEWS & ANNOUNCEMENTS (${news.length})
${newsText}

### 7. LEADERSHIP TEAM (${team.length})
${teamText}

### 8. HUMAN SUPPORT ESCALATION PROTOCOL (CRITICAL!)
Follow these rules strictly whenever a visitor needs real human assistance (Secretariat staff / Admin / Coordinator):
- **When to escalate**:
  1. The visitor explicitly asks to speak with a real human, admin, coordinator, or team member; OR
  2. You cannot resolve their personal request with website info alone (e.g., missing certificate verification, technical/account problem, application correction, urgent event access issue, complaint, partnership inquiry).
- **Mandatory Step-by-Step Collection BEFORE Calling \`escalate_to_human_secretariat\`**:
  Do NOT call \`escalate_to_human_secretariat\` until you have ALL four items in the conversation memory:
  1. **Complete Issue Details**: If the visitor only says something vague like "I need help" or "human se baat karni ha", first ask them politely to explain their complete issue so the team can prepare.
  2. **Full Name**
  3. **Email Address**
  4. **WhatsApp Number** (must include country code / at least 7 digits; WhatsApp is required for Support Widget tickets).
  Ask cleanly for whichever of these items are still missing (you can ask for Name, Email, WhatsApp, and Issue summary in one friendly message).
- **Submitting**: Once all 4 items are collected, immediately call \`escalate_to_human_secretariat\` with clean, structured arguments, and then confirm warmly to the visitor that their ticket has been sent to the Council Secretariat Admin Panel and provide their Ticket ID!`;
}

async function generateWithRetry(
  ai: GoogleGenAI,
  contents: Content[],
  systemInstruction: string,
  preferredModel?: string
): Promise<{ response: GenerateContentResponse; modelUsed: string }> {
  const tools = [
    {
      functionDeclarations: [escalateToHumanDeclaration, checkApplicationStatusDeclaration]
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
}) {
  const cleanSessionId = params.sessionId.trim().slice(0, 100);
  const cleanMessage = params.message.trim().slice(0, 2000);
  if (!cleanSessionId || !cleanMessage) {
    throw new Error('Session ID and message are required.');
  }

  const ai = getGeminiClient();
  const systemInstruction = buildWebsiteKnowledgePrompt();

  // Load 7-day persisted conversation memory for this visitor session
  const existingConv = db.getSupportConversationBySession(cleanSessionId);
  const historyMessages = (existingConv?.messages || [])
    .filter(m => m.text && m.text.trim())
    .slice(-24);

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
  let collectedName: string | undefined;
  let collectedEmail: string | undefined;
  let collectedWhatsapp: string | undefined;

  // Handle up to 2 function call rounds (e.g., status check +/or escalation)
  const workingContents: Content[] = [...contents];
  for (let step = 0; step < 2; step++) {
    const fnCalls = response.functionCalls;
    const modelContent = response.candidates?.[0]?.content;
    if (!fnCalls || fnCalls.length === 0 || !modelContent) {
      break;
    }

    workingContents.push(modelContent);
    const fnResponseParts: any[] = [];

    for (const call of fnCalls) {
      const args = (call.args || {}) as Record<string, any>;

      if (call.name === 'check_application_status') {
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
                  'Missing or invalid contact/issue fields. Politely ask the visitor for their full name, valid email address, valid WhatsApp number (with country code, at least 7 digits), and complete issue details before submitting.'
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

  const replyText =
    (response.text || '').trim() ||
    (escalatedTicket
      ? `Your support request has been forwarded to our Secretariat team (Ticket ID: ${escalatedTicket.id}). Our coordinators will reach out via email or WhatsApp shortly.`
      : 'I apologize, I could not generate a response right now. Please try rephrasing or use the Human Ticket tab to reach our Secretariat directly.');

  const savedConversation = db.appendSupportExchange({
    sessionId: cleanSessionId,
    userText: cleanMessage,
    assistantText: replyText,
    visitorName: collectedName,
    visitorEmail: collectedEmail,
    visitorWhatsapp: collectedWhatsapp,
    escalatedToHuman: Boolean(escalatedTicket),
    linkedContactId: escalatedTicket?.id
  });

  return {
    ok: true,
    model: activeModelUsed,
    reply: replyText,
    conversationId: savedConversation.id,
    expiresAt: savedConversation.expiresAt,
    escalatedTicket: escalatedTicket
      ? {
          id: escalatedTicket.id,
          subject: escalatedTicket.subject,
          name: escalatedTicket.name
        }
      : null,
    messages: savedConversation.messages
  };
}
