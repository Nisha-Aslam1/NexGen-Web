import { AppointmentType } from '../types.ts';

export interface AppointmentBodyInput {
  appointeeName: string;
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
}

export interface AppointmentSectionContent {
  declaration: string;
  responsibilitiesIntro: string;
  responsibilitiesList: string[];
  codeOfConduct: string;
  confidentiality: string;
  terms: string;
  recognition: string;
}

function formatReadableDate(raw?: string): string {
  if (!raw || !raw.trim()) return 'the effective date stated above';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function buildAppointmentLetterContent(input: AppointmentBodyInput): AppointmentSectionContent {
  const name = input.appointeeName?.trim() || 'Appointee';
  const designation = input.designation?.trim() || 'Council Member';
  const department = input.department?.trim() || 'General Operations';
  const chapter = input.chapter?.trim() || 'National Secretariat';
  const type = input.appointmentType || 'Volunteer';
  const effectiveStr = formatReadableDate(input.effectiveDate);
  const expiryStr = input.expiryDate ? formatReadableDate(input.expiryDate) : '';
  const tenure = input.tenure?.trim() || '12 Months (Renewable)';
  const reporting = input.reportingAuthority?.trim() || 'Director of Operations & Council Secretariat';
  const renewal = input.renewalEligibility?.trim() || 'Eligible upon satisfactory performance review';

  let roleClause =
    'champion grassroots empowerment, youth civic engagement, and community service initiatives';
  let responsibilitiesIntro = `In your capacity as ${designation} within the ${department} division (${chapter}), you are entrusted with executing core operational mandates with diligence and civic purpose:`;
  let responsibilitiesList: string[] = [];

  if (type === 'Executive' || type === 'Leadership') {
    roleClause =
      'provide strategic institutional leadership, uphold governance standards, and guide regional empowerment programs';
    responsibilitiesIntro = `As ${designation} overseeing ${department} (${chapter}), you are authorized to exercise strategic oversight and represent the Council Secretariat across institutional engagements:`;
    responsibilitiesList = [
      `Lead strategic planning, policy alignment, and cross-departmental execution within ${department}.`,
      `Mentor emerging coordinators, review chapter progress reports, and maintain high governance standards across ${chapter}.`,
      `Represent NexGen Council in formal dialogues, educational partnerships, and community leadership forums.`,
      `Submit periodic executive briefings and outcome evaluations directly to ${reporting}.`
    ];
  } else if (type === 'Coordinator' || type === 'Management') {
    roleClause =
      'coordinate operational teams, manage field execution, and ensure timely program milestones';
    responsibilitiesIntro = `In your appointed capacity as ${designation} for ${department} (${chapter}), you will manage team workflows and deliver measurable community outcomes:`;
    responsibilitiesList = [
      `Coordinate volunteer deployments, training schedules, and field logistics for ${department} initiatives in ${chapter}.`,
      `Monitor attendance, operational readiness, and participant feedback across workshops and community campaigns.`,
      `Collaborate with Secretariat leadership to document impact metrics and resolve chapter-level operational needs.`,
      `Provide structured bi-weekly activity updates and milestone summaries to ${reporting}.`
    ];
  } else if (type === 'Ambassador') {
    roleClause =
      'serve as an official institutional representative advancing NexGen Council advocacy and youth outreach';
    responsibilitiesIntro = `As an appointed ${designation} representing ${department} across ${chapter}, your mandate centers on advocacy, outreach, and public engagement:`;
    responsibilitiesList = [
      `Represent NexGen Women Empowerment & Youth Leadership Council across campuses, civic bodies, and community networks in ${chapter}.`,
      `Promote upcoming leadership cohorts, women empowerment drives, and youth civic programs in alignment with Council messaging.`,
      `Cultivate local institutional partnerships and mobilize qualified youth and women candidates for Council initiatives.`,
      `Report outreach impact, public engagements, and partnership leads regularly to ${reporting}.`
    ];
  } else {
    responsibilitiesIntro = `As ${designation} within ${department} (${chapter}), you will actively support Council initiatives and grassroots community programs:`;
    responsibilitiesList = [
      `Participate actively in assigned ${department} activities, community outreach clinics, and training workshops within ${chapter}.`,
      `Collaborate respectfully with fellow volunteers, coordinators, and mentors to deliver inclusive community impact.`,
      `Uphold punctuality, task accountability, and constructive participation across all scheduled Council engagements.`,
      `Coordinate operational check-ins and activity logs with ${reporting}.`
    ];
  }

  const declaration = `On behalf of the Executive Board and Council Secretariat of NexGen Women Empowerment & Youth Leadership Council, it is with great pleasure that we formally confirm your appointment as ${designation} (${input.membershipTier || 'Council Member'}) in the ${department} division for ${chapter}, effective ${effectiveStr}. You have been selected to ${roleClause} in accordance with the mission and institutional charter of the Council.`;

  const codeOfConduct = `Throughout your tenure, you are required to uphold the highest standards of ethical conduct, professionalism, discipline, mutual respect, and personal accountability. You shall treat every colleague, beneficiary, community partner, and member of the public with dignity while advancing safe, inclusive, and non-discriminatory civic spaces.`;

  const confidentiality = `As an appointed representative of NexGen Council, you agree to safeguard internal records, member information, strategic documents, and unpublished initiatives. Official public statements, external institutional commitments, or media representations on behalf of the Council may only be issued following written clearance from the Council Secretariat or ${reporting}.`;

  const validityPhrase = expiryStr
    ? `This appointment covers a term of ${tenure} (valid through ${expiryStr}).`
    : `This appointment covers a term of ${tenure}.`;

  const customTermText = input.customNotes?.trim()
    ? ` Special Terms & Stipulations: ${input.customNotes.trim()}`
    : '';

  const terms = `${validityPhrase} You will report directly to ${reporting}. ${renewal}. Performance, active participation, and adherence to Council bylaws remain essential conditions of continued standing.${customTermText}`;

  const recognition = `NexGen Council deeply values your dedication, leadership potential, and commitment to empowering women and inspiring emerging youth leaders. We warmly welcome you into our official leadership and service network and wish you a distinguished and impactful tenure.`;

  return {
    declaration,
    responsibilitiesIntro,
    responsibilitiesList,
    codeOfConduct,
    confidentiality,
    terms,
    recognition
  };
}
