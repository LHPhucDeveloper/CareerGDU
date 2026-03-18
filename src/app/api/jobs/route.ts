import { NextResponse } from "next/server"
import prisma from "@/database/prisma"
import { saveBase64Image } from "@/lib/storage"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")
    const status = searchParams.get("status")
    const field = searchParams.get("field")
    const search = searchParams.get("search")?.toLowerCase()
    const creatorId = searchParams.get("creatorId")

    const now = new Date()
    // Normalizing today to start of day in +07:00 for deadline comparison
    const startOfToday = new Date(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) + 'T00:00:00+07:00')

    const where: any = {}

    // 1. Creator and Status Filter
    if (creatorId) {
      where.creatorId = creatorId
      if (status && status !== "all") {
        where.status = status
      }
    } else {
      if (status && status !== "all") {
        where.status = status
      } else if (!status) {
        where.status = "active"
      }
    }

    // 2. Type and Field Filters
    if (type && type !== "all") {
      where.type = type
    }
    if (field && field !== "all") {
      where.field = field
    }

    // 3. Search Filter
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { company: { contains: search } },
        { description: { contains: search } }
      ]
    }

    // 4. Public View Expiration and Filling Logic
    if (!creatorId && where.status === "active") {
      // Note: MongoDB deadline was a mix of Strings and Dates. 
      // In Prisma/MySQL, it's also a String per schema for compatibility.
      // Complex deadline parsing is harder in pure SQL but we can approximate or use application side filtering if needed.
      // For now, we'll keep it simple and filter by status and basic conditions.
      
      where.OR = [
        ...(where.OR || []),
        {
          OR: [
            { deadline: { in: [null, "", "Vô thời hạn"] } },
            // Approximation for date strings (SQL side)
            { deadline: { gte: startOfToday.toISOString().split('T')[0] } } 
          ]
        }
      ]
    }

    // Execute query with hired count
    const jobs = await prisma.job.findMany({
      where,
      orderBy: { postedAt: 'desc' },
      select: {
        id: true,
        title: true,
        company: true,
        website: true,
        companyId: true,
        logo: true,
        location: true,
        type: true,
        field: true,
        experience: true,
        education: true,
        salary: true,
        salaryMin: true,
        salaryMax: true,
        isNegotiable: true,
        deadline: true,
        postedAt: true,
        status: true,
        applicants: true,
        views: true,
        quantity: true,
        contactEmail: true,
        contactPhone: true,
        documentUrl: true,
        documentName: true,
        logoFit: true,
        creatorId: true,
        _count: {
          select: {
            applications: {
              where: { status: "hired" }
            }
          }
        }
      }
    })

    // 5. Post-filtering for hiredCount (If quantity reached, hide in public view)
    let filteredJobs = jobs
    if (!creatorId) {
      filteredJobs = jobs.filter(job => {
        const hiredCount = job._count.applications
        return job.quantity === -1 || hiredCount < job.quantity
      })
    }

    // Map id to _id for frontend compatibility if necessary, or just use id
    const mappedJobs = filteredJobs.map(job => ({
      ...job,
      _id: job.id, // Keeping _id for frontend compatibility during transition
      hiredCount: job._count.applications
    }))

    return NextResponse.json({
      success: true,
      data: {
        jobs: mappedJobs,
        total: mappedJobs.length,
      },
    })
  } catch (error) {
    console.error("Error reading jobs:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch jobs" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      title, company, companyId, location, type, field,
      experience, education,
      salary, salaryMin, salaryMax, isNegotiable,
      deadline, description, requirements, benefits,
      relatedMajors, detailedBenefits, creatorId, role, website, quantity,
      contactEmail, contactPhone, documentUrl, documentName, logoFit
    } = body

    // 1. Verify user exists
    const userExists = await prisma.user.findUnique({
      where: { id: creatorId }
    })

    if (!userExists) {
      return NextResponse.json({ error: "Tài khoản không tồn tại hoặc đã bị xóa." }, { status: 401 })
    }

    // 2. Save logo
    const logoUrl = await saveBase64Image(body.logo, "logos")

    // 3. Create Job
    const newJob = await prisma.job.create({
      data: {
        title,
        company,
        website: website || null,
        companyId: companyId || "unknown",
        logo: logoUrl || "/placeholder.svg?height=100&width=100",
        location,
        type,
        field,
        experience: experience || null,
        education: education || null,
        salary: isNegotiable ? "Thỏa thuận" : salary,
        salaryMin: salaryMin ? parseFloat(salaryMin) : null,
        salaryMax: salaryMax ? parseFloat(salaryMax) : null,
        isNegotiable: isNegotiable || false,
        deadline,
        description,
        requirements: requirements || [],
        benefits: benefits || [],
        detailedBenefits: detailedBenefits || [],
        relatedMajors: relatedMajors || [],
        status: role === 'admin' ? 'active' : 'pending',
        quantity: quantity || 1,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        documentUrl: documentUrl || null,
        documentName: documentName || null,
        logoFit: logoFit || "cover",
        creatorId: creatorId
      }
    })

    // 4. Create Notification for Admin if pending
    if (newJob.status === 'pending') {
      try {
        await prisma.notification.create({
          data: {
            targetRole: 'admin',
            type: 'job',
            title: 'Tin tuyển dụng mới cần duyệt',
            message: `${company} vừa đăng tin tuyển dụng: ${title}`,
            read: false,
            link: '/dashboard/jobs',
          }
        })
      } catch (notifError) {
        console.error("Failed to create admin notification:", notifError)
      }
    }

    return NextResponse.json({
      success: true,
      message: role === 'admin' ? "Đăng tuyển thành công!" : "Đã gửi duyệt tin tuyển dụng!",
      data: { ...newJob, _id: newJob.id },
    })
  } catch (error) {
    console.error("Post job error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to post job" },
      { status: 500 }
    )
  }
}

