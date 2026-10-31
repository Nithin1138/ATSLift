"use client";

import React, { useState, useEffect, useDeferredValue, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { 
  Database, 
  Sparkles, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  Copy, 
  Check, 
  Loader2, 
  User, 
  GraduationCap, 
  Briefcase, 
  Code, 
  Award, 
  ArrowLeft, 
  Bot, 
  Send,
  Building2,
  FileText,
  Eye,
  Search,
  PlusCircle,
  Globe,
  ExternalLink,
  Clock,
  Tag,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  Layers,
  Menu,
  Pin
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/DashboardActions";
import HeaderWalletBadge from "@/components/HeaderWalletBadge";
import AppLayout from "@/components/AppLayout";
import { TelegramLinkCard } from "@/components/TelegramLinkCard";
import { formatEducationScore } from "@/components/ResumePreviewPanel";

interface ProjectItem {
  id: string;
  title: string;
  description: string;
  techStack: string;
  githubLink?: string;
  hostLink?: string;
}

interface ExperienceItem {
  id: string;
  role: string;
  company: string;
  duration: string;
  description: string;
}

interface CustomFieldItem {
  id: string;
  key: string;
  value: string;
  link?: string;
}

interface EducationItem {
  id: string;
  type: string; // "10th", "12th", "UG", "PG"
  institution: string;
  degree?: string;
  branch?: string;
  cgpaOrPercentage: string;
  graduationYear: string;
  location?: string;
}

interface CodingProfileItem {
  id: string;
  platform: string; // LeetCode, Codeforces, etc.
  username: string;
  url: string;
  rating?: string;
  solvedCount?: string;
}

export default function MySpaceClient({ userEmail }: { userEmail: string }) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"profile" | "copilot">(
    tabParam === "copilot" ? "copilot" : "profile"
  );

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "copilot") {
      setActiveTab("copilot");
    } else if (t === "profile") {
      setActiveTab("profile");
    }
  }, [searchParams]);
  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isNavCollapsed, setIsNavCollapsed] = useState<boolean>(false);

  // Profile Form States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [collegeEmail, setCollegeEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [github, setGithub] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");

  const [leetcode, setLeetcode] = useState("");
  const [codeforces, setCodeforces] = useState("");
  const [codechef, setCodechef] = useState("");
  const [hackerrank, setHackerrank] = useState("");
  const [gfg, setGfg] = useState("");
  const [codingProfiles, setCodingProfiles] = useState<CodingProfileItem[]>([]);

  const [college, setCollege] = useState("");
  const [branch, setBranch] = useState("");
  const [cgpa, setCgpa] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [activeBacklogs, setActiveBacklogs] = useState("0");
  const [backlogHistory, setBacklogHistory] = useState("0");
  const [academicGapYears, setAcademicGapYears] = useState("0");
  const [educationList, setEducationList] = useState<EducationItem[]>([]);
  const [summary, setSummary] = useState("");
  
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState("");

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [experiences, setExperiences] = useState<ExperienceItem[]>([]);
  const [certifications, setCertifications] = useState<{ name: string; year?: string }[]>([]);
  const [newCertInput, setNewCertInput] = useState("");
  const [newCertYearInput, setNewCertYearInput] = useState("");
  const [achievements, setAchievements] = useState<string[]>([]);
  const [newAchievementInput, setNewAchievementInput] = useState("");
  
  const [customFields, setCustomFields] = useState<CustomFieldItem[]>([]);
  const [newCustomKey, setNewCustomKey] = useState("Target Role 1");
  const [newCustomVal, setNewCustomVal] = useState("");
  const [customKeySelection, setCustomKeySelection] = useState("Target Role 1");
  const [newCustomLink, setNewCustomLink] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [pinnedSections, setPinnedSections] = useState<string[]>([]);

  // Profile Photos & Custom Card Errors State
  const [profileImages, setProfileImages] = useState<string[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [codingCustomError, setCodingCustomError] = useState<string | null>(null);

  // AI Copilot State
  const [companyName, setCompanyName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [question, setQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);

  useEffect(() => {
    fetchProfile();

    const handleProfileUpdate = () => {
      fetchProfile();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("masterProfileUpdated", handleProfileUpdate);
      window.addEventListener("storage", handleProfileUpdate);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("masterProfileUpdated", handleProfileUpdate);
        window.removeEventListener("storage", handleProfileUpdate);
      }
    };
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/user/my-space");
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      
      if (data && data.profile) {
        const p = data.profile;
        setFullName(p.fullName || data.userName || "");
        setEmail(p.email || data.userEmail || "");
        setCollegeEmail(p.collegeEmail || "");
        setDateOfBirth(p.dateOfBirth || "");
        setPhone(p.phone || "");
        setLocation(p.location || "");
        setRegistrationNumber(p.registrationNumber || "");
        setGithub(p.github || "");
        setLinkedin(p.linkedin || "");
        setPortfolio(p.portfolio || "");
        setNoticePeriod(p.noticePeriod || "Immediate / 15 Days");

        setLeetcode(p.leetcode || "");
        setCodeforces(p.codeforces || "");
        setCodechef(p.codechef || "");
        setHackerrank(p.hackerrank || "");
        setGfg(p.gfg || "");

        // Load Coding Profiles - 3 Famous Platforms default (LeetCode, CodeChef, Codeforces)
        let parsedCoding: CodingProfileItem[] = [];
        try {
          const parsed = JSON.parse(p.codingProfilesJson || "[]");
          if (Array.isArray(parsed)) {
            parsedCoding = parsed;
          }
        } catch {}

        const standardPlatforms = ["LeetCode", "CodeChef", "Codeforces"];
        const loadedCoding: CodingProfileItem[] = [];
        
        standardPlatforms.forEach(plat => {
          const existing = parsedCoding.find(item => item.platform === plat);
          if (existing) {
            loadedCoding.push(existing);
          } else {
            let legacyUser = "";
            let legacyUrl = "";
            if (plat === "LeetCode" && p.leetcode) { legacyUser = p.leetcode; legacyUrl = p.leetcode.includes("leetcode.com") ? p.leetcode : `https://leetcode.com/u/${p.leetcode}`; }
            else if (plat === "Codeforces" && p.codeforces) { legacyUser = p.codeforces; legacyUrl = p.codeforces.includes("codeforces.com") ? p.codeforces : `https://codeforces.com/profile/${p.codeforces}`; }
            else if (plat === "CodeChef" && p.codechef) { legacyUser = p.codechef; legacyUrl = p.codechef.includes("codechef.com") ? p.codechef : `https://codechef.com/users/${p.codechef}`; }
            
            loadedCoding.push({
              id: plat.toLowerCase(),
              platform: plat,
              username: legacyUser,
              url: legacyUrl,
              rating: "",
              solvedCount: ""
            });
          }
        });

        // Preserve non-standard custom profiles from DB
        parsedCoding.forEach(item => {
          if (!standardPlatforms.includes(item.platform) && !loadedCoding.some(l => l.id === item.id)) {
            loadedCoding.push(item);
          }
        });
        setCodingProfiles(loadedCoding);

        setCollege(p.college || "");
        setBranch(p.branch || "");
        setCgpa(p.cgpa || "");
        setGraduationYear(p.graduationYear || "");
        setActiveBacklogs(p.activeBacklogs ?? "0");
        setBacklogHistory(p.backlogHistory ?? "0");
        setAcademicGapYears(p.academicGapYears ?? "0");
        setSummary(p.summary || "");
        setCustomNotes(p.customNotes || "");

        // Load Education List - 4 Standard Levels (UG, 12th, 10th, PG)
        let parsedEdu: EducationItem[] = [];
        try {
          const parsed = JSON.parse(p.educationJson || "[]");
          if (Array.isArray(parsed)) {
            parsedEdu = parsed;
          }
        } catch {}

        const standardEduTypes = ["UG", "12th", "10th", "PG"];
        const finalEdu: EducationItem[] = [];

        standardEduTypes.forEach(t => {
          const existing = parsedEdu.find(e => e.type === t);
          if (existing) {
            finalEdu.push(existing);
          } else {
            finalEdu.push({
              id: t.toLowerCase(),
              type: t,
              institution: t === "UG" ? (p.college || "") : "",
              degree: t === "10th" ? "Secondary School (10th)" : t === "12th" ? "Higher Secondary (12th)" : t === "UG" ? "B.Tech / Bachelor's" : "Master's Degree",
              branch: t === "UG" ? (p.branch || "") : "",
              cgpaOrPercentage: t === "UG" ? (p.cgpa || "") : "",
              graduationYear: t === "UG" ? (p.graduationYear || "") : "",
              location: ""
            });
          }
        });

        // Include any custom education items
        parsedEdu.forEach(e => {
          if (!standardEduTypes.includes(e.type) && !finalEdu.some(f => f.id === e.id)) {
            finalEdu.push(e);
          }
        });
        setEducationList(finalEdu);

        // Load Profile Photos & Active Index
        try {
          const imgs = JSON.parse(p.profileImagesJson || "[]");
          if (Array.isArray(imgs)) setProfileImages(imgs);
        } catch {}
        if (typeof p.activeImageIndex === "number") {
          setActiveImageIndex(p.activeImageIndex);
        }

        try {
          const s = JSON.parse(p.skillsJson || "[]");
          if (Array.isArray(s)) {
            setSkills(s);
          } else if (s && typeof s === "object") {
            const extracted: string[] = [];
            if (s.categories && typeof s.categories === "object") {
              Object.values(s.categories).forEach((val: any) => {
                if (Array.isArray(val)) extracted.push(...val);
                else if (typeof val === "string") extracted.push(...val.split(",").map((v: string) => v.trim()));
              });
            }
            if (s.softSkills && typeof s.softSkills === "string") {
              extracted.push(...s.softSkills.split(",").map((v: string) => v.trim()));
            }
            setSkills(extracted.filter(Boolean));
          } else {
            setSkills([]);
          }
        } catch {
          setSkills([]);
        }

        try {
          const pr = JSON.parse(p.projectsJson || "[]");
          setProjects(Array.isArray(pr) ? pr : []);
        } catch {
          setProjects([]);
        }

        try {
          const ex = JSON.parse(p.experiencesJson || "[]");
          setExperiences(Array.isArray(ex) ? ex : []);
        } catch {
          setExperiences([]);
        }

        try {
          const cr = JSON.parse(p.certificationsJson || "[]");
          let parsedCerts: { name: string; year?: string }[] = [];
          if (Array.isArray(cr)) {
            parsedCerts = cr.map((item: any) => {
              if (typeof item === "string") return { name: item, year: "" };
              return { name: item.name || "", year: item.year || "" };
            });
          } else if (typeof cr === "string") {
            parsedCerts = cr.split(",").map((c: string) => ({ name: c.trim(), year: "" })).filter(c => c.name);
          }
          setCertifications(parsedCerts);
        } catch {
          setCertifications([]);
        }

        try {
          const ac = JSON.parse(p.achievementsJson || "[]");
          if (Array.isArray(ac)) {
            setAchievements(ac);
          } else if (typeof ac === "string") {
            setAchievements(ac.split("\n").map((a: string) => a.trim()).filter(Boolean));
          } else {
            setAchievements([]);
          }
        } catch {
          setAchievements([]);
        }
        
        try {
          const parsedCF = JSON.parse(p.customFieldsJson || "[]");
          if (Array.isArray(parsedCF)) {
            setCustomFields(parsedCF.map((item: any, idx: number) => ({
              id: item.id || idx.toString(),
              key: item.key || item.name || "Custom Detail",
              value: item.value || item.val || "",
              ...(item.link ? { link: item.link } : {})
            })));
          } else {
            setCustomFields([]);
          }
        } catch {
          setCustomFields([]);
        }

        try {
          const pinned = JSON.parse(p.pinnedSectionsJson || "[]");
          setPinnedSections(Array.isArray(pinned) ? pinned : []);
        } catch {
          setPinnedSections([]);
        }
      } else {
        setFullName(data.userName || "");
      }
    } catch (e) {
      console.error("Failed to load profile:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/user/my-space", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          collegeEmail,
          dateOfBirth,
          phone,
          location,
          registrationNumber,
          github,
          linkedin,
          portfolio,
          noticePeriod,
          leetcode,
          codeforces,
          codechef,
          hackerrank,
          gfg,
          codingProfilesJson: JSON.stringify(codingProfiles),
          college,
          branch,
          cgpa,
          graduationYear,
          activeBacklogs,
          backlogHistory,
          academicGapYears,
          educationJson: JSON.stringify(educationList),
          summary,
          skillsJson: JSON.stringify(skills),
          projectsJson: JSON.stringify(projects),
          experiencesJson: JSON.stringify(experiences),
          certificationsJson: JSON.stringify(certifications),
          achievementsJson: JSON.stringify(achievements),
          customFieldsJson: JSON.stringify(customFields),
          pinnedSectionsJson: JSON.stringify(pinnedSections),
          profileImagesJson: JSON.stringify(profileImages),
          activeImageIndex,
          customNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save profile");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("masterProfileUpdated", { detail: data.profile }));
        localStorage.setItem("masterProfileLastUpdated", Date.now().toString());
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, keyName: string) => {
    if (!text || typeof window === "undefined") return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCopyFullVault = () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) return;
    const lines = [
      `=========================================`,
      `CANDIDATE MASTER PROFILE VAULT`,
      `=========================================`,
      fullName ? `Name: ${fullName}` : null,
      email ? `Email: ${email}` : null,
      collegeEmail ? `College Email: ${collegeEmail}` : null,
      dateOfBirth ? `Date of Birth: ${dateOfBirth}` : null,
      phone ? `Phone: ${phone}` : null,
      location ? `Location: ${location}` : null,
      github ? `GitHub: ${github}` : null,
      linkedin ? `LinkedIn: ${linkedin}` : null,
      noticePeriod ? `Notice Period: ${noticePeriod}` : null,
      ``,
      codingProfiles.length > 0 ? `--- CODING & PROBLEM-SOLVING PROFILES ---` : null,
      ...codingProfiles.map(p => {
        if (!p.username) return null;
        return `${p.platform}: ${p.username} | Link: ${p.url || "N/A"} | Rating/Rank: ${p.rating || "N/A"} | Solved: ${p.solvedCount || "N/A"}`;
      }),
      ``,
      educationList.length > 0 ? `--- ACADEMICS & EDUCATION ---` : null,
      ...educationList.map(e => {
        if (!e.institution) return null;
        return `[${e.type}] ${e.institution} - ${e.degree || "N/A"} (${e.branch || "N/A"}) | ${formatEducationScore(e.cgpaOrPercentage)} | Year: ${e.graduationYear} | Location: ${e.location || "N/A"}`;
      }),
      summary ? `Bio Summary: ${summary}` : null,
      ``,
      skills.length ? `--- SKILLS ---` : null,
      skills.length ? skills.join(", ") : null,
      ``,
      certifications.length ? `--- CERTIFICATIONS ---` : null,
      certifications.length ? certifications.map(c => `- ${c}`).join("\n") : null,
      ``,
      achievements.length ? `--- ACHIEVEMENTS & AWARDS ---` : null,
      achievements.length ? achievements.map(a => `- ${a}`).join("\n") : null,
      ``,
      projects.length ? `--- PROJECTS ---` : null,
      projects.length ? projects.map(p => `- ${p.title} (${p.techStack}) | GitHub: ${p.githubLink || "N/A"} | Live: ${p.hostLink || "N/A"}\n  Description: ${p.description}`).join("\n") : null,
      ``,
      experiences.length ? `--- EXPERIENCE ---` : null,
      experiences.length ? experiences.map(e => `- ${e.company} | ${e.role} (${e.duration}): ${e.description}`).join("\n") : null,
    ].filter(line => line !== null).join("\n");

    navigator.clipboard.writeText(lines);
    setCopiedKey("FULL_VAULT");
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleUpdateCodingProfile = (id: string, field: keyof CodingProfileItem, val: string) => {
    setCodingProfiles(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
  };

  const handleAddCodingProfile = () => {
    // Validation rule: Check if an unfilled custom card already exists
    const hasEmptyCustom = codingProfiles.some(
      p => !["LeetCode", "CodeChef", "Codeforces"].includes(p.platform) && !p.username.trim() && !p.url.trim() && (!p.platform.trim() || p.platform === "Other")
    );

    if (hasEmptyCustom) {
      setCodingCustomError("Please fill out your current custom profile card before adding another.");
      setTimeout(() => setCodingCustomError(null), 4000);
      return;
    }

    setCodingCustomError(null);
    setCodingProfiles(prev => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        platform: "",
        username: "",
        url: "",
        rating: "",
        solvedCount: ""
      }
    ]);
  };

  const handleRemoveCodingProfile = (id: string) => {
    setCodingProfiles(prev => prev.filter(p => p.id !== id));
  };

  const handleAddProfileImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageUploadError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (profileImages.length >= 3) {
      setImageUploadError("Maximum 3 profile photos allowed.");
      return;
    }

    const file = files[0];

    // Enforce 10MB safety limit on file loading to prevent browser memory issues
    if (file.size > 10 * 1024 * 1024) {
      setImageUploadError("File size is too large (exceeds 10MB limit). Please upload a smaller image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 500;
        const MAX_HEIGHT = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.8);
          
          setProfileImages(prev => {
            const next = [...prev, compressedBase64];
            if (next.length === 1) setActiveImageIndex(0);
            return next;
          });
        }
      };
      img.onerror = () => {
        setImageUploadError("Failed to process image file.");
      };
      img.src = uploadEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveProfileImage = (index: number) => {
    setProfileImages(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (activeImageIndex >= next.length) {
        setActiveImageIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleSetActiveImage = (index: number) => {
    setActiveImageIndex(index);
  };

  const handleUpdateEducation = (type: string, field: keyof EducationItem, val: string) => {
    setEducationList(prev => prev.map(e => e.type === type ? { ...e, [field]: val } : e));
  };

  // Skill Handlers
  const handleAddSkill = () => {
    if (newSkillInput.trim() && !skills.includes(newSkillInput.trim())) {
      setSkills([...skills, newSkillInput.trim()]);
      setNewSkillInput("");
    }
  };
  const handleRemoveSkill = (index: number) => {
    setSkills(skills.filter((_, i) => i !== index));
  };

  // Certification Handlers
  const handleAddCert = () => {
    const nameTrimmed = newCertInput.trim();
    if (nameTrimmed && !certifications.some(c => c.name.toLowerCase() === nameTrimmed.toLowerCase())) {
      setCertifications([...certifications, { name: nameTrimmed, year: newCertYearInput.trim() }]);
      setNewCertInput("");
      setNewCertYearInput("");
    }
  };
  const handleRemoveCert = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  // Achievement Handlers
  const handleAddAchievement = () => {
    const trimmed = newAchievementInput.trim();
    if (!trimmed) return;
    if (!achievements.includes(trimmed)) {
      setAchievements(prev => [...prev, trimmed]);
    }
    setNewAchievementInput("");
  };

  const handleRemoveAchievement = (idx: number) => {
    setAchievements(prev => prev.filter((_, i) => i !== idx));
  };

  // Custom Field Handlers
  const handleAddCustomField = () => {
    const key = newCustomKey.trim();
    const value = newCustomVal.trim();
    const link = newCustomLink.trim();
    if (key && value) {
      const exists = customFields.some(cf => cf.key.toLowerCase() === key.toLowerCase());
      if (exists) {
        alert(`A custom field with the name "${key}" already exists. Please use a unique name.`);
        return;
      }
      setCustomFields([
        ...customFields,
        { 
          id: Date.now().toString(), 
          key, 
          value,
          ...(link ? { link } : {})
        },
      ]);
      setNewCustomVal("");
      setNewCustomLink("");
      setCustomKeySelection("Target Role 1");
      setNewCustomKey("Target Role 1");
    }
  };
  const handleRemoveCustomField = (id: string) => {
    setCustomFields(customFields.filter(cf => cf.id !== id));
  };
  const handleUpdateCustomField = (id: string, key: string, value: string) => {
    setCustomFields(customFields.map(cf => cf.id === id ? { ...cf, key, value } : cf));
  };

  const togglePinSection = async (sectionId: string, altSectionId?: string) => {
    const isPinned = pinnedSections.includes(sectionId) || (altSectionId && pinnedSections.includes(altSectionId));
    let updated: string[];

    if (isPinned) {
      // Unpinning
      updated = pinnedSections.filter(id => id !== sectionId && id !== altSectionId && id !== "custom-field-undefined");
    } else {
      // Pinning new card
      const isCustom = sectionId.startsWith("custom-field-") || sectionId === "custom";
      const currentNormal = pinnedSections.filter(id => !id.startsWith("custom-field-") && id !== "custom" && id !== "custom-field-undefined");
      const currentCustom = pinnedSections.filter(id => (id.startsWith("custom-field-") || id === "custom") && id !== "custom-field-undefined");

      if (isCustom) {
        if (currentCustom.length >= 2) {
          alert("You can pin a maximum of 2 custom cards to your dashboard. Please unpin an existing custom card first.");
          return;
        }
        updated = [...pinnedSections.filter(id => id !== "custom-field-undefined"), sectionId];
      } else {
        // Normal section pin: limit to 1 (replace any existing normal section pin)
        updated = [sectionId, ...currentCustom];
      }
    }

    setPinnedSections(updated);

    try {
      await fetch("/api/user/my-space", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          collegeEmail,
          dateOfBirth,
          phone,
          location,
          registrationNumber,
          github,
          linkedin,
          portfolio,
          noticePeriod,
          leetcode,
          codeforces,
          codechef,
          hackerrank,
          gfg,
          codingProfilesJson: JSON.stringify(codingProfiles),
          college,
          branch,
          cgpa,
          graduationYear,
          educationJson: JSON.stringify(educationList),
          summary,
          skillsJson: JSON.stringify(skills),
          projectsJson: JSON.stringify(projects),
          experiencesJson: JSON.stringify(experiences),
          certificationsJson: JSON.stringify(certifications),
          achievementsJson: JSON.stringify(achievements),
          customFieldsJson: JSON.stringify(customFields),
          pinnedSectionsJson: JSON.stringify(updated),
          customNotes,
        }),
      });
    } catch (err) {
      console.error("Failed to save pinned sections:", err);
    }
  };

  const renderPinButton = (sectionId: string, altSectionId?: string) => {
    const isPinned = pinnedSections.includes(sectionId) || (altSectionId && pinnedSections.includes(altSectionId));
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          togglePinSection(sectionId, altSectionId);
        }}
        className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
          isPinned 
            ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20" 
            : "bg-bg-base/30 border-border/40 text-text-muted hover:text-amber-500 hover:border-amber-500/30 hover:bg-amber-500/5"
        }`}
        title={isPinned ? "Unpin from Dashboard" : "Pin to Dashboard"}
      >
        <Pin className={`w-3.5 h-3.5 ${isPinned ? "fill-amber-500" : ""}`} />
      </button>
    );
  };

  // Project Handlers
  const handleAddProject = () => {
    setProjects([
      ...projects,
      { id: Date.now().toString(), title: "New Engineering Project", description: "", techStack: "" },
    ]);
  };
  const handleUpdateProject = (id: string, field: keyof ProjectItem, val: string) => {
    setProjects(projects.map(p => p.id === id ? { ...p, [field]: val } : p));
  };
  const handleRemoveProject = (id: string) => {
    setProjects(projects.filter(p => p.id !== id));
  };

  // Experience Handlers
  const handleAddExperience = () => {
    setExperiences([
      ...experiences,
      { id: Date.now().toString(), role: "Software Intern", company: "Company Name", duration: "3 Months", description: "" },
    ]);
  };
  const handleUpdateExperience = (id: string, field: keyof ExperienceItem, val: string) => {
    setExperiences(experiences.map(e => e.id === id ? { ...e, [field]: val } : e));
  };
  const handleRemoveExperience = (id: string) => {
    setExperiences(experiences.filter(e => e.id !== id));
  };

  // AI Generation
  const handleAskAi = async (qPrompt?: string) => {
    const query = qPrompt || question;
    if (!query.trim()) return;

    setIsGenerating(true);
    setAiAnswer("");

    try {
      const res = await fetch("/api/user/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          companyName,
          jobRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate answer");
      setAiAnswer(data.answer);
    } catch (err: any) {
      setAiAnswer(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const matchesSearch = useCallback((text: string) => {
    if (!deferredSearchQuery.trim()) return true;
    return text.toLowerCase().includes(deferredSearchQuery.toLowerCase());
  }, [deferredSearchQuery]);

  const presetQuestions = [
    "Why do you want to join our engineering team?",
    "Describe a challenging technical project you built and how you solved it.",
    "What are your top technical strengths and key accomplishments?",
    "How do your academic projects prepare you for this full-time role?",
  ];

  const calculateVaultCompletion = () => {
    let completed = 0;
    const total = 8;
    if (fullName && (email || phone || collegeEmail)) completed++;
    if (codingProfiles.some(p => p.username && p.platform)) completed++;
    if (educationList.some(e => e.institution)) completed++;
    if (skills.length > 0) completed++;
    if (certifications.length > 0) completed++;
    if (achievements.length > 0) completed++;
    if (projects.length > 0) completed++;
    if (experiences.length > 0) completed++;
    return Math.round((completed / total) * 100);
  };
  const completionPercentage = calculateVaultCompletion();

  const navCategories = [
    { id: "all", label: "Overview & All Vault", icon: Layers, count: null, isTab: "profile" },
    { id: "personal", label: "Personal & Contact", icon: User, count: null, isTab: "profile" },
    { id: "coding", label: "Coding Profiles", icon: Code, count: [leetcode, codeforces, codechef, hackerrank, gfg].filter(Boolean).length, isTab: "profile" },
    { id: "academic", label: "Academics & Bio", icon: GraduationCap, count: null, isTab: "profile" },
    { id: "skills", label: "Skills Vault", icon: Sparkles, count: skills.length, isTab: "profile" },
    { id: "certifications", label: "Certifications", icon: FileText, count: certifications.length, isTab: "profile" },
    { id: "achievements", label: "Achievements & Awards", icon: Award, count: achievements.length, isTab: "profile" },
    { id: "projects", label: "Projects Vault", icon: Briefcase, count: projects.length, isTab: "profile" },
    { id: "experience", label: "Experience Vault", icon: Building2, count: experiences.length, isTab: "profile" },
    { id: "custom", label: "Custom Fields Vault", icon: Tag, count: customFields.length, isTab: "profile" },
    { id: "copilot", label: "AI Application Copilot", icon: Bot, count: null, isTab: "copilot" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ─── COMPACT HEADER ─── */}
        <div className="sticky top-[57px] lg:top-0 bg-bg-base/95 backdrop-blur-md z-30 pt-1 pb-4 border-b border-border/30 -mx-4 px-4 md:-mx-8 md:px-8 flex flex-col gap-5">
          {/* Row 1: Identity + Actions */}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-serif font-bold text-text truncate">
                {fullName || "My Space"}
              </h1>
              <p className="text-[13px] text-text-muted font-medium mt-0.5">
                {userEmail}{location ? ` · ${location}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Completion Ring */}
              <div className="relative w-10 h-10" title={`${completionPercentage}% complete`}>
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" strokeWidth="3" className="stroke-border/40" />
                  <motion.path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-primary"
                    initial={{ strokeDasharray: "0, 100" }}
                    animate={{ strokeDasharray: `${completionPercentage}, 100` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-text">
                  {completionPercentage}
                </span>
              </div>

              <button
                onClick={handleCopyFullVault}
                className="h-10 px-3.5 rounded-xl border border-border bg-surface hover:bg-bg-base text-text text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Copy full profile as text"
              >
                {copiedKey === "FULL_VAULT" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{copiedKey === "FULL_VAULT" ? "Copied" : "Copy All"}</span>
              </button>

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{saving ? "Saving" : "Save"}</span>
              </button>
            </div>
          </div>

          {/* Row 2: Mode Toggle + Search */}
          <div className="flex items-center gap-3">
            {/* Segmented Control */}
            <div className="flex items-center bg-bg-base border border-border/80 p-1 rounded-xl relative shrink-0">
              {[
                { id: "view" as const, label: "View", icon: Eye, onClick: () => { setActiveTab("profile"); setViewMode("view"); } },
                { id: "edit" as const, label: "Edit", icon: Edit3, onClick: () => { setActiveTab("profile"); setViewMode("edit"); } },
                { id: "copilot" as const, label: "AI Assist", icon: Bot, onClick: () => { setActiveTab("copilot"); } },
              ].map((mode) => {
                const isActive = mode.id === "copilot" ? activeTab === "copilot" : (activeTab === "profile" && viewMode === mode.id);
                const ModeIcon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={mode.onClick}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all relative z-10 cursor-pointer ${
                      isActive ? "text-white" : "text-text-muted hover:text-text"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="modeToggle"
                        className="absolute inset-0 bg-primary rounded-lg -z-10"
                        transition={{ type: "spring", stiffness: 500, damping: 32 }}
                      />
                    )}
                    <ModeIcon className="w-3.5 h-3.5" />
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search anything…"
                className="w-full pl-9 pr-7 py-2 rounded-xl border border-border/80 bg-bg-base text-text text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-text-muted/60"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer">
                  <span className="text-xs font-bold">✕</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 3: Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar -mx-1 px-1">
            {[
              { id: "all", label: "All", isTab: "profile" as const },
              { id: "personal", label: `Personal${[fullName, email, collegeEmail, phone, dateOfBirth, location, github, linkedin, noticePeriod].filter(Boolean).length ? ` · ${[fullName, email, collegeEmail, phone, dateOfBirth, location, github, linkedin, noticePeriod].filter(Boolean).length}` : ""}`, isTab: "profile" as const },
              { id: "coding", label: `Coding${codingProfiles.filter(p => p.username).length ? ` · ${codingProfiles.filter(p => p.username).length}` : ""}`, isTab: "profile" as const },
              { id: "academic", label: `Academics${educationList.length ? ` · ${educationList.length}` : ""}`, isTab: "profile" as const },
              { id: "skills", label: `Skills${skills.length ? ` · ${skills.length}` : ""}`, isTab: "profile" as const },
              { id: "certifications", label: `Certs${certifications.length ? ` · ${certifications.length}` : ""}`, isTab: "profile" as const },
              { id: "achievements", label: `Awards${achievements.length ? ` · ${achievements.length}` : ""}`, isTab: "profile" as const },
              { id: "projects", label: `Projects${projects.length ? ` · ${projects.length}` : ""}`, isTab: "profile" as const },
              { id: "experience", label: `Experience${experiences.length ? ` · ${experiences.length}` : ""}`, isTab: "profile" as const },
              { id: "custom", label: `Custom${customFields.length ? ` · ${customFields.length}` : ""}`, isTab: "profile" as const },
            ].map((cat) => {
              const isActive = activeTab === "profile" && categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveTab("profile");
                    setCategoryFilter(cat.id);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer relative z-10 ${
                    isActive
                      ? "text-white"
                      : "text-text-muted hover:text-text hover:bg-bg-base"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="categoryPill"
                      className="absolute inset-0 bg-primary rounded-full -z-10"
                      transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    />
                  )}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── STATUS BANNERS ─── */}
        <AnimatePresence>
          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Profile saved and synced across all pages.</span>
            </motion.div>
          )}
        </AnimatePresence>

        {saveError && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-semibold">
            {saveError}
          </div>
        )}

        {/* ─── TAB CONTENT WITH SMOOTH ANIMATEPRESENCE ─── */}
        <AnimatePresence mode="wait">
          {activeTab === "profile" && (
            <motion.div
              key="profile-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="space-y-8"
            >

            {/* SECTION 1: PERSONAL & SOCIAL PROFILES */}
            {(categoryFilter === "all" || categoryFilter === "personal") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-primary/8 text-primary">
                      <User className="w-4 h-4" />
                    </div>
                    <h2 className="font-semibold text-[15px] text-text">Personal & Social</h2>
                  </div>
                  {renderPinButton("personal")}
                </div>

                {viewMode === "edit" ? (
                  /* EDIT MODE */
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Full Name</label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Candidate Name"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Personal Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="personal@email.com"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">College Email</label>
                      <input
                        type="email"
                        value={collegeEmail}
                        onChange={(e) => setCollegeEmail(e.target.value)}
                        placeholder="student@college.edu"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Phone</label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Date of Birth</label>
                      <input
                        type="date"
                        value={dateOfBirth || ""}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Location / City</label>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Bengaluru, KA"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="font-black bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded text-[9px] tracking-widest">ID</span>
                        <span>Placement Reg. Number</span>
                      </label>
                      <input
                        type="text"
                        value={registrationNumber}
                        onChange={(e) => setRegistrationNumber(e.target.value.trim())}
                        placeholder="e.g. 7Y6T8 or 22BCS045"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-900/10 text-text text-xs font-semibold focus:outline-none focus:border-amber-500"
                      />
                      <p className="text-[10px] text-text-muted mt-0.5">Used to detect your shortlist in Excel / PDF / CSV lists sent by your placement cell.</p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center space-x-1">
                        <Globe className="w-3.5 h-3.5 text-primary" />
                        <span>GitHub Profile</span>
                      </label>
                      <input
                        type="text"
                        value={github}
                        onChange={(e) => setGithub(e.target.value)}
                        placeholder="github.com/username"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center space-x-1">
                        <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                        <span>LinkedIn Profile</span>
                      </label>
                      <input
                        type="text"
                        value={linkedin}
                        onChange={(e) => setLinkedin(e.target.value)}
                        placeholder="linkedin.com/in/username"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>Notice Period / Availability</span>
                      </label>
                      <input
                        type="text"
                        value={noticePeriod}
                        onChange={(e) => setNoticePeriod(e.target.value)}
                        placeholder="Immediate / 15 Days"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                ) : (
                  /* READ / COPY MODE */
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                    {[
                      { key: "Full Name", val: fullName, icon: User },
                      { key: "Personal Email", val: email, icon: Mail },
                      { key: "College Email", val: collegeEmail, icon: Mail },
                      { key: "Phone", val: phone, icon: Phone },
                      { key: "Date of Birth", val: dateOfBirth, icon: Clock },
                      { key: "Location", val: location, icon: MapPin },
                      { key: "GitHub", val: github, icon: Globe },
                      { key: "LinkedIn", val: linkedin, icon: ExternalLink },
                      { key: "Notice Period", val: noticePeriod, icon: Clock },
                    ].filter(item => matchesSearch(item.key) || matchesSearch(item.val)).map((item, idx) => {
                      const IconComp = item.icon;
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            if (!item.val) return;
                            const copyVal = item.key === "Date of Birth" ? (
                              (() => {
                                const parts = item.val.split("-");
                                if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                                return item.val;
                              })()
                            ) : item.val;
                            copyToClipboard(copyVal, item.key);
                          }}
                          className={`p-3.5 md:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group relative ${
                            item.val
                              ? "bg-bg-base border-border/80 hover:border-primary/50 hover:shadow-sm"
                              : "bg-bg-base/40 border-border/30 opacity-60 hover:opacity-100"
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0 pr-2 flex-1">
                            <div className={`p-2.5 rounded-xl shrink-0 ${item.val ? "bg-primary/10 text-primary" : "bg-bg-base text-text-muted"}`}>
                              <IconComp className="w-4 h-4" />
                            </div>
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">{item.key}</span>
                              <span className={`text-xs font-bold block truncate ${item.val ? "text-text" : "text-text-muted italic"}`}>
                                {item.key === "Date of Birth" && item.val ? (
                                  (() => {
                                    const parts = item.val.split("-");
                                    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                                    return item.val;
                                  })()
                                ) : (item.val || "Not provided")}
                              </span>
                            </div>
                          </div>

                          {item.val && (
                            <div className="shrink-0 pl-1 flex items-center space-x-1">
                              {(item.key === "GitHub" || item.key === "LinkedIn" || item.val.startsWith("http://") || item.val.startsWith("https://")) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    let url = item.val;
                                    if (!url.startsWith("http://") && !url.startsWith("https://")) {
                                      url = `https://${url}`;
                                    }
                                    window.open(url, "_blank");
                                  }}
                                  className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center justify-center relative z-20"
                                  title={`Open ${item.key}`}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {copiedKey === item.key ? (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md flex items-center space-x-1 shrink-0">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Copied</span>
                                </span>
                              ) : (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const copyVal = item.key === "Date of Birth" ? (
                                      (() => {
                                        const parts = item.val.split("-");
                                        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                                        return item.val;
                                      })()
                                    ) : item.val;
                                    copyToClipboard(copyVal, item.key);
                                  }}
                                  className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center justify-center relative z-20"
                                  title={`Copy ${item.key}`}
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SECTION: PROFILE PHOTOS & HEADSHOTS */}
            {(categoryFilter === "all" || categoryFilter === "personal") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-[15px] text-text">Profile Photos & Headshots</h2>
                      <p className="text-xs text-text-muted">Upload up to 3 profile photos (Max 5MB each). Select 1 active photo to use.</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full">
                    {profileImages.length} / 3 Photos
                  </span>
                </div>

                {imageUploadError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center space-x-2">
                    <span>⚠️</span>
                    <span>{imageUploadError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {profileImages.map((imgUrl, index) => {
                    const isActive = activeImageIndex === index;
                    return (
                      <div
                        key={index}
                        className={`p-4 rounded-2xl border transition-all flex flex-col items-center space-y-3 relative ${
                          isActive
                            ? "bg-emerald-500/5 border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/30"
                            : "bg-bg-base border-border/60 hover:border-primary/40"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow-xs flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Active Photo</span>
                          </span>
                        )}

                        {viewMode === "edit" && (
                          <button
                            onClick={() => handleRemoveProfileImage(index)}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-surface/80 text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Delete photo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border shadow-inner mt-2 bg-surface flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imgUrl} alt={`Headshot ${index + 1}`} className="w-full h-full object-cover" />
                        </div>

                        {profileImages.length > 1 && (
                          <button
                            onClick={() => handleSetActiveImage(index)}
                            className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                              isActive
                                ? "bg-emerald-500 text-white shadow-xs"
                                : "bg-surface border border-border text-text-muted hover:text-text hover:border-primary"
                            }`}
                          >
                            <span>{isActive ? "✓ Selected Active" : "Set as Active Photo"}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {profileImages.length < 3 && viewMode === "edit" && (
                    <label className="p-6 rounded-2xl border-2 border-dashed border-border/80 hover:border-primary/60 bg-bg-base/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center text-center space-y-2 cursor-pointer group min-h-[160px]">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAddProfileImage}
                        className="hidden"
                      />
                      <div className="p-3 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                        <Plus className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-text block">Upload Headshot</span>
                        <span className="text-[10px] text-text-muted block">PNG, JPG or WEBP (Max 5MB)</span>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* SECTION: CODING & PROBLEM SOLVING PROFILES */}
            {(categoryFilter === "all" || categoryFilter === "coding") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                      <Code className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-[15px] text-text">Coding Profiles & Competitive Programming</h2>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {viewMode === "edit" && (
                      <button
                        onClick={handleAddCodingProfile}
                        className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full hover:bg-amber-500/20 transition-all flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Custom Card</span>
                      </button>
                    )}
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                      {codingProfiles.filter(p => p.username).length} Active Profiles
                    </span>
                    {renderPinButton("coding")}
                  </div>
                </div>

                {codingCustomError && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center space-x-2">
                    <span className="shrink-0 font-bold">⚠️</span>
                    <span>{codingCustomError}</span>
                  </div>
                )}

                {viewMode === "edit" ? (
                  /* EDIT MODE */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {codingProfiles.map((p) => {
                      const isStandard = ["LeetCode", "CodeChef", "Codeforces"].includes(p.platform);
                      let colorClass = "bg-amber-500/5 border-amber-500/20";
                      let indicator = "bg-amber-500";
                      if (p.platform === "Codeforces") { colorClass = "bg-blue-500/5 border-blue-500/20"; indicator = "bg-blue-500"; }
                      else if (p.platform === "CodeChef") { colorClass = "bg-orange-500/5 border-orange-500/20"; indicator = "bg-orange-500"; }
                      else if (p.platform === "HackerRank") { colorClass = "bg-emerald-500/5 border-emerald-500/20"; indicator = "bg-emerald-500"; }
                      else if (p.platform === "GeeksforGeeks") { colorClass = "bg-green-500/5 border-green-500/20"; indicator = "bg-green-500"; }
                      else if (!isStandard) { colorClass = "bg-primary/5 border-primary/20"; indicator = "bg-primary"; }
                      
                      return (
                        <div key={p.id} className={`p-4 border rounded-2xl ${colorClass} space-y-3 relative group`}>
                          {!isStandard && (
                            <button
                              onClick={() => handleRemoveCodingProfile(p.id)}
                              className="absolute top-4 right-4 text-text-muted hover:text-red-500 transition-colors cursor-pointer"
                              title="Delete platform"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          <div className="flex items-center space-x-2 border-b border-border/30 pb-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${indicator}`}></span>
                            {isStandard ? (
                              <span className="text-xs font-bold text-text uppercase tracking-wider">{p.platform}</span>
                            ) : (
                              <input
                                type="text"
                                value={p.platform}
                                onChange={(e) => handleUpdateCodingProfile(p.id, "platform", e.target.value)}
                                placeholder="Platform Name (e.g. GitHub)"
                                className="px-2 py-0.5 rounded border border-border/80 bg-surface text-text text-xs font-bold w-48 focus:outline-none focus:border-primary"
                              />
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Username</label>
                              <input
                                type="text"
                                value={p.username}
                                onChange={(e) => handleUpdateCodingProfile(p.id, "username", e.target.value)}
                                placeholder="Username / Handle"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Profile Link / URL</label>
                              <input
                                type="text"
                                value={p.url}
                                onChange={(e) => handleUpdateCodingProfile(p.id, "url", e.target.value)}
                                placeholder="https://..."
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Rating / Rank / Stars</label>
                              <input
                                type="text"
                                value={p.rating || ""}
                                onChange={(e) => handleUpdateCodingProfile(p.id, "rating", e.target.value)}
                                placeholder="e.g. Knight / 1900 / 3★"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Problems Solved</label>
                              <input
                                type="text"
                                value={p.solvedCount || ""}
                                onChange={(e) => handleUpdateCodingProfile(p.id, "solvedCount", e.target.value)}
                                placeholder="e.g. 500+ / 1200"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* READ / COPY MODE */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {codingProfiles.filter(p => p.username && (matchesSearch(p.platform) || matchesSearch(p.username) || matchesSearch(p.rating || ""))).map((p) => {
                      const isStandard = ["LeetCode", "Codeforces", "CodeChef", "HackerRank", "GeeksforGeeks"].includes(p.platform);
                      let colorClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
                      let indicator = "bg-amber-500";
                      if (p.platform === "Codeforces") { colorClass = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"; indicator = "bg-blue-500"; }
                      else if (p.platform === "CodeChef") { colorClass = "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"; indicator = "bg-orange-500"; }
                      else if (p.platform === "HackerRank") { colorClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"; indicator = "bg-emerald-500"; }
                      else if (p.platform === "GeeksforGeeks") { colorClass = "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"; indicator = "bg-green-500"; }
                      else if (!isStandard) { colorClass = "bg-primary/10 text-primary border-primary/20"; indicator = "bg-primary"; }
                      
                      return (
                        <div
                          key={p.id}
                          className="p-4 rounded-2xl border border-border/80 bg-bg-base hover:border-primary/50 hover:shadow-sm transition-all flex flex-col justify-between group relative space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-border/30 pb-2">
                            <div className="flex items-center space-x-2">
                              <span className={`w-2 h-2 rounded-full ${indicator}`}></span>
                              <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">{p.platform} Profile</span>
                            </div>
                            {p.url && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  window.open(p.url, "_blank");
                                }}
                                className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center gap-1 text-[9px] font-bold"
                                title="Open profile page"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Open Profile</span>
                              </button>
                            )}
                          </div>

                          <div className="space-y-2">
                            {/* Username */}
                            {p.username && (
                              <div
                                onClick={() => copyToClipboard(p.username, `${p.id}-user`)}
                                className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                              >
                                <div className="min-w-0 pr-2">
                                  <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Username</span>
                                  <span className="text-xs font-bold text-text block truncate">{p.username}</span>
                                </div>
                                <div className="shrink-0 pl-1">
                                  {copiedKey === `${p.id}-user` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Profile URL */}
                            {p.url && (
                              <div
                                onClick={() => copyToClipboard(p.url, `${p.id}-url`)}
                                className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                              >
                                <div className="min-w-0 pr-2">
                                  <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Profile URL</span>
                                  <span className="text-xs font-bold text-text block truncate">{p.url}</span>
                                </div>
                                <div className="shrink-0 pl-1 flex items-center space-x-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(p.url, "_blank");
                                    }}
                                    className="p-1 rounded text-text-muted hover:text-primary hover:bg-primary/10 opacity-0 group-hover/row:opacity-100 transition-all cursor-pointer flex items-center justify-center relative z-20"
                                    title="Open Link"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                  {copiedKey === `${p.id}-url` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Rating and Solved Grid */}
                            <div className="grid grid-cols-2 gap-2">
                              {p.rating && (
                                <div
                                  onClick={() => copyToClipboard(p.rating || "", `${p.id}-rating`)}
                                  className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Rating / Rank</span>
                                    <span className="text-xs font-bold text-text block truncate">{p.rating}</span>
                                  </div>
                                  <div className="shrink-0 pl-1">
                                    {copiedKey === `${p.id}-rating` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    )}
                                  </div>
                                </div>
                              )}

                              {p.solvedCount && (
                                <div
                                  onClick={() => copyToClipboard(p.solvedCount || "", `${p.id}-solved`)}
                                  className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Solved</span>
                                    <span className="text-xs font-bold text-text block truncate">{p.solvedCount}</span>
                                  </div>
                                  <div className="shrink-0 pl-1">
                                    {copiedKey === `${p.id}-solved` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {(categoryFilter === "all" || categoryFilter === "academic") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-[15px] text-text">Academics & Education History</h2>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-text-muted font-bold bg-bg-base border border-border px-3 py-1 rounded-full">
                      {educationList.filter(e => e.institution).length} Levels Completed
                    </span>
                    {renderPinButton("academic")}
                  </div>
                </div>

                {viewMode === "edit" ? (
                  /* EDIT MODE */
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {educationList.map((e) => (
                        <div key={e.type} className="p-4 border border-border/60 rounded-2xl bg-bg-base space-y-3">
                          <div className="flex items-center justify-between border-b border-border/30 pb-2">
                            <span className="text-xs font-bold text-primary uppercase tracking-wider">{e.type} Education</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Institution / School / College</label>
                              <input
                                type="text"
                                value={e.institution}
                                onChange={(eInput) => handleUpdateEducation(e.type, "institution", eInput.target.value)}
                                placeholder="School/College Name"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Degree</label>
                              <input
                                type="text"
                                value={e.degree || ""}
                                onChange={(eInput) => handleUpdateEducation(e.type, "degree", eInput.target.value)}
                                placeholder="e.g. B.Tech / SSC / CBSE"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Branch / Stream</label>
                              <input
                                type="text"
                                value={e.branch || ""}
                                onChange={(eInput) => handleUpdateEducation(e.type, "branch", eInput.target.value)}
                                placeholder="e.g. Computer Science / PCM"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">CGPA / Percentage</label>
                              <input
                                type="text"
                                value={e.cgpaOrPercentage}
                                onChange={(eInput) => handleUpdateEducation(e.type, "cgpaOrPercentage", eInput.target.value)}
                                placeholder="e.g. 9.2 CGPA or 92%"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Graduation Year</label>
                              <input
                                type="text"
                                value={e.graduationYear}
                                onChange={(eInput) => handleUpdateEducation(e.type, "graduationYear", eInput.target.value)}
                                placeholder="e.g. 2026"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>

                            <div className="sm:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Location / City</label>
                              <input
                                type="text"
                                value={e.location || ""}
                                onChange={(eInput) => handleUpdateEducation(e.type, "location", eInput.target.value)}
                                placeholder="e.g. Bengaluru, Karnataka"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Placement Eligibility Academic Details (Backlogs & Gap Years) */}
                    <div className="p-4 border border-primary/30 rounded-2xl bg-primary/5 space-y-3">
                      <div className="flex items-center space-x-2 border-b border-primary/20 pb-2">
                        <GraduationCap className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs font-extrabold text-primary uppercase tracking-wider">Placement Cell Eligibility Details</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Active Backlogs (Current Arrears)</label>
                          <input
                            type="text"
                            value={activeBacklogs}
                            onChange={(e) => setActiveBacklogs(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Total Backlog History (Cleared)</label>
                          <input
                            type="text"
                            value={backlogHistory}
                            onChange={(e) => setBacklogHistory(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Academic Gap Years</label>
                          <input
                            type="text"
                            value={academicGapYears}
                            onChange={(e) => setAcademicGapYears(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Career Bio / Elevator Summary</label>
                      <textarea
                        rows={3}
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        placeholder="High-performing Computer Science graduate with hands-on experience building microservice backends..."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                ) : (
                  /* READ / COPY MODE */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {educationList.filter(e => e.institution && (matchesSearch(e.institution) || matchesSearch(e.type) || matchesSearch(e.degree || "") || matchesSearch(e.branch || ""))).map((e) => (
                        <div
                          key={e.type}
                          className="p-4 rounded-2xl border border-border/80 bg-bg-base hover:border-primary/50 hover:shadow-sm transition-all flex flex-col justify-between group relative space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-border/30 pb-2">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">{e.type} Education</span>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                copyToClipboard(`${e.type}: ${e.institution} | Degree: ${e.degree || "N/A"} | Branch: ${e.branch || "N/A"} | ${formatEducationScore(e.cgpaOrPercentage)} | Year: ${e.graduationYear} | Location: ${e.location || "N/A"}`, e.type);
                              }}
                              className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center gap-1 text-[9px] font-bold"
                              title="Copy full education string"
                            >
                              {copiedKey === e.type ? (
                                <span className="text-emerald-600 font-extrabold">Copied Full</span>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy All</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="space-y-2">
                            {/* Institution */}
                            {e.institution && (
                              <div
                                onClick={() => copyToClipboard(e.institution, `${e.type}-inst`)}
                                className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                              >
                                <div className="min-w-0 pr-2">
                                  <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Institution</span>
                                  <span className="text-xs font-bold text-text block truncate">{e.institution}</span>
                                </div>
                                <div className="shrink-0 pl-1">
                                  {copiedKey === `${e.type}-inst` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Degree & Branch Grid */}
                            <div className="grid grid-cols-2 gap-2">
                              {e.degree && (
                                <div
                                  onClick={() => copyToClipboard(e.degree || "", `${e.type}-deg`)}
                                  className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Degree</span>
                                    <span className="text-xs font-bold text-text block truncate">{e.degree}</span>
                                  </div>
                                  <div className="shrink-0 pl-1">
                                    {copiedKey === `${e.type}-deg` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    )}
                                  </div>
                                </div>
                              )}

                              {e.branch && (
                                <div
                                  onClick={() => copyToClipboard(e.branch || "", `${e.type}-branch`)}
                                  className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Branch</span>
                                    <span className="text-xs font-bold text-text block truncate">{e.branch}</span>
                                  </div>
                                  <div className="shrink-0 pl-1">
                                    {copiedKey === `${e.type}-branch` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Grade & Graduation Year Grid */}
                            <div className="grid grid-cols-2 gap-2">
                              {e.cgpaOrPercentage && (
                                <div
                                  onClick={() => copyToClipboard(e.cgpaOrPercentage, `${e.type}-grade`)}
                                  className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Grade</span>
                                    <span className="text-xs font-bold text-text block truncate">{e.cgpaOrPercentage}</span>
                                  </div>
                                  <div className="shrink-0 pl-1">
                                    {copiedKey === `${e.type}-grade` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    )}
                                  </div>
                                </div>
                              )}

                              {e.graduationYear && (
                                <div
                                  onClick={() => copyToClipboard(e.graduationYear, `${e.type}-year`)}
                                  className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Year</span>
                                    <span className="text-xs font-bold text-text block truncate">{e.graduationYear}</span>
                                  </div>
                                  <div className="shrink-0 pl-1">
                                    {copiedKey === `${e.type}-year` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Location */}
                            {e.location && (
                              <div
                                onClick={() => copyToClipboard(e.location || "", `${e.type}-loc`)}
                                className="p-2 rounded-lg bg-surface/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between group/row cursor-pointer"
                              >
                                <div className="min-w-0 pr-2">
                                  <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider block">Location</span>
                                  <span className="text-xs font-bold text-text block truncate">📍 {e.location}</span>
                                </div>
                                <div className="shrink-0 pl-1">
                                  {copiedKey === `${e.type}-loc` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-text-muted group-hover/row:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {summary && (
                      <div
                        onClick={() => copyToClipboard(summary, "Career Bio")}
                        className="p-4 border border-border/80 rounded-2xl bg-bg-base hover:border-primary/50 transition-all cursor-pointer space-y-1.5 group relative"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Career Bio / Summary</span>
                          {copiedKey === "Career Bio" ? (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md flex items-center space-x-1">
                              <Check className="w-3 h-3" />
                              <span>Copied</span>
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-text-muted group-hover:text-primary flex items-center gap-1">
                              <Copy className="w-3.5 h-3.5" />
                              <span>Click to copy bio</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-text leading-relaxed whitespace-pre-wrap">{summary}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 3: TECHNICAL SKILLS */}
            {(categoryFilter === "all" || categoryFilter === "skills") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Code className="w-5 h-5 text-primary" />
                    <h2 className="font-serif font-bold text-lg text-text">Technical Skills Vault</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-text-muted font-bold">{skills.length} Skills Stored</span>
                    {renderPinButton("skills")}
                  </div>
                </div>

                {viewMode === "edit" && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newSkillInput}
                      onChange={(e) => setNewSkillInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSkill())}
                      placeholder="Add skill (e.g. React, Node.js, Python, PostgreSQL)"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddSkill}
                      className="px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/95 transition-all cursor-pointer"
                    >
                      Add Skill
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {(Array.isArray(skills) ? skills : []).filter(s => matchesSearch(s)).map((skill, idx) => (
                    <span
                      key={idx}
                      onClick={() => copyToClipboard(skill, `Skill-${skill}`)}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold cursor-pointer hover:bg-primary/20 transition-all"
                      title="Click to copy skill"
                    >
                      <span>{skill}</span>
                      {viewMode === "edit" && (
                        <button onClick={(e) => { e.stopPropagation(); handleRemoveSkill(idx); }} className="hover:text-red-500 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* CERTIFICATIONS & LICENSES VAULT */}
            {(categoryFilter === "all" || categoryFilter === "certifications") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Award className="w-5 h-5 text-emerald-500" />
                    <h2 className="font-serif font-bold text-lg text-text">Certifications & Licenses Vault</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-text-muted font-bold">{certifications.length} Certifications Stored</span>
                    {renderPinButton("certifications")}
                  </div>
                </div>

                {viewMode === "edit" && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <input
                      type="text"
                      value={newCertInput}
                      onChange={(e) => setNewCertInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCert())}
                      placeholder="Add certification (e.g. AWS Certified Solutions Architect)"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      value={newCertYearInput}
                      onChange={(e) => setNewCertYearInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCert())}
                      placeholder="Year (e.g. 2024)"
                      className="w-full sm:w-36 px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddCert}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
                    >
                      Add Certification
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {(Array.isArray(certifications) ? certifications : []).filter(c => matchesSearch(c.name) || (c.year && matchesSearch(c.year))).map((cert, idx) => (
                    <span
                      key={idx}
                      onClick={() => copyToClipboard(cert.year ? `${cert.name} (${cert.year})` : cert.name, `Cert-${cert.name}`)}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold cursor-pointer hover:bg-emerald-500/20 transition-all group"
                      title="Click to copy certification"
                    >
                      <Award className="w-3.5 h-3.5 shrink-0" />
                      <span>{cert.name}{cert.year ? ` (${cert.year})` : ""}</span>
                      {viewMode === "view" && (
                        copiedKey === `Cert-${cert.name}` ? (
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 ml-1 shrink-0" />
                        ) : (
                          <Copy className="w-3 h-3 text-emerald-500/50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0" />
                        )
                      )}
                      {viewMode === "edit" && (
                        <button onClick={(e) => { e.stopPropagation(); handleRemoveCert(idx); }} className="hover:text-red-500 cursor-pointer ml-1">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </span>
                  ))}
                  {certifications.length === 0 && (
                    <p className="text-xs text-text-muted italic">No certifications stored yet. Click "Edit Profile Vault" to add your professional certificates.</p>
                  )}
                </div>
              </div>
            )}

            {/* ACHIEVEMENTS & AWARDS VAULT */}
            {(categoryFilter === "all" || categoryFilter === "achievements") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <h2 className="font-serif font-bold text-lg text-text">Achievements & Awards Vault</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-text-muted font-bold">{achievements.length} Achievements Stored</span>
                    {renderPinButton("achievements")}
                  </div>
                </div>

                {viewMode === "edit" && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newAchievementInput}
                      onChange={(e) => setNewAchievementInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddAchievement())}
                      placeholder="Add achievement (e.g. 1st Rank in Smart India Hackathon 2025, Published IEEE paper)"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddAchievement}
                      className="px-4 py-2.5 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-400 transition-all cursor-pointer"
                    >
                      Add Achievement
                    </button>
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  {(Array.isArray(achievements) ? achievements : []).filter(a => matchesSearch(a)).map((ach, idx) => (
                    <div
                      key={idx}
                      onClick={() => copyToClipboard(ach, `Ach-${idx}`)}
                      className="p-3 border border-border/80 rounded-2xl bg-bg-base hover:border-amber-500/50 transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                        <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-bold text-text truncate">{ach}</span>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        {copiedKey === `Ach-${idx}` ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-md">
                            Copied
                          </span>
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-text-muted group-hover:text-amber-500" />
                        )}

                        {viewMode === "edit" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAchievement(idx);
                            }}
                            className="p-1 text-text-muted hover:text-red-500 transition-colors cursor-pointer"
                            title="Delete Achievement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {achievements.length === 0 && (
                    <p className="text-xs text-text-muted italic">No achievements stored yet. Click "Edit Profile Vault" to add your hackathons, ranks, awards, and publications.</p>
                  )}
                </div>
              </div>
            )}

            {/* SECTION 4: CUSTOM FIELDS VAULT (ADD ANY CUSTOM DETAIL) */}
            {(categoryFilter === "all" || categoryFilter === "custom") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Tag className="w-5 h-5 text-primary" />
                    <h2 className="font-serif font-bold text-lg text-text">Custom Information Vault (Key-Value Pairs)</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-text-muted font-bold">{customFields.length} Custom Fields</span>
                  </div>
                </div>

                {/* Add Custom Detail Form - Edit mode only */}
                {viewMode === "edit" && (
                  <div className="p-4 border border-primary/30 rounded-2xl bg-primary/5 space-y-3">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center space-x-1">
                      <PlusCircle className="w-4 h-4" />
                      <span>Add Custom Detail Field (e.g., Preferred CTC, Portfolio, Achievements)</span>
                    </span>

                    <div className="space-y-3">
                      {customKeySelection === "Other" ? (
                        <>
                          {/* Row 1: Dropdown and Key Name Input (50/50 split) */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <select
                                value={customKeySelection}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomKeySelection(val);
                                  if (val !== "Other") {
                                    setNewCustomKey(val);
                                  } else {
                                    setNewCustomKey("");
                                  }
                                }}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-bold focus:outline-none focus:border-primary"
                              >
                                <option value="Target Role 1">Target Role 1</option>
                                <option value="Target Role 2">Target Role 2</option>
                                <option value="Target Role 3">Target Role 3</option>
                                <option value="Preferred Location">Preferred Location</option>
                                <option value="Expected CTC">Expected CTC</option>
                                <option value="Other">Other (Custom Key)</option>
                              </select>
                            </div>
                            <div>
                              <input
                                type="text"
                                value={newCustomKey}
                                onChange={(e) => setNewCustomKey(e.target.value)}
                                placeholder="Key Name (e.g. Portfolio)"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-bold focus:outline-none focus:border-primary"
                              />
                            </div>
                          </div>

                          {/* Row 2: Value Input, Link Input, and Add Button */}
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                            <div className="sm:col-span-5">
                              <input
                                type="text"
                                value={newCustomVal}
                                onChange={(e) => setNewCustomVal(e.target.value)}
                                placeholder="Field Value (e.g. Software Engineer, Bengaluru, 15 LPA)"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                              />
                            </div>
                            <div className="sm:col-span-5">
                              <input
                                type="text"
                                value={newCustomLink}
                                onChange={(e) => setNewCustomLink(e.target.value)}
                                placeholder="Optional Link / URL for easy open (e.g. https://my-portfolio.com)"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <button
                                type="button"
                                onClick={handleAddCustomField}
                                className="w-full px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/95 transition-all cursor-pointer"
                              >
                                + Add Field
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        /* Single Row Layout when using a Preset Key */
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                          <div className="sm:col-span-4">
                            <select
                              value={customKeySelection}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomKeySelection(val);
                                if (val !== "Other") {
                                  setNewCustomKey(val);
                                } else {
                                  setNewCustomKey("");
                                }
                              }}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-bold focus:outline-none focus:border-primary"
                            >
                              <option value="Target Role 1">Target Role 1</option>
                              <option value="Target Role 2">Target Role 2</option>
                              <option value="Target Role 3">Target Role 3</option>
                              <option value="Preferred Location">Preferred Location</option>
                              <option value="Expected CTC">Expected CTC</option>
                              <option value="Other">Other (Custom Key)</option>
                            </select>
                          </div>

                          <div className="sm:col-span-6">
                            <input
                              type="text"
                              value={newCustomVal}
                              onChange={(e) => setNewCustomVal(e.target.value)}
                              placeholder="Field Value (e.g. Software Engineer, Bengaluru, 15 LPA)"
                              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-base text-text text-xs font-semibold focus:outline-none focus:border-primary"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <button
                              type="button"
                              onClick={handleAddCustomField}
                              className="w-full px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/95 transition-all cursor-pointer"
                            >
                              + Add Field
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Custom Fields List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(Array.isArray(customFields) ? customFields : []).filter(cf => matchesSearch(cf.key) || matchesSearch(cf.value)).map((cf, idx) => {
                    const fieldId = cf.id && cf.id !== "undefined" ? cf.id.toString() : (cf.key ? `key-${cf.key.toLowerCase().replace(/\s+/g, "_")}` : idx.toString());
                    const primaryPinId = `custom-field-${fieldId}`;
                    const altPinId = `custom-field-${idx}`;

                    return (
                      <div
                        key={cf.id || idx}
                        onClick={() => copyToClipboard(cf.value, cf.key)}
                        className="p-3.5 border border-border/80 rounded-2xl bg-bg-base hover:border-primary/50 transition-all cursor-pointer flex items-center justify-between group relative"
                      >
                        <div className="space-y-0.5 min-w-0 pr-2 flex-1">
                          <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">{cf.key}</span>
                          <span className="text-xs font-bold text-text truncate block">{cf.value}</span>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0 relative z-20">
                          {renderPinButton(primaryPinId, altPinId)}
                          {(cf.value.startsWith("http://") || cf.value.startsWith("https://") || cf.value.includes("github.com") || cf.value.includes("linkedin.com")) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                let url = cf.value;
                                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                                  url = `https://${url}`;
                                }
                                window.open(url, "_blank");
                              }}
                              className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center justify-center"
                              title="Open Link"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {copiedKey === cf.key ? (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-md">
                              Copied
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(cf.value, cf.key);
                              }}
                              className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center justify-center"
                              title="Copy Custom Field"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {viewMode === "edit" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveCustomField(cf.id);
                              }}
                              className="p-1 text-text-muted hover:text-red-500 transition-colors"
                              title="Delete Custom Field"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION 5: PROJECTS */}
            {(categoryFilter === "all" || categoryFilter === "projects") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-primary" />
                    <h2 className="font-serif font-bold text-lg text-text">Key Engineering Projects</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    {viewMode === "edit" && (
                      <button
                        onClick={handleAddProject}
                        className="px-3.5 py-1.5 bg-primary/10 border border-primary/30 text-primary text-xs font-bold rounded-full hover:bg-primary/20 transition-all flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Project</span>
                      </button>
                    )}
                    {renderPinButton("projects")}
                  </div>
                </div>

                <div className="space-y-4">
                  {(Array.isArray(projects) ? projects : []).filter(p => matchesSearch(p.title) || matchesSearch(p.techStack) || matchesSearch(p.description)).map((proj) => (
                    <div key={proj.id} className="p-4 border border-border rounded-2xl bg-bg-base space-y-3 relative group">
                      {viewMode === "edit" && (
                        <button
                          onClick={() => handleRemoveProject(proj.id)}
                          className="absolute top-4 right-4 text-text-muted hover:text-red-500 transition-colors"
                          title="Delete Project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      {viewMode === "edit" ? (
                        <div className="space-y-3 pr-8">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Project Title</label>
                              <input
                                type="text"
                                value={proj.title}
                                onChange={(e) => handleUpdateProject(proj.id, "title", e.target.value)}
                                placeholder="Project Title"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Tech Stack</label>
                              <input
                                type="text"
                                value={proj.techStack}
                                onChange={(e) => handleUpdateProject(proj.id, "techStack", e.target.value)}
                                placeholder="Tech Stack (e.g. Next.js, Docker, Redis)"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label htmlFor={`github-link-${proj.id}`} className="text-[10px] font-bold text-text-muted uppercase tracking-wider">GitHub Link</label>
                              <input
                                type="text"
                                id={`github-link-${proj.id}`}
                                name={`github-link-${proj.id}`}
                                autoComplete="new-password"
                                value={proj.githubLink || ""}
                                onChange={(e) => handleUpdateProject(proj.id, "githubLink", e.target.value)}
                                placeholder="https://github.com/..."
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label htmlFor={`host-link-${proj.id}`} className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Live Host Link</label>
                              <input
                                type="text"
                                id={`host-link-${proj.id}`}
                                name={`host-link-${proj.id}`}
                                autoComplete="new-password"
                                value={proj.hostLink || ""}
                                onChange={(e) => handleUpdateProject(proj.id, "hostLink", e.target.value)}
                                placeholder="https://..."
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Project Description</label>
                            <textarea
                              rows={5}
                              value={proj.description}
                              onChange={(e) => handleUpdateProject(proj.id, "description", e.target.value)}
                              placeholder="Key achievements, metrics, architectural details..."
                              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-medium"
                            />
                          </div>
                        </div>
                      ) : (
                        <div
                          className="space-y-2 pr-8"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2 flex-1 min-w-0">
                              <h3 className="font-bold text-sm text-text leading-snug break-words">
                                {proj.title}
                              </h3>
                              
                              {proj.techStack && (
                                <div className="flex flex-wrap gap-1.5">
                                  {proj.techStack.split(",").map(t => t.trim()).filter(Boolean).map((tech, idx) => (
                                    <span key={idx} className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                                      {tech}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-2 shrink-0">
                                {proj.githubLink && (
                                  <a
                                    href={proj.githubLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] font-bold text-primary hover:bg-primary/10 border border-primary/20 px-2.5 py-1.5 rounded-xl inline-flex items-center gap-1.5 transition-all cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Globe className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">GitHub</span>
                                  </a>
                                )}
                                {proj.hostLink && (
                                  <a
                                    href={proj.hostLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-xl inline-flex items-center gap-1.5 transition-all cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Live Link</span>
                                  </a>
                                )}
                                <button
                                  onClick={() => copyToClipboard(`${proj.title} (${proj.techStack}): ${proj.description} | GitHub: ${proj.githubLink || "N/A"} | Live: ${proj.hostLink || "N/A"}`, proj.title)}
                                  className="p-2 rounded-xl text-text-muted hover:text-primary hover:bg-primary/10 transition-all border border-border/60 cursor-pointer flex items-center justify-center"
                                  title="Copy project description"
                                >
                                  {copiedKey === proj.title ? (
                                    <Check className="w-4 h-4 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                          </div>
                          <p className="text-xs text-text-muted font-medium leading-relaxed">{proj.description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 6: EXPERIENCE & INTERNSHIPS */}
            {(categoryFilter === "all" || categoryFilter === "experience") && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 md:p-6 space-y-5">
                <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Briefcase className="w-5 h-5 text-primary" />
                    <h2 className="font-serif font-bold text-lg text-text">Experience & Internships</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    {viewMode === "edit" && (
                      <button
                        onClick={handleAddExperience}
                        className="px-3.5 py-1.5 bg-primary/10 border border-primary/30 text-primary text-xs font-bold rounded-full hover:bg-primary/20 transition-all flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Experience</span>
                      </button>
                    )}
                    {renderPinButton("experience")}
                  </div>
                </div>

                <div className="space-y-4">
                  {(Array.isArray(experiences) ? experiences : []).filter(e => matchesSearch(e.role) || matchesSearch(e.company) || matchesSearch(e.description)).map((exp) => (
                    <div key={exp.id} className="p-4 border border-border rounded-2xl bg-bg-base space-y-3 relative group">
                      {viewMode === "edit" && (
                        <button
                          onClick={() => handleRemoveExperience(exp.id)}
                          className="absolute top-4 right-4 text-text-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      {viewMode === "edit" ? (
                        <div className="space-y-3 pr-8">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input
                              type="text"
                              value={exp.role}
                              onChange={(e) => handleUpdateExperience(exp.id, "role", e.target.value)}
                              placeholder="Role / Title"
                              className="px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-bold"
                            />
                            <input
                              type="text"
                              value={exp.company}
                              onChange={(e) => handleUpdateExperience(exp.id, "company", e.target.value)}
                              placeholder="Company / Organization"
                              className="px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-semibold"
                            />
                            <input
                              type="text"
                              value={exp.duration}
                              onChange={(e) => handleUpdateExperience(exp.id, "duration", e.target.value)}
                              placeholder="Duration (e.g. May 2025 - Jul 2025)"
                              className="px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-medium"
                            />
                          </div>
                          <textarea
                            rows={5}
                            value={exp.description}
                            onChange={(e) => handleUpdateExperience(exp.id, "description", e.target.value)}
                            placeholder="Responsibilities, achievements, impact..."
                            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-xs font-medium"
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => copyToClipboard(`${exp.role} at ${exp.company} (${exp.duration}): ${exp.description}`, exp.role)}
                          className="space-y-1 cursor-pointer pr-8"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-sm text-text">
                              {exp.role} <span className="text-primary font-normal">at {exp.company}</span>
                              <span className="text-xs text-text-muted font-normal ml-2">({exp.duration})</span>
                            </h3>
                            <Copy className="w-3.5 h-3.5 text-text-muted group-hover:text-primary" />
                          </div>
                          <p className="text-xs text-text-muted font-medium">{exp.description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            </motion.div>
          )}

          {activeTab === "copilot" && (
            <motion.div
              key="copilot-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="max-w-4xl mx-auto space-y-6"
            >
              
              {/* Minimal Header */}
              <div className="text-center space-y-2 py-2">
                <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Powered by Master Profile Vault & Gemini</span>
                </div>
                <h2 className="font-serif font-bold text-2xl md:text-3xl text-text">
                  Application Answer Assistant
                </h2>
                <p className="text-xs text-text-muted font-medium max-w-lg mx-auto leading-relaxed">
                  Paste any job application question. Our AI drafts custom answers directly using your real college details, CGPA, engineering projects, and skills.
                </p>
              </div>

              {/* Context Inputs Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-text-muted absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Company Name (Optional)"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border/80 bg-surface text-text text-xs font-medium focus:outline-none focus:border-primary transition-all shadow-xs"
                  />
                </div>

                <div className="relative">
                  <Briefcase className="w-3.5 h-3.5 text-text-muted absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={jobRole}
                    onChange={(e) => setJobRole(e.target.value)}
                    placeholder="Target Role (Optional)"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border/80 bg-surface text-text text-xs font-medium focus:outline-none focus:border-primary transition-all shadow-xs"
                  />
                </div>
              </div>

              {/* Sleek Prompt Card */}
              <div className="bg-surface border border-border/80 rounded-3xl p-5 md:p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow relative">
                
                {/* Sample Question Chips */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mr-1">Quick Prompts:</span>
                  {presetQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQuestion(q);
                        handleAskAi(q);
                      }}
                      className="px-3 py-1.5 bg-bg-base hover:bg-primary/10 border border-border/60 hover:border-primary/40 text-text-muted hover:text-primary rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5"
                    >
                      <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="truncate max-w-[220px]">{q}</span>
                    </button>
                  ))}
                </div>

                {/* Textarea Input */}
                <div>
                  <textarea
                    rows={4}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Paste application question here... (e.g. 'Describe a complex technical challenge you solved using React & PostgreSQL')"
                    className="w-full p-4 rounded-2xl border border-border/60 bg-bg-base/50 text-text text-xs font-medium focus:outline-none focus:border-primary focus:bg-surface transition-all leading-relaxed"
                  />
                </div>

                {/* Submit Action Bar */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-text-muted font-medium hidden sm:inline">
                    {question.length > 0 ? `${question.length} characters` : "Answers created from your private vault profile"}
                  </span>

                  <button
                    onClick={() => handleAskAi()}
                    disabled={isGenerating || !question.trim()}
                    className="w-full sm:w-auto px-6 py-2.5 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer ml-auto"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating Answer...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Generate Answer</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Generated Answer Display */}
              {aiAnswer && (
                <div className="bg-surface border border-primary/30 rounded-3xl p-6 space-y-4 shadow-sm relative animate-fade-in">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <h3 className="font-serif font-bold text-base text-text">Tailored Answer</h3>
                    </div>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(aiAnswer);
                        setCopiedAnswer(true);
                        setTimeout(() => setCopiedAnswer(false), 2000);
                      }}
                      className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/95 transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
                    >
                      {copiedAnswer ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Answer</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-xs text-text leading-relaxed font-medium whitespace-pre-wrap bg-bg-base/40 p-4 rounded-2xl border border-border/40">
                    {aiAnswer}
                  </div>
                </div>
              )}

            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </AppLayout>
  );
}
