export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'CONTENT_MANAGER' | 'VOLUNTEER_MANAGER' | 'VIEWER' | 'Super Admin' | 'Volunteer Manager' | 'Editor';

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  createdAt: string;
}

export type AdminUser = User;

export type ApplicationStatus = 'Pending' | 'Under Review' | 'Approved' | 'Rejected';

export interface VolunteerApplication {
  id: string;
  referenceCode: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  gender?: string;
  city: string;
  address?: string;
  
  educationLevel?: string;
  profession?: string;
  skills: string[];
  previousVolunteerExperience?: string;
  
  whyJoin: string;
  interestAreas: string[];
  availableDays: string[];
  availableHours?: string;
  preferredRole?: string;
  previousOrganization?: string;
  
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  additionalMessage?: string;
  agreedToTerms: boolean;
  confirmedAccurate: boolean;
  
  status: ApplicationStatus;
  internalNotes?: string;
  reviewNotes?: string;
  reviewerName?: string;
  reviewedAt?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Volunteer {
  id: string;
  applicationId?: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  skills: string[];
  assignedRole: string;
  assignedProgram?: string;
  hoursLogged?: number;
  hoursContributed?: number;
  joinedDate: string;
  status: 'Active' | 'On Leave' | 'Alumni';
  emergencyContact?: string;
}

export interface Program {
  id: string;
  title: string;
  slug: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  coverImage: string;
  startDate?: string;
  endDate?: string;
  featured: boolean;
  status: 'Published' | 'Draft' | 'Archived';
  targetAudience?: string;
  curriculumHighlights?: string[];
  createdAt: string;
}

export interface EventItem {
  id: string;
  title: string;
  slug?: string;
  category: string;
  description: string;
  image: string;
  coverImage?: string;
  date: string;
  time: string;
  location: string;
  isVirtual?: boolean;
  registrationUrl?: string;
  status: 'Upcoming' | 'Past' | 'Draft';
  capacity?: number;
  registeredCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  slug: string;
  category: string;
  author: string;
  authorRole?: string;
  coverImage: string;
  summary: string;
  content: string;
  publishedAt: string;
  status: 'Published' | 'Draft';
  featured: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  position: string;
  department: string;
  bio: string;
  image: string;
  displayOrder: number;
  active: boolean;
  linkedinUrl?: string;
  twitterUrl?: string;
  email?: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  category: string;
  imageUrl: string;
  date: string;
  displayOrder: number;
  caption?: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: 'Unread' | 'Read' | 'Replied';
  createdAt: string;
}

export interface WebsiteSettings {
  organizationName: string;
  tagline: string;
  heroHeading: string;
  heroSubheading: string;
  heroTitle?: string;
  heroSubtitle?: string;
  missionStatement: string;
  visionStatement: string;
  coreValues: { title: string; description: string }[];
  historyStatement: string;
  stats: {
    volunteersCount?: string;
    beneficiariesCount?: string;
    programsCount?: string;
    communitiesCount?: string;
    volunteersTrained?: number;
    communitiesReached?: number;
    programsActive?: number;
    partnerInstitutions?: number;
  };
  contactEmail: string;
  contactPhone: string;
  officeAddress: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    twitter?: string;
    youtube?: string;
  };
  announcementBanner?: {
    enabled: boolean;
    text: string;
    linkUrl?: string;
    linkText?: string;
  };
  announcementBannerEnabled?: boolean;
  announcementBannerText?: string;
  // Footer Customizations
  footerHeading?: string;
  footerSubheading?: string;
  footerVolunteerButtonText?: string;
  footerContactButtonText?: string;
  footerSubTitle?: string;
  footerDescription?: string;
  footerOfficeHours?: string;
  registrationNumber?: string;
  footerCopyrightText?: string;
  footerBadgeText?: string;
  // Contact & Legal Visibility On/Off Toggles
  showOfficeAddress?: boolean;
  showContactEmail?: boolean;
  showContactPhone?: boolean;
  showOfficeHours?: boolean;
  showRegistrationNumber?: boolean;
  // SEO & Verification
  siteUrl?: string;
  metaDescription?: string;
  googleSiteVerification?: string;
  googleAnalyticsId?: string;
}

export type SiteSettings = WebsiteSettings;

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: string;
  timestamp: string;
  ipAddress?: string;
}

export interface DashboardStats {
  totalVolunteers: number;
  totalApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  rejectedApplications: number;
  newApplicationsToday: number;
  totalPrograms: number;
  totalEvents: number;
  totalNewsPosts: number;
  totalInquiries: number;
  unreadInquiries: number;
  recentActivity: ActivityLog[];
  monthlyApplications: { month: string; count: number }[];
  interestDistribution: { name: string; count: number }[];
}

// ----------------------------------------------------
// LIVEKIT VIDEO MEETINGS DATA MODELS
// ----------------------------------------------------

export type MeetingStatus = 'Scheduled' | 'Active' | 'Ended' | 'Cancelled';
export type ParticipantRole = 'host' | 'co-host' | 'participant';
export type AdmissionStatus = 'waiting' | 'admitted' | 'rejected';
export type ConnectionStatus = 'connected' | 'disconnected' | 'waiting';

export interface Meeting {
  id: string;
  meetingCode: string;
  roomName: string;
  title: string;
  description?: string;
  hostId: string;
  hostName: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  status: MeetingStatus;
  passwordHash?: string;
  hasPassword?: boolean;
  waitingRoomEnabled: boolean;
  screenShareEnabled: boolean;
  maxParticipants: number;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingParticipant {
  id: string;
  meetingId: string;
  userId?: string;
  displayName: string;
  role: ParticipantRole;
  joinedAt?: string;
  leftAt?: string;
  admissionStatus: AdmissionStatus;
  connectionStatus: ConnectionStatus;
  identity?: string;
}

export interface MeetingMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  message: string;
  createdAt: string;
}

export interface MeetingAttendance {
  id: string;
  meetingId: string;
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  joinedAt: string;
  leftAt?: string;
  durationSeconds?: number;
}

