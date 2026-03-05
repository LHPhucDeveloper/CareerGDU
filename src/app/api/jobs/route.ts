import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"
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

    // Default to active jobs if no status specified (for public view)
    // Admin page will likely request status=all or specific status

    const collection = await getCollection(COLLECTIONS.JOBS)

    let query: any = {}

    // Refined logic:
    // If creatorId is provided, we fetch jobs for that specific user (Employer/Admin viewing their own jobs)
    // In this case, we default to ALL statuses unless specific one is requested.

    if (creatorId) {
      // Robust matching: allow both string and ObjectId for creatorId
      if (ObjectId.isValid(creatorId)) {
        query.$or = [
          { creatorId: creatorId },
          { creatorId: new ObjectId(creatorId) }
        ]
      } else {
        query.creatorId = creatorId
      }

      if (status && status !== "all") {
        query.status = status
      }
    } else {
      // Public view or Admin All Jobs view
      if (status && status !== "all") {
        query.status = status
      } else if (!status) {
        query.status = "active"
      }
    }

    if (type && type !== "all") {
      query.type = type
    }

    if (field && field !== "all") {
      query.field = field
    }

    if (search) {
      const searchTerms = [
        { title: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchTerms }]
        delete query.$or
      } else {
        query.$or = searchTerms
      }
    }

    // Convert to aggregation for consistent processing
    const pipeline: any[] = [
      { $match: query }
    ]

    // If it's a public view (no creatorId provided), we definitely want to hide filled and expired jobs
    if (!creatorId) {
      pipeline.unshift(
        {
          $addFields: {
            normalizedDeadline: {
              $cond: {
                if: { $eq: [{ $type: "$deadline" }, "date"] },
                then: "$deadline",
                else: {
                  $cond: {
                    if: { $regexMatch: { input: { $ifNull: ["$deadline", ""] }, regex: /^\s*\d{2}\/\d{2}\/\d{4}\s*$/ } },
                    then: {
                      $dateFromString: {
                        dateString: { $trim: { input: "$deadline" } },
                        format: "%d/%m/%Y",
                        timezone: "Asia/Ho_Chi_Minh"
                      }
                    },
                    else: {
                      $cond: {
                        if: { $regexMatch: { input: { $ifNull: ["$deadline", ""] }, regex: /^\s*\d{4}-\d{2}-\d{2}\s*$/ } },
                        then: {
                          $dateFromString: {
                            dateString: { $trim: { input: "$deadline" } },
                            format: "%Y-%m-%d",
                            timezone: "Asia/Ho_Chi_Minh"
                          }
                        },
                        else: null
                      }
                    }
                  }
                }
              }
            }
          }
        }
      )

      // Add expiration check to the match stage (which is now at index 1 after unshift)
      const now = new Date()
      const startOfToday = new Date(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) + 'T00:00:00+07:00')
      const matchStage = pipeline.find(p => p.$match)
      if (matchStage) {
        // Build the OR condition for deadline correctly
        const deadlineOr = [
          { normalizedDeadline: { $gte: startOfToday } },
          { deadline: { $in: [null, "", "Vô thời hạn"] } },
          { normalizedDeadline: { $exists: false } }
        ]

        // If explicitly requesting active jobs, or no status specified (defaults to active)
        if (query.status === "active") {
          // MUST use $and to combine with existing search/$or conditions
          if (matchStage.$match.$or) {
            matchStage.$match.$and = [
              { $or: matchStage.$match.$or },
              { $or: deadlineOr }
            ]
            delete matchStage.$match.$or
          } else {
            matchStage.$match.$or = deadlineOr
          }
        }
      }

      // Add hiredCount filtering
      pipeline.push(
        {
          $lookup: {
            from: COLLECTIONS.APPLICATIONS,
            let: { jobId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$jobId", "$$jobId"] },
                      { $eq: ["$status", "hired"] }
                    ]
                  }
                }
              }
            ],
            as: "hiredApplications"
          }
        },
        {
          $addFields: {
            hiredCount: { $size: "$hiredApplications" }
          }
        },
        {
          $match: {
            $expr: {
              $or: [
                { $eq: ["$quantity", -1] },
                { $lt: ["$hiredCount", { $ifNull: ["$quantity", 1] }] }
              ]
            }
          }
        }
      )
    }

    pipeline.push(
      { $sort: { postedAt: -1 } },
      {
        $project: {
          description: 0,
          requirements: 0,
          benefits: 0,
          detailedBenefits: 0,
          relatedMajors: 0,
          hiredApplications: 0
        }
      }
    )

    const jobs = await collection.aggregate(pipeline).toArray()

    // Map _id to string
    const mappedJobs = jobs.map((job: any) => ({
      ...job,
      _id: job._id.toString()
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

    // Validate permission (Only Employer or Admin)
    // Ideally use session check here, but relying on payload for now as per context
    // if (role === 'student') return NextResponse.json({ error: "Students cannot post jobs" }, { status: 403 })

    // Security check: Verify user exists in DB
    const usersCollection = await getCollection(COLLECTIONS.USERS)
    let userExists = null
    try {
      if (ObjectId.isValid(creatorId)) {
        userExists = await usersCollection.findOne({
          $or: [
            { _id: new ObjectId(creatorId) },
            { _id: creatorId }
          ]
        })
      } else {
        userExists = await usersCollection.findOne({ _id: creatorId })
      }
    } catch (e) {
      console.error("Error verifying creatorId:", e)
    }

    if (!userExists) { // User might have been deleted
      return NextResponse.json({ error: "Tài khoản không tồn tại hoặc đã bị xóa." }, { status: 401 })
    }

    const collection = await getCollection(COLLECTIONS.JOBS)

    // Tối ưu: Lưu ảnh logo vào Local Storage thay vì Base64
    const logoUrl = await saveBase64Image(body.logo, "logos")
    const newJob = {
      title,
      company,
      website: website || null,
      companyId: companyId || "unknown", // Should link to company profile
      logo: logoUrl || "/placeholder.svg?height=100&width=100", // Default logo
      location,
      type,
      field,
      experience: experience || null,
      education: education || null,
      salary: isNegotiable ? "Thỏa thuận" : salary,
      salaryMin,
      salaryMax,
      isNegotiable,
      deadline,
      description,
      requirements: Array.isArray(requirements) ? requirements : [],
      benefits: Array.isArray(benefits) ? benefits : [],
      detailedBenefits: Array.isArray(detailedBenefits) ? detailedBenefits : [],
      relatedMajors: Array.isArray(relatedMajors) ? relatedMajors : [],

      postedAt: body.postedAt || new Date().toISOString(),
      status: role === 'admin' ? 'active' : 'pending', // Admin posts are active immediately
      applicants: 0,
      creatorId,
      views: 0,
      quantity: quantity || 1,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      documentUrl: documentUrl || null,
      documentName: documentName || null,
      logoFit: logoFit || "cover"
    }

    const result = await collection.insertOne(newJob)

    // Nếu job cần duyệt (status === 'pending'), tạo thông báo cho Admin
    if (newJob.status === 'pending') {
      try {
        const notifCollection = await getCollection(COLLECTIONS.NOTIFICATIONS)
        await notifCollection.insertOne({
          targetRole: 'admin', // Thông báo chung cho tất cả admin
          type: 'job',
          title: 'Tin tuyển dụng mới cần duyệt',
          message: `${company} vừa đăng tin tuyển dụng: ${title}`,
          read: false,
          createdAt: new Date(),
          link: '/dashboard/jobs', // Dẫn admin về trang duyệt tin
        })
      } catch (notifError) {
        console.error("Failed to create admin notification:", notifError)
        // Không block flow chính nếu lỗi tạo notif
      }
    }

    return NextResponse.json({
      success: true,
      message: role === 'admin' ? "Đăng tuyển thành công!" : "Đã gửi duyệt tin tuyển dụng!",
      data: { ...newJob, _id: result.insertedId.toString() },
    })
  } catch (error) {
    console.error("Post job error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to post job" },
      { status: 500 }
    )
  }
}
