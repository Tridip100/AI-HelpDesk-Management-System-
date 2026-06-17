export const STATUS_LABELS = {
  open: "Open",
  ai_pending: "AI Pending",
  auto_solved: "Resolved",
  reviewing: "Reviewing",
  assigned: "Assigned",
  escalated: "Escalated",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

export const PRIORITY_LABELS = {
  P1: "Critical",
  P2: "High",
  P3: "Medium",
  P4: "Low",
};

export const CATEGORY_LABELS = {
  network: "Network",
  auth: "Account Access",
  hardware: "Hardware",
  database: "Database",
  cloud_app: "Cloud App",
  software: "Software",
  security: "Security",
  hr_it: "HR IT",
  other: "Other",
};

export const statusClass = {
  open: "bg-blue-100 text-blue-700",
  ai_pending: "bg-yellow-100 text-yellow-700",
  auto_solved: "bg-emerald-100 text-emerald-700",
  reviewing: "bg-sky-100 text-sky-700",
  assigned: "bg-purple-100 text-purple-700",
  escalated: "bg-red-100 text-red-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
  reopened: "bg-orange-100 text-orange-700",
};

export const priorityClass = {
  P1: "bg-red-100 text-red-700",
  P2: "bg-orange-100 text-orange-700",
  P3: "bg-blue-100 text-blue-700",
  P4: "bg-slate-100 text-slate-600",
};

export const roleClass = {
  user: "bg-blue-100 text-blue-700",
  helpdesk: "bg-purple-100 text-purple-700",
  engineer: "bg-emerald-100 text-emerald-700",
  admin: "bg-orange-100 text-orange-700",
};

export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function labelStatus(status) {
  return STATUS_LABELS[status] || titleCase(status);
}

export function labelPriority(priority) {
  return PRIORITY_LABELS[priority] || priority || "Medium";
}

export function labelCategory(category) {
  return CATEGORY_LABELS[category] || titleCase(category || "other");
}

export function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function shortId(id, index = 1) {
  if (!id) return `TKT-${String(index).padStart(3, "0")}`;
  return `TKT-${String(index).padStart(3, "0")}`;
}

export function formatDate(value) {
  if (!value) return "10/06/2026";
  return new Date(value).toLocaleDateString("en-GB");
}

export function formatDateTime(value) {
  if (!value) return "08/06/2026, 11:00:00";
  return new Date(value).toLocaleString("en-GB");
}

export function userName(user, fallback = "User") {
  return user?.full_name || user?.username || fallback;
}

export function initials(name = "HD") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "HD";
}

export function Badge({ children, className = "" }) {
  return (
    <span className={cx("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

export const sampleTickets = [
  {
    id: "demo-001",
    title: "Laptop not booting after update",
    description: "My laptop stopped booting after the Windows update last night. Getting a blue screen error.",
    channel: "chat",
    category: "hardware",
    priority: "P2",
    status: "resolved",
    created_by: "Priya Sharma",
    assigned_to: "Arjun Patel",
    created_at: "2026-06-10T10:00:00",
  },
  {
    id: "demo-002",
    title: "Cannot access VPN from home",
    description: "VPN client fails to connect from my home network.",
    channel: "chat",
    category: "network",
    priority: "P2",
    status: "in_progress",
    created_by: "Rahul Verma",
    assigned_to: "Vikram Singh",
    created_at: "2026-06-13T09:30:00",
  },
  {
    id: "demo-003",
    title: "Outlook not syncing emails",
    description: "Email has not synced since yesterday afternoon.",
    channel: "email",
    category: "cloud_app",
    priority: "P3",
    status: "open",
    created_by: "Ananya Gupta",
    assigned_to: null,
    created_at: "2026-06-14T13:15:00",
  },
  {
    id: "demo-004",
    title: "Password reset request",
    description: "Forgot my account password and locked out.",
    channel: "email",
    category: "auth",
    priority: "P3",
    status: "resolved",
    created_by: "Priya Sharma",
    assigned_to: "Deepa Krishnan",
    created_at: "2026-06-08T11:00:00",
  },
  {
    id: "demo-005",
    title: "Printer not detected on network",
    description: "The office printer is not visible on Wi-Fi.",
    channel: "web",
    category: "other",
    priority: "P4",
    status: "open",
    created_by: "Rahul Verma",
    assigned_to: null,
    created_at: "2026-06-15T08:15:00",
  },
  {
    id: "demo-006",
    title: "Software license expired",
    description: "Design application says the license has expired.",
    channel: "web",
    category: "software",
    priority: "P1",
    status: "closed",
    created_by: "Ananya Gupta",
    assigned_to: "Deepa Krishnan",
    created_at: "2026-06-05T14:10:00",
  },
  {
    id: "demo-007",
    title: "Slow internet in conference room B",
    description: "Internet speed in conference room B has been extremely slow for a week.",
    channel: "chat",
    category: "network",
    priority: "P3",
    status: "in_progress",
    created_by: "Priya Sharma",
    assigned_to: "Vikram Singh",
    created_at: "2026-06-12T16:20:00",
  },
  {
    id: "demo-008",
    title: "Cannot login to HR portal",
    description: "My HR portal login fails after entering the OTP.",
    channel: "web",
    category: "auth",
    priority: "P2",
    status: "reopened",
    created_by: "Rahul Verma",
    assigned_to: "Deepa Krishnan",
    created_at: "2026-06-11T11:10:00",
  },
];

export const sampleUsers = [
  { id: "u1", full_name: "Priya Sharma", username: "priya", email: "priya@company.com", role: "user", department: "Marketing", created_at: "2024-01-15" },
  { id: "u2", full_name: "Rahul Verma", username: "rahul", email: "rahul@company.com", role: "user", department: "Finance", created_at: "2024-02-20" },
  { id: "u3", full_name: "Ananya Gupta", username: "ananya", email: "ananya@company.com", role: "user", department: "Sales", created_at: "2024-03-05" },
  { id: "u4", full_name: "Kiran Reddy", username: "kiran", email: "kiran@helpdesk.com", role: "helpdesk", department: "Support", created_at: "2023-08-10" },
  { id: "u5", full_name: "Meera Nair", username: "meera", email: "meera@helpdesk.com", role: "helpdesk", department: "Support", created_at: "2023-09-01" },
  { id: "u6", full_name: "Arjun Patel", username: "arjun", email: "arjun@eng.com", role: "engineer", department: "Infrastructure", created_at: "2023-06-15" },
  { id: "u7", full_name: "Deepa Krishnan", username: "deepa", email: "deepa@eng.com", role: "engineer", department: "Software", created_at: "2023-07-20" },
  { id: "u8", full_name: "Vikram Singh", username: "vikram", email: "vikram@eng.com", role: "engineer", department: "Network", created_at: "2023-05-01" },
  { id: "u9", full_name: "Suresh Kumar", username: "admin", email: "admin@company.com", role: "admin", department: "Management", created_at: "2023-01-01" },
];

export const engineers = sampleUsers.filter((u) => u.role === "engineer");
