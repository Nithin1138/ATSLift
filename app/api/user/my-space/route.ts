import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        masterProfile: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let masterProfile = user.masterProfile;

    // Auto-populate from latest resume ONLY if MasterProfile doesn't exist yet!
    if (!masterProfile) {
      try {
        const latestResume = await prisma.resume.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          select: { inputData: true, targetRole: true, college: true, branch: true, cgpa: true },
        });

        if (latestResume) {
          const inputData = JSON.parse(latestResume.inputData || "{}");
          const personal = inputData.personal || {};

        let extractedSkills: string[] = [];
        let extractedCertifications: string[] = [];
        let extractedAchievements: string[] = [];

        if (Array.isArray(inputData.skills)) {
          extractedSkills = inputData.skills;
        } else if (inputData.skills && typeof inputData.skills === "object") {
          const cats = inputData.skills.categories || {};
          Object.values(cats).forEach((val: any) => {
            if (Array.isArray(val)) extractedSkills.push(...val);
            else if (typeof val === "string") extractedSkills.push(...val.split(",").map((v: string) => v.trim()));
          });
          if (inputData.skills.softSkills && typeof inputData.skills.softSkills === "string") {
            extractedSkills.push(...inputData.skills.softSkills.split(",").map((v: string) => v.trim()));
          }
          if (inputData.skills.certifications && typeof inputData.skills.certifications === "string") {
            extractedCertifications.push(...inputData.skills.certifications.split(",").map((v: string) => v.trim()));
          }
        }

        if (Array.isArray(inputData.certifications)) {
          extractedCertifications.push(...inputData.certifications);
        }

        if (Array.isArray(inputData.achievements)) {
          extractedAchievements.push(...inputData.achievements);
        } else if (typeof inputData.achievements === "string") {
          extractedAchievements.push(...inputData.achievements.split("\n").map((a: string) => a.trim()).filter(Boolean));
        }

        masterProfile = await prisma.masterProfile.create({
          data: {
            userId: user.id,
            fullName: personal.fullName || user.name || "",
            phone: personal.phone || "",
            location: personal.city || personal.location || "",
            github: personal.github || "",
            linkedin: personal.linkedin || "",
            portfolio: personal.portfolio || "",
            noticePeriod: "Immediate",
            college: personal.collegeName || latestResume.college || "",
            branch: personal.branch || latestResume.branch || "",
            cgpa: personal.cgpa || latestResume.cgpa || "",
            summary: inputData.summary || "",
            skillsJson: JSON.stringify(extractedSkills.filter(Boolean)),
            projectsJson: JSON.stringify(Array.isArray(inputData.projects) ? inputData.projects : []),
            experiencesJson: JSON.stringify(Array.isArray(inputData.internships) ? inputData.internships : (Array.isArray(inputData.experience) ? inputData.experience : [])),
            certificationsJson: JSON.stringify(extractedCertifications.filter(Boolean)),
            achievementsJson: JSON.stringify(extractedAchievements.filter(Boolean)),
            customFieldsJson: JSON.stringify([
              { key: "Target Role", value: latestResume.targetRole || "Software Engineer" },
              { key: "Preferred Location", value: "Bengaluru / Remote" },
            ]),
          },
        });
        }
      } catch (e) {
        console.error("Auto-populate master profile failed:", e);
      }
    }

    return NextResponse.json({
      profile: masterProfile,
      userName: user.name,
      userEmail: user.email,
    });
  } catch (error: any) {
    console.error("Fetch My Space error:", error);
    return NextResponse.json({ error: error.message || "Failed to load My Space" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
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
      codingProfilesJson,
      college,
      branch,
      cgpa,
      graduationYear,
      activeBacklogs,
      backlogHistory,
      academicGapYears,
      educationJson,
      summary,
      skillsJson,
      projectsJson,
      experiencesJson,
      certificationsJson,
      achievementsJson,
      customFieldsJson,
      pinnedSectionsJson,
      profileImagesJson,
      activeImageIndex,
      customNotes,
    } = body;

    const dataPayload: any = {
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
      codingProfilesJson: typeof codingProfilesJson === "string" ? codingProfilesJson : JSON.stringify(codingProfilesJson || []),
      college,
      branch,
      cgpa,
      graduationYear,
      activeBacklogs: activeBacklogs !== undefined ? String(activeBacklogs) : undefined,
      backlogHistory: backlogHistory !== undefined ? String(backlogHistory) : undefined,
      academicGapYears: academicGapYears !== undefined ? String(academicGapYears) : undefined,
      educationJson: typeof educationJson === "string" ? educationJson : JSON.stringify(educationJson || []),
      summary,
      skillsJson: typeof skillsJson === "string" ? skillsJson : JSON.stringify(skillsJson || []),
      projectsJson: typeof projectsJson === "string" ? projectsJson : JSON.stringify(projectsJson || []),
      experiencesJson: typeof experiencesJson === "string" ? experiencesJson : JSON.stringify(experiencesJson || []),
      certificationsJson: typeof certificationsJson === "string" ? certificationsJson : JSON.stringify(certificationsJson || []),
      achievementsJson: typeof achievementsJson === "string" ? achievementsJson : JSON.stringify(achievementsJson || []),
      customFieldsJson: typeof customFieldsJson === "string" ? customFieldsJson : JSON.stringify(customFieldsJson || []),
      pinnedSectionsJson: typeof pinnedSectionsJson === "string" ? pinnedSectionsJson : JSON.stringify(pinnedSectionsJson || []),
      profileImagesJson: typeof profileImagesJson === "string" ? profileImagesJson : JSON.stringify(profileImagesJson || []),
      activeImageIndex: typeof activeImageIndex === "number" ? activeImageIndex : 0,
      customNotes,
    };

    let updatedProfile;
    try {
      updatedProfile = await prisma.masterProfile.upsert({
        where: { userId: user.id },
        update: dataPayload,
        create: {
          userId: user.id,
          ...dataPayload,
        },
      });
    } catch (upsertErr: any) {
      console.warn("MasterProfile upsert warning:", upsertErr?.message);
      if (
        upsertErr?.message?.includes("achievementsJson") ||
        upsertErr?.message?.includes("registrationNumber")
      ) {
        if (upsertErr?.message?.includes("achievementsJson")) delete dataPayload.achievementsJson;
        if (upsertErr?.message?.includes("registrationNumber")) delete dataPayload.registrationNumber;
        updatedProfile = await prisma.masterProfile.upsert({
          where: { userId: user.id },
          update: dataPayload,
          create: {
            userId: user.id,
            ...dataPayload,
          },
        });
      } else {
        throw upsertErr;
      }
    }

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error: any) {
    console.error("Update My Space error:", error);
    return NextResponse.json({ error: error.message || "Failed to save My Space" }, { status: 500 });
  }
}
